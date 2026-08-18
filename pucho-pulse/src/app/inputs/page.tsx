import Link from 'next/link';
import { dataGaps, partnerInputs } from '@/lib/metrics';
import { Card, Empty, StatusPill } from '@/components/ui';
import { PartnerSettingsEditor } from '@/components/PartnerSettingsEditor';
import { istDate, toNum } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Inputs — the missing-data system.
 *
 * Two jobs on one page: (1) edit the data Pulse owns that production has no
 * home for (partner language, WhatsApp number, digest opt-out), and (2) name
 * every gap in upstream data WITH its consequence, so someone actually fixes
 * it rather than admiring the list.
 */
export default async function InputsPage() {
  const [gaps, partners] = await Promise.all([dataGaps(), partnerInputs()]);

  const gapCount =
    gaps.partnersNoPhone.length +
    gaps.partnersNoSettings.length +
    gaps.orgsNoFirmo.length +
    gaps.packagesNoQuota.length +
    gaps.workshopsNoWorkbook.length +
    gaps.staleAttendance.length;

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Partner settings"
        sub="Language and WhatsApp routing for every nudge and digest. Production has no home for these — Pulse stores them."
      >
        <PartnerSettingsEditor
          partners={partners.map((p) => ({
            id: String(p.id),
            name: String(p.companyName),
            tier: (p.tier as string) ?? '—',
            accounts: toNum(p.accounts),
            fallbackPhone: (p.phoneNumber as string) ?? null,
            preferredLanguage: (p.preferredLanguage as string) ?? null,
            whatsappNumber: (p.whatsappNumber as string) ?? null,
            digestEnabled: p.digestEnabled === null || p.digestEnabled === undefined ? true : Boolean(p.digestEnabled),
            notes: (p.notes as string) ?? '',
          }))}
        />
      </Card>

      <Card
        title={`Data gaps (${gapCount})`}
        sub="Each gap names what breaks while it stays empty. Fix upstream where the column exists; fix here where it doesn't."
      >
        {gapCount === 0 ? (
          <Empty message="No gaps — every send route, score input and funnel row has the data it needs." />
        ) : (
          <div className="flex flex-col gap-5">
            <GapSection
              title="Partners with no WhatsApp number"
              consequence="Hot-lead alerts and digests for their accounts go nowhere — the close loop is broken."
              rows={gaps.partnersNoPhone.map((r) => ({
                key: String(r.id),
                label: String(r.companyName),
                action: <span className="text-[12px] text-brand">add number above ↑</span>,
              }))}
            />
            <GapSection
              title="Partners with no language set"
              consequence="They receive English templates — NOTIFICATIONS.md requires Gujarati for Gujarat partners."
              rows={gaps.partnersNoSettings.map((r) => ({
                key: String(r.id),
                label: String(r.companyName),
                action: <span className="text-[12px] text-brand">set language above ↑</span>,
              }))}
            />
            <GapSection
              title="Organizations missing industry or company size"
              consequence="The firmographic prior scores them 0 of 8 PPS points — they rank lower than identical accounts with complete profiles."
              rows={gaps.orgsNoFirmo.map((r) => ({
                key: String(r.id),
                label: String(r.name),
                detail: [r.missing_industry ? 'industry' : null, r.missing_size ? 'size' : null]
                  .filter(Boolean)
                  .join(' + '),
                href: `/search?org=${r.id}`,
                action: <StatusPill tone="warn">fix in admin app</StatusPill>,
              }))}
            />
            <GapSection
              title="Plans with no credit quota"
              consequence="The suggested-plan computation skips them — a hot lead can be pitched the wrong plan."
              rows={gaps.packagesNoQuota.map((r) => ({
                key: String(r.id),
                label: String(r.title),
                action: <StatusPill tone="warn">fix in billing</StatusPill>,
              }))}
            />
            <GapSection
              title="Workshops without a workbook link"
              consequence="The 72-hour no-Office nudge sends a broken placeholder instead of the specific exercise."
              rows={gaps.workshopsNoWorkbook.map((r) => ({
                key: String(r.id),
                label: `${r.segmentName} · ${istDate(r.date as string)}`,
                href: `/workshops/${r.id}`,
                action: <span className="text-[12px] text-brand">open workshop →</span>,
              }))}
            />
            <GapSection
              title="Attendance never entered"
              consequence="The workshop's funnel understates itself and the red-row reminder has been ignored for over a day."
              rows={gaps.staleAttendance.map((r) => ({
                key: String(r.id),
                label: `${r.segmentName} · ${istDate(r.date as string)}`,
                href: `/workshops/${r.id}`,
                action: <StatusPill tone="danger">enter attendance</StatusPill>,
              }))}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function GapSection({
  title,
  consequence,
  rows,
}: {
  title: string;
  consequence: string;
  rows: { key: string; label: string; detail?: string; href?: string; action?: React.ReactNode }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-[13.5px] font-bold text-ink">
        {title} <span className="text-ink-muted">({rows.length})</span>
      </h3>
      <p className="mb-2 text-[12.5px] text-ink-muted">{consequence}</p>
      <ul className="flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate text-[13px] text-ink">
              {r.href ? (
                <Link href={r.href} className="hover:text-brand">{r.label}</Link>
              ) : (
                r.label
              )}
              {r.detail && <span className="ml-2 text-[12px] text-ink-muted">{r.detail}</span>}
            </span>
            {r.action}
          </li>
        ))}
      </ul>
    </div>
  );
}
