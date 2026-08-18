import { creditGrant } from '@/lib/metrics';
import { Card, Grid, Tile, Empty, StatusPill } from '@/components/ui';
import { HBars, LineChart } from '@/components/charts';
import { TaskRow, StatusPill as SP } from '@/components/ui';
import { inShort, rupees, pct, istDate, toNum } from '@/lib/format';
import { BENCHMARKS, GRANT_CREDITS } from '@config/scoring';

export const dynamic = 'force-dynamic';

/**
 * Credit Grant Benchmark — B1..B6 + Z1, Z2. The question this view exists to
 * answer: is the ₹3.6L/month of free credits buying conversions, and is 1,000
 * the right number? Red lines come from ALGORITHMS §4 via config/scoring.ts.
 */
export default async function GrantPage() {
  const d = await creditGrant();
  const waste = d.waste;
  const curve = d.burnCurve;
  const utilisation = toNum(waste?.utilization_pct);
  const exhaustion = toNum(curve?.exhaustion_pct);
  const neverLanded = d.moneyChart.find((r) => String(r.usage_band).startsWith('a.'));
  const totalAccounts = d.moneyChart.reduce((s, r) => s + toNum(r.accounts), 0);
  const neverLandedPct = totalAccounts ? (toNum(neverLanded?.accounts) / totalAccounts) * 100 : 0;

  const band = (v: number, [lo, hi]: readonly [number, number]) =>
    v >= lo * 100 && v <= hi * 100 ? 'good' : 'warn';

  return (
    <div className="flex flex-col gap-4">
      <Grid cols={4}>
        <Tile
          label="Grant utilisation"
          value={pct(utilisation)}
          tone={band(utilisation, BENCHMARKS.utilizationHealthy)}
          hint={`healthy ${BENCHMARKS.utilizationHealthy[0] * 100}–${BENCHMARKS.utilizationHealthy[1] * 100}%`}
        />
        <Tile
          label="Exhaustion rate"
          value={pct(exhaustion)}
          tone={band(exhaustion, BENCHMARKS.exhaustionSweetSpot)}
          hint={`sweet spot ${BENCHMARKS.exhaustionSweetSpot[0] * 100}–${BENCHMARKS.exhaustionSweetSpot[1] * 100}%`}
        />
        <Tile
          label="Never landed"
          value={pct(neverLandedPct)}
          tone={neverLandedPct > BENCHMARKS.neverLandedRedLine * 100 ? 'danger' : 'good'}
          hint={`red line ${BENCHMARKS.neverLandedRedLine * 100}% · under ${BENCHMARKS.neverLandedCredits} credits`}
        />
        <Tile
          label="Unused grant value"
          value={rupees(waste?.unused_value_inr)}
          hint={`${inShort(waste?.credits_issued)} issued, ${inShort(waste?.credits_consumed)} used`}
        />
      </Grid>

      <Card
        title="The money chart — conversion by usage band"
        sub="B1 · this curve must rise steeply. Flat means the grant isn't driving conversion."
      >
        <HBars
          data={d.moneyChart}
          labelKey="usage_band"
          valueKey="conversion_pct"
          valueLabel="Conversion %"
          suffix="%"
          colorByIndex
        />
        <div className="table-scroll mt-3">
          <table className="pulse">
            <thead>
              <tr>
                <th>Band</th>
                <th className="num">Accounts</th>
                <th className="num">Converted</th>
                <th className="num">Conversion</th>
              </tr>
            </thead>
            <tbody>
              {d.moneyChart.map((r, i) => (
                <tr key={i}>
                  <td className="text-ink">{String(r.usage_band)}</td>
                  <td className="num">{inShort(r.accounts)}</td>
                  <td className="num">{inShort(r.converted)}</td>
                  <td className="num">{pct(r.conversion_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Grant burn-down by cohort"
        sub="Average cumulative credits vs days since signup, per signup month. Steeper is better; a cohort flattening under the 300 line is a cohort that never landed."
      >
        <BurndownChart burndown={d.burndown} />
      </Card>

      {d.expiring.length > 0 && (
        <Card
          title={`Grants expiring with credits unused (${d.expiring.length})`}
          sub="Inside 14 days of expiry — the last window where a partner call still changes the outcome."
        >
          <div className="flex flex-col gap-2">
            {d.expiring.map((g) => (
              <TaskRow
                key={String(g.org_id)}
                href={`/search?org=${g.org_id}`}
                stripe={toNum(g.util_pct) < 30 ? 'danger' : 'warn'}
                title={String(g.name)}
                meta={`${g.partner ?? 'No partner'} · expires ${istDate(g.expires as string)}`}
                right={<SP tone={toNum(g.util_pct) < 30 ? 'danger' : 'warn'}>{pct(g.util_pct, 0)} used</SP>}
              />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Burn milestones" sub="B2 · median days to reach each milestone">
          {curve ? (
            <ul className="flex flex-col gap-2 text-[13px]">
              <Milestone label="to 100 credits" value={curve.median_days_to_100} />
              <Milestone
                label="to 300 credits"
                value={curve.median_days_to_300}
                target={BENCHMARKS.medianDaysTo300Target}
              />
              <Milestone label="to 700 credits" value={curve.median_days_to_700} />
              <Milestone
                label={`to ${GRANT_CREDITS} (exhausted)`}
                value={curve.median_days_to_1000}
                range={BENCHMARKS.medianDaysToExhaustionHealthy}
              />
            </ul>
          ) : (
            <Empty message="No grant consumption recorded yet" />
          )}
        </Card>

        <Card title="Is 1,000 the right number?" sub="B5 · credits already consumed at the moment of conversion">
          {toNum(d.atConversion?.conversions_measured) === 0 ? (
            <Empty message="No conversions measured yet — this card fills in as accounts convert" />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-end justify-between">
                <Percentile label="p25" value={d.atConversion?.p25_credits_at_conversion} />
                <Percentile label="median" value={d.atConversion?.median_credits_at_conversion} strong />
                <Percentile label="p75" value={d.atConversion?.p75_credits_at_conversion} />
              </div>
              <p className="text-[12.5px] text-ink-muted">
                Based on {inShort(d.atConversion?.conversions_measured)} conversions. These percentiles drive the
                October A/B on grant size (750 / 1,000 / 1,250 by segment).
              </p>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What the credits buy" sub="B3 · conversion by dominant feature">
          <HBars data={d.featureMix} labelKey="dominant_feature" valueKey="conversion_pct" valueLabel="Conversion %" suffix="%" />
        </Card>
        <Card title="Partner grant benchmark" sub="B4 · same grant, different outcomes">
          {d.partnerBenchmark.length === 0 ? (
            <Empty message="No partner accounts yet" />
          ) : (
            <div className="table-scroll">
              <table className="pulse">
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th className="num">Accounts</th>
                    <th className="num">Median credits</th>
                    <th className="num">Engaged</th>
                    <th className="num">Conversion</th>
                    <th className="num">₹/conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {d.partnerBenchmark.map((r, i) => (
                    <tr key={i}>
                      <td className="text-ink">{String(r.partner)}</td>
                      <td className="num">{inShort(r.accounts)}</td>
                      <td className="num">{inShort(r.median_credits_used)}</td>
                      <td className="num">{pct(r.engaged_pct)}</td>
                      <td className="num">{pct(r.conversion_pct)}</td>
                      <td className="num">
                        {r.credit_cost_per_conversion_inr ? rupees(r.credit_cost_per_conversion_inr) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Zero-utilisation aging" sub="Z1 · accounts that never used a credit, by age bucket and owner">
        {d.aging.length === 0 ? (
          <Empty message="No zero-use accounts — unusual and good" />
        ) : (
          <div className="table-scroll">
            <table className="pulse">
              <thead>
                <tr>
                  <th>Partner</th>
                  <th className="num">Zero-use</th>
                  <th className="num">0–7d</th>
                  <th className="num">7–14d</th>
                  <th className="num">14–30d</th>
                  <th className="num">30d+</th>
                  <th className="num">Zero-use %</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {d.aging.map((r, i) => (
                  <tr key={i}>
                    <td className="text-ink">{String(r.partner)}</td>
                    <td className="num">{inShort(r.zero_use_total)}</td>
                    <td className="num">{inShort(r.age_0_7d)}</td>
                    <td className="num">{inShort(r.age_7_14d)}</td>
                    <td className="num">{inShort(r.age_14_30d)}</td>
                    <td className="num">{inShort(r.age_30d_plus)}</td>
                    <td className="num">{pct(r.zero_use_pct)}</td>
                    <td>
                      {toNum(r.age_30d_plus) > 0 ? (
                        <StatusPill tone="danger">Recycle 30d+</StatusPill>
                      ) : toNum(r.age_14_30d) > 0 ? (
                        <StatusPill tone="warn">Sales call</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Partner nudge</StatusPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Activation latency" sub="Z2 · time to first credit use, by signup week">
        {d.latency.length === 0 ? (
          <Empty message="No signups yet" />
        ) : (
          <div className="table-scroll">
            <table className="pulse">
              <thead>
                <tr>
                  <th>Signup week</th>
                  <th className="num">Accounts</th>
                  <th className="num">Ever used</th>
                  <th className="num">Never used</th>
                  <th className="num">Median days to first use</th>
                  <th className="num">Used within 48h</th>
                </tr>
              </thead>
              <tbody>
                {d.latency.map((r, i) => (
                  <tr key={i}>
                    <td>{istDate(r.signup_week as string)}</td>
                    <td className="num">{inShort(r.accounts)}</td>
                    <td className="num">{inShort(r.ever_used)}</td>
                    <td className="num">{pct(r.never_used_pct)}</td>
                    <td className="num">{r.median_days_to_first_use ?? '—'}</td>
                    <td className="num">{inShort(r.used_within_48h)}</td>
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

function Milestone({
  label,
  value,
  target,
  range,
}: {
  label: string;
  value: unknown;
  target?: number;
  range?: readonly [number, number];
}) {
  const v = value === null || value === undefined ? null : toNum(value);
  const tone =
    v === null
      ? 'neutral'
      : target !== undefined
        ? v <= target
          ? 'good'
          : 'warn'
        : range
          ? v >= range[0] && v <= range[1]
            ? 'good'
            : 'warn'
          : 'neutral';
  return (
    <li className="flex items-center justify-between border-b border-line pb-2 last:border-0">
      <span className="text-ink-soft">Median days {label}</span>
      <span className="flex items-center gap-2">
        <strong className="tabular-nums text-ink">{v === null ? '—' : v.toFixed(1)}</strong>
        {(target !== undefined || range) && v !== null && (
          <StatusPill tone={tone as 'good' | 'warn' | 'neutral'}>
            {target !== undefined ? `target ≤${target}` : `healthy ${range![0]}–${range![1]}`}
          </StatusPill>
        )}
      </span>
    </li>
  );
}

function Percentile({ label, value, strong }: { label: string; value: unknown; strong?: boolean }) {
  return (
    <div className="text-center">
      <div className="tile-label">{label}</div>
      <div className={strong ? 'tile-value' : 'text-[20px] font-bold text-ink-soft'}>{inShort(value)}</div>
    </div>
  );
}


/** Pivot the long-format cohort burn-down into one line per cohort. */
function BurndownChart({ burndown }: { burndown: Record<string, unknown>[] }) {
  const cohorts = [...new Set(burndown.map((r) => String(r.cohort)))];
  if (cohorts.length === 0) {
    return <Empty message="Fills in as grant accounts accumulate usage" />;
  }
  const byDay = new Map<number, Record<string, unknown>>();
  for (const r of burndown) {
    const day = toNum(r.day_offset);
    const row = byDay.get(day) ?? { day_offset: day };
    row[String(r.cohort)] = toNum(r.avg_credits);
    byDay.set(day, row);
  }
  const data = [...byDay.values()].sort((a, b) => toNum(a.day_offset) - toNum(b.day_offset));
  return (
    <LineChart
      data={data}
      xKey="day_offset"
      xType="text"
      lines={cohorts.map((c) => ({ key: c, label: c }))}
      height={230}
    />
  );
}
