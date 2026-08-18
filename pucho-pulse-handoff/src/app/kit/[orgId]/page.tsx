import { notFound } from 'next/navigation';
import { readOne, readQuery } from '@/lib/db';
import { grantScope } from '@/lib/scope';
import { PPS_OFFICE } from '@/lib/sql/queries';
import { suggestPlan } from '@/lib/pps';
import { inShort, rupees, istDate, toNum, daysAgo } from '@/lib/format';
import { GRANT_CREDITS, NUDGE, BAND_ACTION, type PpsBand } from '@config/scoring';

export const dynamic = 'force-dynamic';

/**
 * Close kit — one page a partner can read on a phone before dialling, generated
 * from the account's own usage (PRD F8).
 *
 * It is HTML by design: the same route is what the PDF step renders. TRD §31
 * calls for Playwright/Chromium HTML→PDF; that renderer is not wired up in this
 * milestone, so the WhatsApp alert links to this page rather than attaching a
 * PDF. Adding the PDF is a print of this exact route, not a second template.
 */
export default async function CloseKitPage({ params }: { params: { orgId: string } }) {
  const row = await readOne(PPS_OFFICE, [grantScope(), params.orgId]);
  if (!row) notFound();

  const plans = await readQuery<{ id: string; title: string; price: number; credit: number }>(
    `SELECT id, title, price::float8 AS price, credit FROM "Package" ORDER BY credit`,
  );

  const used = toNum(row.used_total);
  const ageDays = Math.max(1, daysAgo(row.org_created as string) ?? 1);
  const { plan, monthlyBurn } = suggestPlan(used, ageDays, plans);
  const dailyBurn = used / ageDays;
  const daysLeft = dailyBurn > 0 ? Math.max(0, Math.round((GRANT_CREDITS - used) / dailyBurn)) : null;

  const officeChats = toNum(row.office_chats);
  const officeDays = toNum(row.office_days_14);
  // Deliberately conservative: ~12 minutes saved per Office session. Stated as
  // an estimate on the page, because a partner quoting a fake number once is a
  // partner nobody believes twice.
  const hoursSaved = Math.round((officeChats * 12) / 60);

  const apps = [row.has_excel ? 'Excel' : null, row.has_word_ppt ? 'Word/PPT' : null].filter(Boolean);

  return (
    <div className="mx-auto max-w-[720px]">
      <section className="card">
        <p className="tile-label">Close kit</p>
        <h1 className="text-[28px] font-extrabold leading-tight text-ink">{String(row.name)}</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          {String(row.industry ?? 'Industry not set')} · {String(row.companySize ?? '?')} people · PPS{' '}
          {inShort(row.pps)}/100 (Band {String(row.band)})
        </p>

        <h2 className="mt-6 text-[16px] font-bold text-ink">The usage story</h2>
        <p className="mt-1 text-[14px] text-ink-soft">
          In {ageDays} days they have used <strong>{inShort(used)} of {GRANT_CREDITS}</strong> free credits, across{' '}
          <strong>{inShort(officeChats)} Pucho Office sessions</strong> on {officeDays} separate days in the last
          fortnight{apps.length ? ` (${apps.join(' and ')})` : ''}
          {row.uses_own_docs ? ', working on their own documents' : ''}
          {toNum(row.office_users) >= 2 ? `, with ${inShort(row.office_users)} people in the account` : ''}.
        </p>

        <h2 className="mt-6 text-[16px] font-bold text-ink">Time back</h2>
        <p className="mt-1 text-[14px] text-ink-soft">
          At a conservative 12 minutes saved per session, that is roughly <strong>{hoursSaved} hours</strong> already
          returned to the team. Ask them which of those hours they would want back if the credits stopped.
        </p>

        <h2 className="mt-6 text-[16px] font-bold text-ink">The right plan</h2>
        <p className="mt-1 text-[14px] text-ink-soft">
          Their burn works out to about <strong>{inShort(monthlyBurn)} credits a month</strong>. The smallest plan that
          covers that is <strong>{plan?.title ?? 'the largest plan'}</strong>
          {plan ? ` at ${rupees(plan.price, false)}/month (${inShort(plan.credit)} credits)` : ''}.
        </p>

        <h2 className="mt-6 text-[16px] font-bold text-ink">Urgency</h2>
        <p className="mt-1 text-[14px] text-ink-soft">
          {used >= GRANT_CREDITS
            ? 'The grant is fully used. The value is proven and the tools stop working today — this is the peak moment.'
            : daysLeft !== null
              ? `At this pace the grant runs dry in about ${daysLeft} days (${inShort(GRANT_CREDITS - used)} credits left).`
              : 'The grant has not started burning yet.'}
        </p>

        <h2 className="mt-6 text-[16px] font-bold text-ink">The offer</h2>
        <p className="mt-1 text-[14px] text-ink-soft">
          Convert within {NUDGE.bonusCarryWindowDays} days and <strong>{NUDGE.bonusCarryCredits} bonus credits</strong>{' '}
          carry into the plan.
        </p>

        <p className="mt-6 rounded-lg bg-surface-2 p-3 text-[13px] text-ink-soft">
          <strong>Action:</strong> {BAND_ACTION[String(row.band) as PpsBand]}
        </p>
        <p className="mt-3 text-[12px] text-ink-muted">
          Generated {istDate(new Date())} from this account&apos;s own usage. Numbers come from the same queries as the
          Pulse dashboard.
        </p>
      </section>
    </div>
  );
}
