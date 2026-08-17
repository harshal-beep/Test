import { creditsRevenue } from '@/lib/metrics';
import { parseDays } from '@/lib/scope';
import { Card, Grid, Tile, Empty, Meter, StatusPill } from '@/components/ui';
import { LineChart, HBars, StackedBars } from '@/components/charts';
import { inShort, rupees, pct, istDate, toNum } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Credits & Revenue — Q1, Q2, Q3, Q5, Q6, Q7, Q21, Q22, Q24. */
export default async function CreditsPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = parseDays(searchParams.days);
  const d = await creditsRevenue(days);

  const mrrTotal = d.mrr.reduce((s, r) => s + toNum(r.mrr_inr), 0);
  const burnTotal = d.burn.reduce((s, r) => s + toNum(r.credits_burned), 0);
  const free = toNum(d.freeVsPaid.find((r) => r.source === 'Free credits')?.credits);
  const paid = toNum(d.freeVsPaid.find((r) => r.source === 'Paid/Wallet credits')?.credits);

  return (
    <div className="flex flex-col gap-4">
      <Grid cols={4}>
        <Tile label="MRR" value={rupees(mrrTotal)} hint={`${d.mrr.length} plans active`} />
        <Tile label={`Credits burned (${days}d)`} value={inShort(burnTotal)} hint="Q1" />
        <Tile label="Free vs paid" value={`${inShort(free)} / ${inShort(paid)}`} hint="Q7 · grant vs wallet" />
        <Tile
          label="Payments to chase"
          value={String(d.failed.length)}
          tone={d.failed.length ? 'danger' : 'good'}
          hint="Q21"
        />
      </Grid>

      <Card title="Daily burn" sub={`Q1 · last ${days} days`}>
        <LineChart
          data={d.burn}
          xKey="day"
          lines={[
            { key: 'credits_burned', label: 'Credits' },
            { key: 'ma_7d', label: '7-day MA', dashed: true },
          ]}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Burn by feature" sub={`Q2 · last ${days} days`}>
          <HBars data={d.byFeature} labelKey="feature" valueKey="credits_burned" valueLabel="Credits" />
        </Card>
        <Card title="MRR by plan" sub="Q5 · normalised monthly">
          <HBars data={d.mrr} labelKey="plan" valueKey="mrr_inr" valueLabel="MRR (₹)" />
        </Card>
      </div>

      <Card title="Revenue collected by month" sub="Q6 · actual payments">
        <StackedBars
          data={d.revenue}
          xKey="month"
          series={[{ key: 'revenue_inr', label: 'Revenue ₹' }]}
          xType="month"
        />
      </Card>

      <Card title="Wallet utilisation" sub="Q3 · allocated vs used, with expiry risk">
        {d.wallets.length === 0 ? (
          <Empty message="No active wallets" />
        ) : (
          <div className="table-scroll">
            <table className="pulse">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Type</th>
                  <th className="num">Allocated</th>
                  <th className="num">Used</th>
                  <th className="num">Utilisation</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {d.wallets.slice(0, 25).map((r, i) => (
                  <tr key={i}>
                    <td className="text-ink">{String(r.organization)}</td>
                    <td>{String(r.credit_type ?? '—')}</td>
                    <td className="num">{inShort(r.allocated)}</td>
                    <td className="num">{inShort(r.used)}</td>
                    <td className="num">
                      <span className="flex items-center justify-end gap-2">
                        <Meter value={toNum(r.utilization_pct)} />
                        {pct(r.utilization_pct)}
                      </span>
                    </td>
                    <td>{istDate(r.earliest_expiry as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Workflow leaderboard" sub={`Q24 · credits by flow, last ${days} days`}>
          <HBars data={d.workflows} labelKey="flowName" valueKey="credits" valueLabel="Credits" />
        </Card>
        <Card title="Payments needing follow-up" sub="Q21 · failed, pending, processing">
          {d.failed.length === 0 ? (
            <Empty message="Nothing to chase" />
          ) : (
            <div className="table-scroll">
              <table className="pulse">
                <thead>
                  <tr>
                    <th>Organization</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {d.failed.map((r, i) => (
                    <tr key={i}>
                      <td className="text-ink">{String(r.name)}</td>
                      <td className="num">{rupees(r.amount)}</td>
                      <td>
                        <StatusPill tone={r.paymentStatus === 'FAILED' ? 'danger' : 'warn'}>
                          {String(r.paymentStatus)}
                        </StatusPill>
                      </td>
                      <td>{istDate(r.paymentDate as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
