/**
 * WhatsApp adapter + GtmAlert ledger (NOTIFICATIONS.md).
 *
 * Every partner-facing send goes through `fireAlert`, never through
 * `sendWhatsApp` directly, so that dedupe, quiet hours, the per-trigger kill
 * switch, the SLA clock and the audit row all happen on one path.
 */
import { readOne, writeQuery } from './db';
import { cuid } from './ids';
import { QUIET_HOURS, TRIGGERS, type AlertType } from '../../config/scoring';

export type Lang = 'en' | 'gu' | 'hi';

export interface SendResult {
  ok: boolean;
  queued?: boolean;
  reason?: string;
  providerId?: string;
}

/**
 * The adapter interface from TRD §2. In production this posts to the existing
 * Pucho WhatsApp integration; here it logs, so jobs and tests exercise the full
 * path (dedupe, ledger, SLA) without sending real messages.
 */
export async function sendWhatsApp(
  to: string,
  template: string,
  params: Record<string, unknown>,
  lang: Lang = 'en',
): Promise<SendResult> {
  const endpoint = process.env.WHATSAPP_API_URL;
  if (!endpoint) {
    console.info(`[pulse:whatsapp:dry-run] ${template}/${lang} → ${to}`, params);
    return { ok: true, providerId: 'dry-run' };
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN ?? ''}`,
    },
    body: JSON.stringify({ to, template, language: lang, params }),
  });
  if (!res.ok) return { ok: false, reason: `provider ${res.status}` };
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, providerId: body.id };
}

/** IST hour, regardless of where the process runs. */
export function istHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hour12: false,
    }).format(now),
  );
}

/** No partner sends before 08:00 or after 21:00 IST; real-time triggers queue. */
export function inQuietHours(now: Date = new Date()): boolean {
  const h = istHour(now);
  return h >= QUIET_HOURS.startHour || h < QUIET_HOURS.endHour;
}

export interface FireAlertInput {
  type: AlertType;
  organizationId?: string | null;
  channelPartnerId?: string | null;
  to?: string | null;
  lang?: Lang;
  payload: Record<string, unknown>;
}

export type FireOutcome =
  | { fired: true; alertId: string; queued: boolean }
  | { fired: false; reason: 'duplicate' | 'kill-switch' | 'no-recipient' };

/**
 * Ledger a trigger and send it.
 *
 * Dedupe is the database's job, not a pre-check: the partial unique index
 * uq_gtmalert_type_org makes the second INSERT for the same (type, org) fail,
 * so two scan workers racing on the same threshold crossing still produce
 * exactly one alert (TRD §9 dedupe test).
 */
export async function fireAlert(input: FireAlertInput): Promise<FireOutcome> {
  const trigger = TRIGGERS[input.type];
  if (!trigger.enabled) return { fired: false, reason: 'kill-switch' };

  const id = cuid();
  const rows = await writeQuery<{ id: string }>(
    `INSERT INTO "GtmAlert" (id, type, "organizationId", "channelPartnerId", payload, "slaHours")
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      id,
      input.type,
      input.organizationId ?? null,
      input.channelPartnerId ?? null,
      JSON.stringify(input.payload),
      trigger.slaHours,
    ],
  );
  if (!rows.length) return { fired: false, reason: 'duplicate' };

  if (!input.to) return { fired: true, alertId: id, queued: false };

  if (inQuietHours()) {
    // Left un-sent on purpose: the hot-scan job re-reads un-sent alerts after
    // 08:00 (payload.sentAt stays absent until then).
    return { fired: true, alertId: id, queued: true };
  }

  const result = await sendWhatsApp(input.to, trigger.template, input.payload, input.lang ?? 'en');
  if (result.ok) {
    await writeQuery(
      `UPDATE "GtmAlert" SET payload = payload || jsonb_build_object('sentAt', now()::text, 'providerId', $2::text)
        WHERE id = $1`,
      [id, result.providerId ?? null],
    );
  }
  return { fired: true, alertId: id, queued: false };
}

export async function ackAlert(alertId: string, by = 'partner'): Promise<boolean> {
  const rows = await writeQuery<{ id: string }>(
    `UPDATE "GtmAlert"
        SET "ackAt" = now(),
            payload = COALESCE(payload,'{}'::jsonb) || jsonb_build_object('ackBy', $2::text)
      WHERE id = $1 AND "ackAt" IS NULL
      RETURNING id`,
    [alertId, by],
  );
  return rows.length > 0;
}

export async function alertById(alertId: string) {
  return readOne(`SELECT * FROM "GtmAlert" WHERE id = $1`, [alertId]);
}

// ── Message templates (NOTIFICATIONS §2 — English masters) ──────────────────

type Params = Record<string, unknown>;
const p = (params: Params, key: string) => String(params[key] ?? `{${key}}`);

