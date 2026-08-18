/**
 * Scheduled jobs (TRD §5). Each job is a plain async function so it can be run
 * from the CLI (`npm run job <name>`), from node-cron (jobs/schedule.ts), or
 * from a test. Every run writes a "PulseJobRun" row — TRD §5: "Every job writes
 * a run log row ... Failures alert ops."
 */
import { readQuery, readOne, writeQuery } from '../src/lib/db';
import { cuid } from '../src/lib/ids';
import { grantScope } from '../src/lib/scope';
import * as Q from '../src/lib/sql/queries';
import { fireAlert, sendWhatsApp } from '../src/lib/whatsapp';
import { suggestPlan } from '../src/lib/pps';
import { NUDGE, BENCHMARKS, GRANT_CREDITS, CREDIT_VALUE_INR } from '../config/scoring';
import { daysAgo, istDate } from '../src/lib/format';

type JobResult = Record<string, unknown>;

export async function runJob(name: string, fn: () => Promise<JobResult>): Promise<JobResult> {
  const id = cuid();
  await writeQuery(`INSERT INTO "PulseJobRun" (id, job, status) VALUES ($1, $2, 'RUNNING')`, [id, name]);
  try {
    const detail = await fn();
    await writeQuery(
      `UPDATE "PulseJobRun" SET status = 'OK', "finishedAt" = now(), detail = $2::jsonb WHERE id = $1`,
      [id, JSON.stringify(detail)],
    );
    return detail;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeQuery(
      `UPDATE "PulseJobRun" SET status = 'FAILED', "finishedAt" = now(), detail = $2::jsonb WHERE id = $1`,
      [id, JSON.stringify({ error: message })],
    );
    console.error(`[pulse:job:${name}] failed:`, message);
    throw err;
  }
}

const scope = () => grantScope();

async function plans() {
  return readQuery<{ id: string; title: string; price: number; credit: number }>(
    `SELECT id, title, price::float8 AS price, credit FROM "Package" ORDER BY credit`,
  );
}

async function partnerContact(partnerId: string | null) {
  if (!partnerId) return null;
  // ChannelPartner has "phoneNumber" (not phone) and NO language column —
  // language and the WhatsApp override live in Pulse's own settings table.
  return readOne<{ id: string; phone: string | null; companyName: string; lang: string; digest: boolean }>(
    `SELECT cp.id,
            COALESCE(s."whatsappNumber", cp."phoneNumber") AS phone,
            cp."companyName",
            COALESCE(s."preferredLanguage", 'en')          AS lang,
            COALESCE(s."digestEnabled", true)              AS digest
       FROM "ChannelPartner" cp
       LEFT JOIN "PulsePartnerSettings" s ON s."channelPartnerId" = cp.id
      WHERE cp.id = $1`,
    [partnerId],
  );
}

// ── pps-snapshot — nightly 02:00 IST ────────────────────────────────────────
/**
 * Upserts exactly one PropensityLog row per grant org per day (ALGORITHMS §1:
 * "non-negotiable from day one"). Idempotent: re-running the same night
 * overwrites its own rows rather than adding duplicates, which is what the
 * ROLLOUT M3 acceptance criterion tests.
 */
export async function ppsSnapshot(): Promise<JobResult> {
  const rows = await readQuery(Q.PPS_OFFICE, [scope(), null]);
  let written = 0;
  for (const r of rows) {
    const components = {
      depth: Number(r.pts_depth),
      officeHabit: Number(r.pts_office_habit),
      officeBreadth: Number(r.pts_office_breadth),
      officeVolume: Number(r.pts_office_volume),
      embed: Number(r.pts_embed),
      momentum: Number(r.pts_momentum),
      firmo: Number(r.pts_firmo),
      recency: Number(r.pts_recency),
    };
    await writeQuery(
      `INSERT INTO "PropensityLog" (id, "organizationId", "snapshotDate", pps, band, components)
       VALUES ($1, $2, current_date, $3, $4, $5::jsonb)
       ON CONFLICT ("organizationId", "snapshotDate")
       DO UPDATE SET pps = EXCLUDED.pps, band = EXCLUDED.band, components = EXCLUDED.components`,
      [cuid(), r.org_id, Number(r.pps), r.band, JSON.stringify(components)],
    );
    written += 1;
  }
  const movement = await readQuery(Q.BAND_MOVEMENT, [7]);
  return { scored: rows.length, written, movement: movement.at(-1) ?? null };
}

