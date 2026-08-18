import { commandCenter } from '@/lib/metrics';
import { parseDays } from '@/lib/scope';
import Link from 'next/link';
import { Card, Grid, Tile, Empty, StatusPill } from '@/components/ui';
import { LineChart, StackedBars, Donut } from '@/components/charts';
import { inShort, rupees, pct, istDate, toNum } from '@/lib/format';
import { BENCHMARKS } from '@config/scoring';

export const dynamic = 'force-dynamic';

/**
 * Command Center — the view a founder opens on their phone (PRD §5 story 1):
 * MRR, burn 7-day MA, activation %, failed payments and the needs-attention
 * list all above the fold, every tile linking to its drill-down.
 */
export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const days = parseDays(searchParams.days);
  const data = await commandCenter(days);
  const t = data.tiles;

  const h = data.headline;
  return (
    <div className="flex flex-col gap-4">
      {/* Question 1 as a sentence (audit F6) — assembled from G1 + G5. */}
      <Card>
        <p className="text-[16px] leading-snug text-ink" style={{ fontFamily: 'var(--font-display), Arial, sans-serif' }}>
          <strong>{h.workshopsWithClient} of {h.workshopsDelivered}</strong> delivered workshops have produced a paying
          client{h.creditCostPerClient !== null && <> · credit cost per client <strong>{rupees(h.creditCostPerClient)}</strong></>}
          {' '}· <strong className={data.weekMovement.intoA > 0 ? 'text-good' : ''}>{data.weekMovement.intoA} climbed into Band A</strong> this week
          {data.weekMovement.outOfA > 0 && <> · <strong className="text-warn">{data.weekMovement.outOfA} fell out</strong></>}
          {' '}— <Link href="/today" className="text-brand underline underline-offset-2">run the queue →</Link>
        </p>
      </Card>
      <Grid cols={6}>
        <Tile label="MRR" value={rupees(t.mrr_inr)} hint="active subscriptions" href="/credits" />
        <Tile label="Burn 7d MA" value={inShort(t.burn_ma_7d)} hint="credits/day" href="/credits" />
        <Tile label="Activation" value={pct(t.activation_pct)} hint="last 4 weeks · asked ≥1 question in 7d" href="/engagement" />
        <Tile label="DAU / MAU" value={`${inShort(t.dau)} / ${inShort(t.mau)}`} hint={`stickiness ${pct(t.stickiness_pct)}`} href="/engagement" />
        <Tile
          label="Hot accounts"
          value={String(t.hot_accounts)}
          hint={`≥${BENCHMARKS.hotThresholdCredits} grant credits`}
          tone={t.hot_accounts > 0 ? 'good' : undefined}
          href="/search?band=A"
        />
        <Tile
          label="Failed payments"
          value={String(t.failed_payments)}
          tone={t.failed_payments > 0 ? 'danger' : 'good'}
          hint="needs follow-up"
          href="/credits"
        />
      </Grid>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Daily credit burn" sub={`Last ${days} days · Q1 · line = 7-day moving average`}>
          <LineChart
            data={data.burnSeries}
            xKey="day"
            lines={[
              { key: 'credits_burned', label: 'Credits burned' },
              { key: 'ma_7d', label: '7-day MA', dashed: true },
            ]}
          />
        </Card>
        <Card title="Where credits go" sub={`Q2 · last ${days} days`}>
          <Donut data={data.featureSplit} labelKey="feature" valueKey="credits_burned" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Signups vs activated" sub="Q8 · by week, last 12 weeks">
          {/* Activated is a subset of signups, so the second segment is the
              remainder — stacking the two raw numbers would double-count. */}
          <StackedBars
            data={data.signupSeries.map((w) => ({
              ...w,
              not_activated: Math.max(0, toNum(w.signups) - toNum(w.activated_7d)),
            }))}
            xKey="week"
            series={[
              { key: 'activated_7d', label: 'Activated in 7d' },
              { key: 'not_activated', label: 'Not activated' },
            ]}
          />
        </Card>
        <Card title="September GTM economics" sub="G5 · revenue per rupee of credit">
          {data.economics ? (
            <dl className="flex flex-col gap-2 text-[13px]">
              <Row label="Grant accounts" value={inShort(data.economics.accounts)} />
              <Row label="Credits consumed" value={inShort(data.economics.free_credits_consumed)} />
              <Row label="Credit cost" value={rupees(data.economics.credit_cost_inr)} />
              <Row label="Conversions" value={inShort(data.economics.conversions)} />
              <Row label="Revenue collected" value={rupees(data.economics.revenue_collected_inr)} />
              <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
                <span className="text-ink-soft">Revenue per credit rupee</span>
                <span className="flex items-center gap-2">
                  <strong className="text-[18px] tabular-nums">
                    {toNum(data.economics.revenue_per_credit_rupee).toFixed(2)}
                  </strong>
                  <StatusPill tone={toNum(data.economics.revenue_per_credit_rupee) >= 1 ? 'good' : 'warn'}>
                    {toNum(data.economics.revenue_per_credit_rupee) >= 1 ? 'ABOVE 1.0' : 'BELOW 1.0'}
                  </StatusPill>
                </span>
              </div>
            </dl>
          ) : (
            <Empty message="No grant accounts yet — create the first workshop" />
          )}
        </Card>
      </div>

      <Card title="Needs attention" sub="Hot leads to call · stalled accounts · payments to chase">
        <div className="grid gap-6 lg:grid-cols-3">
          <AttentionList
            title={`Hot — call today (${data.attention.hot.length})`}
            empty="No account has crossed 700 credits yet"
            rows={data.attention.hot.map((r) => ({
              main: String(r.organization),
              sub: `${r.partner ?? 'No partner'} · ${inShort(r.free_credits_used)} credits`,
              tone: 'good' as const,
              href: `/search?org=${r.org_id}`,
            }))}
          />
          <AttentionList
            title={`Stalled — under 100 credits (${data.attention.stalled.length})`}
            empty="Nothing stalled"
            rows={data.attention.stalled.map((r) => ({
              main: String(r.name),
              sub: `${r.partner ?? 'No partner'} · signed up ${istDate(r.created as string)}`,
              tone: 'warn' as const,
              href: `/search?org=${r.org_id}`,
            }))}
          />
          <AttentionList
            title={`Payments to chase (${data.attention.failedPayments.length})`}
            empty="No failed or pending payments"
            rows={data.attention.failedPayments.map((r) => ({
              main: String(r.name),
              sub: `${rupees(r.amount)} · ${r.paymentStatus} · ${istDate(r.paymentDate as string)}`,
              tone: 'danger' as const,
              href: `/search?org=${r.org_id}`,
            }))}
          />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function AttentionList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { main: string; sub: string; tone: 'good' | 'warn' | 'danger'; href: string }[];
  empty: string;
}) {
  // Every row is a link (audit F5): seeing that something needs attention and
  // acting on it must be the same gesture.
  return (
    <div>
      <h3 className="mb-2 text-[13px] font-bold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <Empty message={empty} />
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r, i) => (
            <li key={i}>
              <Link
                href={r.href}
                className="-mx-2 flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
              >
                <span
                  className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                  style={{ background: `var(--${r.tone})` }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-ink">{r.main}</span>
                  <span className="block truncate text-[12px] text-ink-muted">{r.sub}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
