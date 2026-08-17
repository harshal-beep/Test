import { partnersFunnel } from '@/lib/metrics';
import { parseDays } from '@/lib/scope';
import { Card, Grid, Tile, Empty, StatusPill } from '@/components/ui';
import { HBars, StackedBars } from '@/components/charts';
import { inShort, pct, istDate, toNum } from '@/lib/format';
import { partnerGrade } from '@config/scoring';

export const dynamic = 'force-dynamic';

/** Partners & Funnel — Q16, Q17, Q18, Q19 + A2 health score. */
export default async function PartnersPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = parseDays(searchParams.days);
  const d = await partnersFunnel(days);
  const accounts = d.scorecard.reduce((s, r) => s + toNum(r.orgs_onboarded), 0);

  return (
    <div className="flex flex-col gap-4">
      <Grid cols={4}>
        <Tile label="Active partners" value={String(d.scorecard.length)} hint="Q16" />
        <Tile label="Accounts onboarded" value={inShort(accounts)} />
        <Tile label="Waitlist → signup" value={pct(d.waitlist?.conversion_pct)} hint={`Q17 · ${inShort(d.waitlist?.waitlist_total)} on waitlist`} />
        <Tile label="Open leads" value={inShort(d.leads.reduce((s, r) => s + toNum(r.leads), 0))} hint="Q18" />
      </Grid>

      <Card title="Partner health" sub="A2 · engagement 30 + conversion 30 + zero-use control 20 + velocity 20">
        {d.health.length === 0 ? (
          <Empty message="No partner has grant accounts yet" />
        ) : (
          <div className="table-scroll">
            <table className="pulse">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th className="num">Accounts</th>
                  <th className="num">Engagement</th>
                  <th className="num">Conversion</th>
                  <th className="num">Zero-use</th>
                  <th className="num">Velocity</th>
                  <th className="num">Score</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {d.health.map((r, i) => {
                  const grade = partnerGrade(toNum(r.health_score));
                  return (
                    <tr key={i}>
                      <td className="text-ink">
                        <a className="hover:text-brand" href={`/search?type=partner&q=${encodeURIComponent(String(r.partner))}`}>
                          {String(r.partner)}
                        </a>
                      </td>
                      <td className="num">{inShort(r.accounts)}</td>
                      <td className="num">{toNum(r.engagement_pts).toFixed(1)}/30</td>
                      <td className="num">{toNum(r.conversion_pts).toFixed(1)}/30</td>
                      <td className="num">{toNum(r.zero_use_pts).toFixed(1)}/20</td>
                      <td className="num">{toNum(r.velocity_pts).toFixed(1)}/20</td>
                      <td className="num font-bold text-ink">{inShort(r.health_score)}</td>
                      <td>
                        <StatusPill tone={grade === 'A' ? 'good' : grade === 'B' ? 'neutral' : grade === 'C' ? 'warn' : 'danger'}>
                          {grade}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Partner scorecard" sub={`Q16 · credits burned by their accounts, last ${days} days`}>
          <HBars data={d.scorecard} labelKey="partner" valueKey="credits_burned_30d" valueLabel="Credits" />
        </Card>
        <Card title="SDR funnel" sub="Q18 · lead status distribution">
          <HBars data={d.leads} labelKey="status" valueKey="leads" valueLabel="Leads" colorByIndex />
        </Card>
      </div>

      <Card title="Contact-sales pipeline" sub="Q19 · enquiries by month and company size">
        {d.contactSales.length === 0 ? (
          <Empty message="No enquiries yet" />
        ) : (
          <StackedBars
            data={Object.values(
              d.contactSales.reduce<Record<string, Record<string, unknown>>>((acc, r) => {
                const key = String(r.month);
                acc[key] ??= { month: r.month };
                acc[key][String(r.companySize ?? 'Unknown')] = r.enquiries;
                return acc;
              }, {}),
            )}
            xKey="month"
            series={[...new Set(d.contactSales.map((r) => String(r.companySize ?? 'Unknown')))].map((s) => ({
              key: s,
              label: s,
            }))}
            xType="month"
          />
        )}
      </Card>
    </div>
  );
}