// ── hot-scan — every 30 min, 08:00–21:00 ────────────────────────────────────
/** Band-A entries, ≥700-credit crossings and exhaustion → GtmAlert + WhatsApp. */
export async function hotScan(): Promise<JobResult> {
  const [ppsRows, planList] = await Promise.all([readQuery(Q.PPS_OFFICE, [scope(), null]), plans()]);
  let bandA = 0;
  let exhausted = 0;
  let duplicates = 0;

  for (const r of ppsRows) {
    const used = Number(r.used_total);
    const isBandA = r.band === 'A' || used >= BENCHMARKS.hotThresholdCredits;
    const isExhausted = used >= GRANT_CREDITS;
    if (!isBandA && !isExhausted) continue;
    if (r.converted) continue;

    const partner = await partnerContact((r.channelPartnerId as string | null) ?? null);
    const ageDays = Math.max(1, daysAgo(r.org_created as string) ?? 1);
    const { plan, monthlyBurn } = suggestPlan(used, ageDays, planList);
    const dailyBurn = used / ageDays;
    const daysLeft = dailyBurn > 0 ? Math.max(0, Math.round((GRANT_CREDITS - used) / dailyBurn)) : null;

    const apps: string[] = [];
    if (r.has_excel) apps.push('Excel');
    if (r.has_word_ppt) apps.push('Word/PPT');

    if (isExhausted) {
      const out = await fireAlert({
        type: 'EXHAUSTED',
        organizationId: r.org_id as string,
        channelPartnerId: partner?.id ?? null,
        to: partner?.phone ?? null,
        lang: (partner?.lang as 'en' | 'gu' | 'hi') ?? 'en',
        payload: {
          org_name: r.name,
          suggested_plan: plan?.title ?? '—',
          price: plan?.price ?? 0,
          script_link: `${process.env.PULSE_BASE_URL ?? ''}/kit/${r.org_id}`,
          bonus_credits: NUDGE.bonusCarryCredits,
        },
      });
      out.fired ? (exhausted += 1) : (duplicates += 1);
      continue;
    }

    const out = await fireAlert({
      type: 'BAND_A',
      organizationId: r.org_id as string,
      channelPartnerId: partner?.id ?? null,
      to: partner?.phone ?? null,
      lang: (partner?.lang as 'en' | 'gu' | 'hi') ?? 'en',
      payload: {
        org_name: r.name,
        pps: r.pps,
        office_days: r.office_days_14,
        office_chats: r.office_chats,
        apps_list: apps.join(' + ') || 'Office',
        credits_used: used,
        days_left: daysLeft ?? '—',
        suggested_plan: plan?.title ?? '—',
        price: plan?.price ?? 0,
        monthly_burn: monthlyBurn,
        close_kit_url: `${process.env.PULSE_BASE_URL ?? ''}/kit/${r.org_id}`,
      },
    });
    out.fired ? (bandA += 1) : (duplicates += 1);
  }
  return { scanned: ppsRows.length, bandA, exhausted, duplicates };
}

