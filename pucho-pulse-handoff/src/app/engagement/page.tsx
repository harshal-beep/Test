import { engagement } from '@/lib/metrics';
import { parseDays } from '@/lib/scope';
import { Card, Grid, Tile, Empty, Meter } from '@/components/ui';
import { StackedBars, Heatmap, HBars } from '@/components/charts';
import { inShort, pct, istDateTime, toNum } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Users & Engagement — Q8, Q9, Q10, Q4, Q15, Q23. */
export default async function EngagementPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = parseDays(searchParams.days);
  const d = await engagement(days);
  const a = d.dauWau;

  return (
    <div className="flex flex-col gap-4">
      <Grid cols={4}>
        <Tile label="DAU" value={inShort(a?.dau)} hint="Q9 · question, txn or login" />
        <Tile label="WAU" value={inShort(a?.wau)} />
        <Tile label="MAU" value={inShort(a?.mau)} />
        <Tile label="Stickiness" value={pct(a?.stickiness_pct)} hint="DAU / MAU" />
      </Grid>

      <Card title="Signups vs activation" sub="Q8 · by week · activated = asked ≥1 question within 7 days">
        {/* Activated ⊆ signups: the second segment is the remainder. */}
        <StackedBars
          data={d.signups
            .slice()
            .reverse()
            .map((w) => ({
              ...w,
              not_activated: Math.max(0, toNum(w.signups) - toNum(w.activated_7d)),
            }))}
          xKey="week"
          series={[
            { key: 'activated_7d', label: 'Activated' },
            { key: 'not_activated', label: 'Not activated' },
          ]}
        />
      </Card>

      <Card title="Retention cohorts" sub="Q10 · share of each signup month still active in M1–M3">
        <Heatmap rows={d.cohorts} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Power users" sub={`Q4 · top credit consumers, last ${days} days`}>
          {d.topUsers.length === 0 ? (
            <Empty message="No credit usage in this range" />
          ) : (
            <div className="table-scroll">
              <table className="pulse">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Organization</th>
                    <th className="num">Credits</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topUsers.map((r, i) => (
                    <tr key={i}>
                      <td className="text-ink">{String(r.user_name)}</td>
                      <td>{String(r.organization ?? '—')}</td>
                      <td className="num">{inShort(r.credits_30d)}</td>
                      <td>{istDateTime(r.last_activity as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Device split" sub={`Q23 · logins by device and OS, last ${days} days`}>
          <HBars data={d.devices.slice(0, 8).map((r) => ({ ...r, label: `${r.device} · ${r.os}` }))} labelKey="label" valueKey="logins" valueLabel="Logins" />
        </Card>
      </div>

      <Card title="Dormant seats" sub="Q15 · seats bought vs seats actually used">
        {d.seats.length === 0 ? (
          <Empty message="No active subscriptions" />
        ) : (
          <div className="table-scroll">
            <table className="pulse">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th className="num">Seats bought</th>
                  <th className="num">Assigned</th>
                  <th className="num">Active {days}d</th>
                  <th className="num">Active seat %</th>
                </tr>
              </thead>
              <tbody>
                {d.seats.map((r, i) => (
                  <tr key={i}>
                    <td className="text-ink">{String(r.name)}</td>
                    <td className="num">{inShort(r.seats_bought)}</td>
                    <td className="num">{inShort(r.seats_assigned)}</td>
                    <td className="num">{inShort(r.seats_active_30d)}</td>
                    <td className="num">
                      <span className="flex items-center justify-end gap-2">
                        <Meter value={toNum(r.active_seat_pct)} />
                        {pct(r.active_seat_pct)}
                      </span>
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
