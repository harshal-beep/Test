import { listWorkshops } from '@/lib/workshops';
import { workshopFunnel } from '@/lib/metrics';
import { readQuery } from '@/lib/db';
import { Card, Grid, Tile, Empty, StatusPill } from '@/components/ui';
import { WorkshopCreator } from '@/components/WorkshopCreator';
import { AttendanceEntry } from '@/components/AttendanceEntry';
import { inShort, pct, istDate, toNum } from '@/lib/format';
import { BENCHMARKS } from '@config/scoring';

export const dynamic = 'force-dynamic';

/**
 * Workshop admin — create → QR → attendance → funnel (PRD F2).
 * No prototype exists for this view, so it follows the card/table patterns of
 * the others (UI_SPEC §2). Workshops delivered today with no attendance entered
 * render red, which is the whole point of the "unfilled attendance = red row"
 * rule.
 */
export default async function WorkshopsPage() {
  const [workshops, funnelData, partners] = await Promise.all([
    listWorkshops(),
    workshopFunnel(),
    readQuery(`SELECT id, "companyName" FROM "ChannelPartner" WHERE status = 'Active' ORDER BY "companyName"`),
  ]);

  const funnelById = new Map(funnelData.funnel.map((f) => [String(f.workshop_id), f]));
  const today = new Date().toISOString().slice(0, 10);
  const missingAttendance = workshops.filter(
    (w) => w.status === 'SCHEDULED' && String(w.workshopDate).slice(0, 10) <= today,
  );

  const totals = funnelData.funnel.reduce(
    (acc, f) => ({
      invited: acc.invited + toNum(f.invited),
      attended: acc.attended + toNum(f.attended),
      accounts: acc.accounts + toNum(f.accounts_created),
      converted: acc.converted + toNum(f.converted_paid),
    }),
    { invited: 0, attended: 0, accounts: 0, converted: 0 },
  );

  return (
    <div className="flex flex-col gap-4">
      <Grid cols={4}>
        <Tile label="Workshops" value={String(workshops.length)} hint={`${totals.invited} invited`} />
        <Tile label="Attended" value={inShort(totals.attended)} hint={pct(totals.invited ? (totals.attended / totals.invited) * 100 : 0)} />
        <Tile label="Accounts created" value={inShort(totals.accounts)} hint="via QR registration" />
        <Tile
          label="Attendance missing"
          value={String(missingAttendance.length)}
          tone={missingAttendance.length ? 'danger' : 'good'}
          hint="delivered but not filled in"
        />
      </Grid>

      <WorkshopCreator partners={partners.map((p) => ({ id: String(p.id), name: String(p.companyName) }))} />

      <Card title="Workshops" sub="G1 funnel: invited → attended → accounts → activated 7d → engaged ≥300 → converted">
        {workshops.length === 0 ? (
          <Empty message="No workshop data yet — create the first workshop" />
        ) : (
          <div className="table-scroll">
            <table className="pulse">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Segment</th>
                  <th>Campaign</th>
                  <th>Partner</th>
                  <th className="num">Invited</th>
                  <th className="num">Attended</th>
                  <th className="num">Accounts</th>
                  <th className="num">Activated 7d</th>
                  <th className="num">Engaged ≥300</th>
                  <th className="num">Converted</th>
                  <th className="num">Conv %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {workshops.map((w) => {
                  const f = funnelById.get(String(w.id));
                  const needsAttendance =
                    w.status === 'SCHEDULED' && String(w.workshopDate).slice(0, 10) <= today;
                  return (
                    <tr key={String(w.id)} className={needsAttendance ? 'bg-[color:var(--danger)]/10' : ''}>
                      <td>{istDate(w.workshopDate as string)}</td>
                      <td className="text-ink">{String(w.segmentName)}</td>
                      <td>{String(w.campaignTag ?? '—')}</td>
                      <td>{String(w.partner ?? '—')}</td>
                      <td className="num">{inShort(w.invitedCount)}</td>
                      <td className="num">{inShort(w.attendedCount)}</td>
                      <td className="num">{inShort(f?.accounts_created ?? 0)}</td>
                      <td className="num">{inShort(f?.activated_7d ?? 0)}</td>
                      <td className="num">{inShort(f?.engaged_300plus ?? 0)}</td>
                      <td className="num">{inShort(f?.converted_paid ?? 0)}</td>
                      <td className="num">{f?.conversion_pct === null || f?.conversion_pct === undefined ? '—' : pct(f.conversion_pct)}</td>
                      <td>
                        {needsAttendance ? (
                          <AttendanceEntry workshopId={String(w.id)} />
                        ) : (
                          <StatusPill tone={w.status === 'DELIVERED' ? 'good' : w.status === 'CANCELLED' ? 'danger' : 'neutral'}>
                            {String(w.status)}
                          </StatusPill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Campaign performance" sub="C1 · all workshops under one campaign tag">
          {funnelData.campaigns.length === 0 ? (
            <Empty message="No campaign-tagged workshops yet" />
          ) : (
            <div className="table-scroll">
              <table className="pulse">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th className="num">Accounts</th>
                    <th className="num">Zero-use</th>
                    <th className="num">Avg credits</th>
                    <th className="num">Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {funnelData.campaigns.map((r, i) => (
                    <tr key={i}>
                      <td className="text-ink">{String(r.campaign ?? '—')}</td>
                      <td className="num">{inShort(r.accounts)}</td>
                      <td className="num">{pct(r.zero_use_pct)}</td>
                      <td className="num">{inShort(r.avg_credits)}</td>
                      <td className="num">{pct(r.conversion_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="Segment scoreboard"
          sub={`G2 · kill line at <${BENCHMARKS.segmentKillLinePct}% conversion after ${BENCHMARKS.segmentKillMinWorkshops} workshops`}
        >
          {funnelData.segments.length === 0 ? (
            <Empty message="No workshop accounts yet" />
          ) : (
            <div className="table-scroll">
              <table className="pulse">
                <thead>
                  <tr>
                    <th>Segment</th>
                    <th className="num">Accounts</th>
                    <th className="num">Avg credits</th>
                    <th className="num">Engaged %</th>
                    <th className="num">Conv %</th>
                    <th>Call</th>
                  </tr>
                </thead>
                <tbody>
                  {funnelData.segments.map((r, i) => {
                    const conv = toNum(r.conversion_pct);
                    const workshopsRun = funnelData.funnel.filter((f) => f.segment === r.segment).length;
                    const kill =
                      workshopsRun >= BENCHMARKS.segmentKillMinWorkshops && conv < BENCHMARKS.segmentKillLinePct;
                    return (
                      <tr key={i}>
                        <td className="text-ink">{String(r.segment ?? '—')}</td>
                        <td className="num">{inShort(r.accounts)}</td>
                        <td className="num">{inShort(r.avg_credits_used)}</td>
                        <td className="num">{pct(r.engaged_pct)}</td>
                        <td className="num">{pct(r.conversion_pct)}</td>
                        <td>
                          <StatusPill tone={kill ? 'danger' : conv >= 3 ? 'good' : 'neutral'}>
                            {kill ? 'KILL' : conv >= 3 ? 'DOUBLE' : 'HOLD'}
                          </StatusPill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