// ── office-nudge — hourly ───────────────────────────────────────────────────
/** Orgs 72h past their workshop with zero Office chats → the specific-ask nudge. */
export async function officeNudge(): Promise<JobResult> {
  const rows = await readQuery(
    `SELECT o.id AS org_id, o.name, o."channelPartnerId", o."createdAt",
            w."workbookUrl", w."workshopDate"
       FROM "Organization" o
       JOIN "Workshop" w ON w.id = o."workshopId"
      WHERE o."createdAt" <= now() - ($1::text || ' hours')::interval
        AND NOT EXISTS (
          SELECT 1 FROM "ChatHistory" ch
          JOIN "OrganizationUser" ou ON ou.id = ch."organizationUserId"
          WHERE ou."organizationId" = o.id AND ch."chatType"::text LIKE 'PUCHO_OFFICE%')`,
    [String(NUDGE.officeNoUseHours)],
  );
  let fired = 0;
  for (const r of rows) {
    const partner = await partnerContact((r.channelPartnerId as string | null) ?? null);
    const out = await fireAlert({
      type: 'OFFICE_NOUSE_72H',
      organizationId: r.org_id as string,
      channelPartnerId: partner?.id ?? null,
      to: partner?.phone ?? null,
      payload: {
        org_name: r.name,
        days_ago: daysAgo(r.workshopDate as string) ?? 3,
        workbook_link: r.workbookUrl ?? `${process.env.PULSE_BASE_URL ?? ''}/workbook`,
      },
    });
    if (out.fired) fired += 1;
  }
  return { candidates: rows.length, fired };
}

// ── momentum-scan — daily 08:30 ─────────────────────────────────────────────
/** Momentum break, wrong lane, Excel-only day 14, single player day 14, zero-use ladder. */
export async function momentumScan(): Promise<JobResult> {
  const ppsRows = await readQuery(Q.PPS_OFFICE, [scope(), null]);
  const counts = { momentum: 0, wrongLane: 0, excelOnly: 0, singlePlayer: 0, zero7: 0, zero14: 0 };

  for (const r of ppsRows) {
    if (r.converted) continue;
    const partner = await partnerContact((r.channelPartnerId as string | null) ?? null);
    const to = partner?.phone ?? null;
    const orgAge = daysAgo(r.org_created as string) ?? 0;
    const used = Number(r.used_total);
    const lastOfficeDays = daysAgo(r.last_office as string | null);

    if (r.band === 'W') {
      const out = await fireAlert({
        type: 'WRONG_LANE',
        organizationId: r.org_id as string,
        channelPartnerId: partner?.id ?? null,
        to,
        payload: {
          org_name: r.name,
          chat_count: r.non_office_chats,
          booking_link: `${process.env.PULSE_BASE_URL ?? ''}/redemo/${r.org_id}`,
        },
      });
      if (out.fired) counts.wrongLane += 1;
    }

    if (lastOfficeDays !== null && lastOfficeDays >= NUDGE.momentumBreakSilentDays) {
      const out = await fireAlert({
        type: 'MOMENTUM_BREAK',
        organizationId: r.org_id as string,
        channelPartnerId: partner?.id ?? null,
        to,
        payload: {
          org_name: r.name,
          pps: r.pps,
          last_active: istDate(r.last_office as string),
          last_feature: r.has_excel ? 'Pucho Excel' : 'Pucho Office',
        },
      });
      if (out.fired) counts.momentum += 1;
    }

    if (orgAge >= NUDGE.excelOnlyDay && r.has_excel && !r.has_word_ppt && Number(r.office_chats) > 0) {
      const out = await fireAlert({
        type: 'EXCEL_ONLY',
        organizationId: r.org_id as string,
        channelPartnerId: partner?.id ?? null,
        to,
        payload: {
          org_name: r.name,
          excel_chats: r.office_chats,
          word_demo_link: `${process.env.PULSE_BASE_URL ?? ''}/demo/word`,
        },
      });
      if (out.fired) counts.excelOnly += 1;
    }

    if (orgAge >= NUDGE.singlePlayerDay && used > NUDGE.singlePlayerCredits && Number(r.credit_users) <= 1) {
      const out = await fireAlert({
        type: 'SINGLE_PLAYER',
        organizationId: r.org_id as string,
        channelPartnerId: partner?.id ?? null,
        to,
        payload: {
          org_name: r.name,
          credits: used,
          user_name: r.name,
          invite_link: `${process.env.PULSE_BASE_URL ?? ''}/invite/${r.org_id}`,
        },
      });
      if (out.fired) counts.singlePlayer += 1;
    }

    if (used === 0) {
      const [d7, d14] = NUDGE.zeroUseDays;
      const stage = orgAge >= d14 ? 'ZERO_USE_14D' : orgAge >= d7 ? 'ZERO_USE_7D' : null;
      if (stage) {
        const out = await fireAlert({
          type: stage,
          organizationId: r.org_id as string,
          channelPartnerId: partner?.id ?? null,
          to,
          payload: {
            org_name: r.name,
            date: istDate(r.org_created as string),
            stage_line:
              stage === 'ZERO_USE_14D'
                ? 'Second warning — Pucho Sales will call if this stays zero this week.'
                : 'A 15-min call re-running the workbook usually revives these.',
            workbook_link: `${process.env.PULSE_BASE_URL ?? ''}/workbook`,
          },
        });
        if (out.fired) stage === 'ZERO_USE_14D' ? (counts.zero14 += 1) : (counts.zero7 += 1);
      }
    }
  }
  return counts;
}