export const TEMPLATES: Record<string, (params: Params) => string> = {
  T1: (v) =>
    `🔥 HOT LEAD — ${p(v, 'org_name')}\n` +
    `Score ${p(v, 'pps')}/100. ${p(v, 'office_days')} days in Pucho Office this fortnight, ${p(v, 'office_chats')} sessions (${p(v, 'apps_list')}).\n` +
    `Credits: ${p(v, 'credits_used')}/1000 — runs dry in ~${p(v, 'days_left')} days at this pace.\n` +
    `Right plan (from their usage): ${p(v, 'suggested_plan')} @ ₹${p(v, 'price')}/mo.\n` +
    `Close kit attached. Best time to call is NOW.\nReply ✅ once contacted.`,
  T2: (v) =>
    `⛽ ${p(v, 'org_name')} has used ALL 1,000 free credits — value proven, urgency at peak.\n` +
    `Offer (7 days only): convert now and 200 bonus credits carry into their plan.\n` +
    `Suggested plan: ${p(v, 'suggested_plan')} @ ₹${p(v, 'price')}/mo. Script: ${p(v, 'script_link')}\n` +
    `Reply ✅ once contacted.`,
  T3: (v) =>
    `📋 ${p(v, 'org_name')} attended the Pucho Office workshop ${p(v, 'days_ago')} days ago but hasn't opened Office yet.\n` +
    `One specific ask works best: "Open your sales sheet in Pucho Excel and ask it these 3 questions" — workbook page 3: ${p(v, 'workbook_link')}`,
  T4: (v) =>
    `⚠️ ${p(v, 'org_name')} went quiet — they were at ${p(v, 'pps')} and climbing, last Office use ${p(v, 'last_active')}.\n` +
    `One call now beats ten later. Their last activity: ${p(v, 'last_feature')}.`,
  T5: (v) =>
    `🔁 ${p(v, 'org_name')} is active in Pucho (${p(v, 'chat_count')} chats) but has NOT touched Pucho Office.\n` +
    `They're using the wrong product for what they bought into. Don't pitch a plan yet —\n` +
    `book a 15-minute Office re-demo ON THEIR FILES this week: ${p(v, 'booking_link')}`,
  T6: (v) =>
    `📈 ${p(v, 'org_name')} is strong in Pucho Excel (${p(v, 'excel_chats')} sessions) but hasn't tried Word/PPT.\n` +
    `Second-app users convert far better. Send the 2-min Word demo: ${p(v, 'word_demo_link')}`,
  T7: (v) =>
    `👥 ${p(v, 'org_name')}: ${p(v, 'credits')} credits used but still ONE user. Team accounts convert 3–4× solo.\n` +
    `Ask ${p(v, 'user_name')} to add one colleague — invite link: ${p(v, 'invite_link')}`,
  T8: (v) =>
    `😴 ${p(v, 'org_name')} signed up on ${p(v, 'date')} — zero credits used.\n` +
    `${p(v, 'stage_line')}\nWorkbook: ${p(v, 'workbook_link')}`,
  T9: (v) =>
    `🟣 Pucho Weekly — ${p(v, 'partner_name')} · ${p(v, 'date_range')}\n` +
    `📥 New: ${p(v, 'new_accounts')} | ⚡ Active: ${p(v, 'active_week')} | 🏢 In Office: ${p(v, 'office_active')}\n` +
    `🔥 HOT — call today (${p(v, 'hot_count')}): ${p(v, 'hot_list')}\n` +
    `🔁 Wrong lane (${p(v, 'wrong_count')}): ${p(v, 'wrong_list')}\n` +
    `😴 Zero-use (${p(v, 'zero_count')}): ${p(v, 'zero_list')}\n` +
    `✅ Converted total: ${p(v, 'converted')} | 💰 Your rev share this month: ₹${p(v, 'rev_share')}\n` +
    `Pucho Toh Sahi!`,
  T10: (v) =>
    `🏆 ${p(v, 'month')} scorecard — ${p(v, 'partner_name')}\n` +
    `Health: ${p(v, 'score')}/100 (Grade ${p(v, 'grade')}) — Engagement ${p(v, 'e')}/30 · Conversion ${p(v, 'c')}/30 · Zero-use ${p(v, 'z')}/20 · Speed ${p(v, 'v')}/20\n` +
    `Rank: #${p(v, 'rank')} of ${p(v, 'total_partners')}. ${p(v, 'up_or_down_line')}\n` +
    `Focus for ${p(v, 'next_month')}: ${p(v, 'weakest_component_advice')}`,
};

export function renderTemplate(template: string, params: Params): string {
  const fn = TEMPLATES[template];
  return fn ? fn(params) : `[${template}] ${JSON.stringify(params)}`;
}
