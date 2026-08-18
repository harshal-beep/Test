import Link from 'next/link';
import { notFound } from 'next/navigation';
import { workshopDetail } from '@/lib/metrics';
import { qrDataUrl, registrationUrl } from '@/lib/workshops';
import { Card, Grid, Tile, Empty, StatusPill, BandPill, ConfidenceMeter } from '@/components/ui';
import { FunnelBars } from '@/components/charts';
import { inShort, pct, istDate, istDateTime, toNum } from '@/lib/format';
import { AttendanceEntry } from '@/components/AttendanceEntry';
import { AttendeeEntry } from '@/components/AttendeeEntry';

export const dynamic = 'force-dynamic';

/**
 * One workshop, everything it produced (audit F7): its funnel with stage
 * drop-offs, every account it created with band + next state, and the QR for
 * re-sharing. This is SA's day-after check and the founder's "show me that
 * workshop" in one place.
 */
export default async function WorkshopDetailPage({ params }: { params: { id: string } }) {
  const d = await workshopDetail(params.id);
  if (!d.workshop) notFound();
  const w = d.workshop;
  const f = d.funnel;

  const token = w.registrationToken as string | null;
  const [qr, url] = token ? [await qrDataUrl(token), registrationUrl(token)] : [null, null];

  const needsAttendance = w.status === 'SCHEDULED' && String(w.workshopDate) <= new Date().toISOString();
  const hot = d.accounts.filter((a) => a.band === 'A' && !a.converted);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/workshops" className="text-[13px] text-ink-muted hover:text-brand">← All workshops</Link>
      </div>

      <Card
        title={`${String(w.segmentName)} — ${istDate(w.workshopDate as string)}`}
        sub={`${w.partner ? `with ${w.partner} · ` : ''}${w.campaignTag ?? 'no campaign tag'}`}
        right={
          needsAttendance ? (
            <AttendanceEntry workshopId={String(w.id)} />
          ) : (
            <StatusPill tone={w.status === 'DELIVERED' ? 'good' : w.status === 'CANCELLED' ? 'danger' : 'neutral'}>
              {String(w.status)}
            </StatusPill>
          )
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div>
            <FunnelBars
              stages={[
                { label: 'Invited', value: toNum(w.invitedCount) },
                { label: 'Attended', value: toNum(w.attendedCount) },
                { label: 'Accounts', value: toNum(f?.accounts_created) },
                { label: 'Activated 7d', value: toNum(f?.activated_7d) },
                { label: 'Engaged ≥300', value: toNum(f?.engaged_300plus) },
                { label: 'Converted', value: toNum(f?.converted_paid) },
              ]}
            />
            <p className="mt-3 text-[13px] text-ink-soft">
              {toNum(f?.converted_paid) > 0 ? (
                <>This workshop has <strong className="text-good">{inShort(f?.converted_paid)} paying client{toNum(f?.converted_paid) > 1 ? 's' : ''}</strong> ({pct(f?.conversion_pct)} of accounts).</>
              ) : hot.length > 0 ? (
                <>No conversion yet, but <strong className="text-good">{hot.length} account{hot.length > 1 ? 's are' : ' is'} Band A</strong> — the close window is open now.</>
              ) : (
                <>No conversion yet and nothing in Band A — the follow-up ladder below is what moves this.</>
              )}
            </p>
          </div>
          {qr && (
            <details className="min-w-[200px]">
              <summary className="cursor-pointer text-[12.5px] text-ink-muted hover:text-brand">
                Self-service QR (optional)
              </summary>
              <div className="mt-2 flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Registration QR" className="h-32 w-32 rounded-lg border border-line" />
                <code className="max-w-[190px] break-all text-center text-[10.5px] text-ink-muted">{url}</code>
                <p className="max-w-[200px] text-center text-[11.5px] text-ink-muted">
                  Built-in fallback. Once Pucho&apos;s own registration system is live it posts to the Pulse
                  webhook instead and this can be ignored.
                </p>
              </div>
            </details>
          )}
        </div>
      </Card>

      <Grid cols={4}>
        <Tile label="Accounts" value={inShort(f?.accounts_created)} hint="from this workshop" />
        <Tile label="Avg credits (14d)" value={inShort(f?.avg_credits_14d)} hint="per account" />
        <Tile label="Band A now" value={String(hot.length)} tone={hot.length ? 'good' : undefined} hint="unconverted hot leads" />
        <Tile label="Conversion" value={f?.conversion_pct === null || f?.conversion_pct === undefined ? '—' : pct(f.conversion_pct)} />
      </Grid>

      <AttendeeEntry workshopId={String(w.id)} />

      <Card
        title="Every account this workshop produced"
        sub="Sorted by grant burn. Tap through for the 360 and close kit."
        right={!w.workbookUrl ? <StatusPill tone="warn">no workbook link</StatusPill> : undefined}
      >
        {d.accounts.length === 0 ? (
          <Empty message="No accounts yet — add the attendees above and each one gets its 1,000-credit grant" />
        ) : (
          <div className="table-scroll">
            <table className="pulse">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th className="num">Credits</th>
                  <th style={{ minWidth: 120 }}>PPS</th>
                  <th>Band</th>
                  <th>Joined</th>
                  <th>Last active</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {d.accounts.map((a) => (
                  <tr key={String(a.org_id)}>
                    <td className="text-ink">
                      <Link href={`/search?org=${a.org_id}`} className="hover:text-brand">{String(a.name)}</Link>
                    </td>
                    <td className="num">{inShort(a.credits)}</td>
                    <td>{a.pps !== null && a.pps !== undefined ? <ConfidenceMeter score={toNum(a.pps)} band={String(a.band ?? 'D')} /> : <span className="text-[12px] text-ink-muted">not scored yet</span>}</td>
                    <td>{a.band ? <BandPill band={String(a.band)} /> : '—'}</td>
                    <td>{istDate(a.joined as string)}</td>
                    <td>{a.last_active ? istDateTime(a.last_active as string) : 'never'}</td>
                    <td>
                      {a.converted ? (
                        <StatusPill tone="good">PAYING</StatusPill>
                      ) : a.activated_7d ? (
                        <StatusPill tone="neutral">active</StatusPill>
                      ) : (
                        <StatusPill tone="warn">never landed</StatusPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