// ── partner-digest — Mon 09:00 ──────────────────────────────────────────────
export async function partnerDigest(): Promise<JobResult> {
  const rows = await readQuery(Q.W1_PARTNER_WEEKLY, [scope()]);
  const ppsRows = await readQuery(Q.PPS_OFFICE, [scope(), null]);
  let sent = 0;
  for (const r of rows) {
    const partner = await partnerContact(r.partner_id as string);
    const mine = ppsRows.filter((p) => p.channelPartnerId === r.partner_id);
    const hot = mine.filter((p) => p.band === 'A').map((p) => p.name);
    const wrong = mine.filter((p) => p.band === 'W').map((p) => p.name);
    const zero = mine.filter((p) => Number(p.used_total) === 0).map((p) => p.name);
    const officeActive = mine.filter((p) => Number(p.office_7d) > 0).length;

    const payload = {
      partner_name: r.partner,
      date_range: `${istDate(new Date(Date.now() - 7 * 86400000))} – ${istDate(new Date())}`,
      new_accounts: r.new_accounts_7d,
      active_week: r.active_this_week,
      office_active: officeActive,
      hot_count: hot.length,
      hot_list: hot.slice(0, 5).join(', ') || '—',
      wrong_count: wrong.length,
      wrong_list: wrong.slice(0, 5).join(', ') || '—',
      zero_count: zero.length,
      zero_list: zero.slice(0, 5).join(', ') || '—',
      converted: r.total_converted,
      rev_share: 0,
      week: new Date().toISOString().slice(0, 10),
    };

    // Digests recur, so they are ledgered with organizationId NULL and keyed by
    // partner + week inside the payload (DATA_MODEL §1 note).
    await writeQuery(
      `INSERT INTO "GtmAlert" (id, type, "organizationId", "channelPartnerId", payload, "slaHours")
       VALUES ($1, 'DIGEST', NULL, $2, $3::jsonb, NULL)`,
      [cuid(), r.partner_id, JSON.stringify(payload)],
    );
    if (partner?.phone && partner.digest) {
      await sendWhatsApp(partner.phone, 'T9', payload, (partner.lang as 'en' | 'gu' | 'hi') ?? 'en');
      sent += 1;
    }
  }
  return { partners: rows.length, sent };
}

// ── sla-escalation — hourly ─────────────────────────────────────────────────
export async function slaEscalation(): Promise<JobResult> {
  const breached = await readQuery(
    `SELECT a.id, a.type, a.payload, a."firedAt", a."slaHours",
            o.name AS organization, cp."companyName" AS partner, COALESCE(ps."whatsappNumber", cp."phoneNumber") AS partner_phone
       FROM "GtmAlert" a
       LEFT JOIN "Organization" o ON o.id = a."organizationId"
       LEFT JOIN "ChannelPartner" cp ON cp.id = a."channelPartnerId"
       LEFT JOIN "PulsePartnerSettings" ps ON ps."channelPartnerId" = cp.id
      WHERE a."ackAt" IS NULL
        AND a."escalatedAt" IS NULL
        AND a."slaHours" IS NOT NULL
        AND now() > a."firedAt" + (a."slaHours" || ' hours')::interval`,
  );
  const salesPhone = process.env.PULSE_SALES_PHONE;
  for (const a of breached) {
    if (salesPhone) {
      await sendWhatsApp(salesPhone, 'SLA_BREACH', {
        alert_type: a.type,
        organization: a.organization,
        partner: a.partner,
        hours: a.slaHours,
        fired_at: istDate(a.firedAt as string),
      });
    }
    await writeQuery(`UPDATE "GtmAlert" SET "escalatedAt" = now() WHERE id = $1`, [a.id]);
  }
  return { escalated: breached.length };
}

// ── attendance-reminder — daily 18:00 ───────────────────────────────────────
export async function attendanceReminder(): Promise<JobResult> {
  const rows = await readQuery(
    `SELECT w.id, w."segmentName", w."deliveredBy", u."phoneNumber", u."firstName"
       FROM "Workshop" w
       LEFT JOIN "User" u ON u.id = w."deliveredBy"
      WHERE w.status = 'SCHEDULED'
        AND w."workshopDate"::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
  );
  let sent = 0;
  for (const r of rows) {
    if (!r.phoneNumber) continue;
    await sendWhatsApp(r.phoneNumber as string, 'ATTENDANCE_REMINDER', {
      workshop_id: r.id,
      segment: r.segmentName,
      link: `${process.env.PULSE_BASE_URL ?? ''}/workshops`,
    });
    sent += 1;
  }
  return { workshopsToday: rows.length, remindersSent: sent };
}

// ── calibration report (M6) ─────────────────────────────────────────────────
/** Band monotonicity + aha lift, computed from PropensityLog alone. */
export async function calibrationReport(): Promise<JobResult> {
  const [byBand, aha, quintiles, economics] = await Promise.all([
    readQuery(
      `WITH latest AS (
         SELECT DISTINCT ON ("organizationId") "organizationId", band
           FROM "PropensityLog" ORDER BY "organizationId", "snapshotDate" DESC)
       SELECT l.band,
              COUNT(*) AS accounts,
              ROUND(100.0 * COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM "OrganizationPackage" op
                 WHERE op."organizationId" = l."organizationId" AND op.status = 'Active'))
                / NULLIF(COUNT(*),0), 1) AS conversion_pct
         FROM latest l GROUP BY 1 ORDER BY 1`,
    ),
    readQuery(Q.AHA_OFFICE_48H, [scope()]),
    readQuery(Q.CALIBRATION_QUINTILES, [scope()]),
    readOne(Q.G5_GTM_ECONOMICS, [scope(), CREDIT_VALUE_INR]),
  ]);
  const rateOf = (band: string) => Number(byBand.find((r) => r.band === band)?.conversion_pct ?? 0);
  return {
    byBand,
    quintiles,
    aha,
    economics,
    monotonic: rateOf('A') >= rateOf('B') && rateOf('B') >= rateOf('C') && rateOf('C') >= rateOf('D'),
    aOverD: rateOf('D') > 0 ? rateOf('A') / rateOf('D') : null,
  };
}

export const JOBS = {
  'pps-snapshot': ppsSnapshot,
  'hot-scan': hotScan,
  'office-nudge': officeNudge,
  'momentum-scan': momentumScan,
  'partner-digest': partnerDigest,
  'sla-escalation': slaEscalation,
  'attendance-reminder': attendanceReminder,
  'calibration-report': calibrationReport,
} as const;

export type JobName = keyof typeof JOBS;
