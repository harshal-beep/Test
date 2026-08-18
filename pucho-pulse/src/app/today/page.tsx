import Link from 'next/link';
import { today } from '@/lib/metrics';
import { Card, Grid, Tile, Empty, TaskRow, SlaChip, StatusPill, BandPill } from '@/components/ui';
import { HBars } from '@/components/charts';
import { inShort, rupees, pct, istDate, istDateTime, toNum } from '@/lib/format';
import { TRIGGERS, type AlertType } from '@config/scoring';

export const dynamic = 'force-dynamic';

const ALERT_TITLES: Record<string, string> = {
  BAND_A: 'Hot lead — close within 72h',
  EXHAUSTED: 'Grant exhausted — offer bonus carry',
  OFFICE_NOUSE_72H: 'No Office use since workshop',
  MOMENTUM_BREAK: 'Went quiet — was climbing',
  WRONG_LANE: 'Wrong lane — book Office re-demo',
  EXCEL_ONLY: 'Excel-only — send Word demo',
  SINGLE_PLAYER: 'One user — nudge to invite a colleague',
  ZERO_USE_7D: 'Zero use at 7 days',
  ZERO_USE_14D: 'Zero use at 14 days — Sales call',
};

/**
 * Today — the action queue (audit F2/F3). The audit's core recommendation:
 * the analytics tabs are for reading; this view is for running the GTM.
 * Ordered: what's breaching → what's hot → what's ticking → what to verify.
 */
export default async function TodayPage() {
  const d = await today();

  const breached = d.openAlerts.filter((a) => a.sla_breached);
  const withSla = d.openAlerts.filter((a) => !a.sla_breached && a.slaHours !== null);
  const nudges = d.openAlerts.filter((a) => a.slaHours === null && a.type !== 'DIGEST' && a.type !== 'SCORECARD');
  const h = d.headline;

  return (
    <div className="flex flex-col gap-4">
      {/* Question 1 answered as a sentence (audit F6). */}
      <Card>
        <p className="text-[17px] leading-snug text-ink" style={{ fontFamily: 'var(--font-display), Arial, sans-serif' }}>
          <strong>{h.workshopsWithClient} of {h.workshopsDelivered}</strong> delivered workshops have produced a paying
          client · <strong>{inShort(h.conversions)}</strong> conversions
          {h.creditCostPerClient !== null && (
            <> at <strong>{rupees(h.creditCostPerClient)}</strong> credit cost each</>
          )}{' '}
          · every grant rupee has returned{' '}
          <strong className={h.revenuePerCreditRupee >= 1 ? 'text-good' : 'text-warn'}>
            ₹{h.revenuePerCreditRupee.toFixed(2)}
          </strong>
        </p>
      </Card>

      <Grid cols={4}>
        <Tile
          label="Climbed into A"
          value={String(d.week.intoA)}
          hint="this week"
          delta={{ value: d.week.intoA, label: 'hot', goodWhen: 'up' }}
          href="/search?band=A"
        />
        <Tile
          label="Fell out of A"
          value={String(d.week.outOfA)}
          hint="this week — call before they cool"
          delta={{ value: -d.week.outOfA, label: '', goodWhen: 'up' }}
          href="/search"
        />
        <Tile
          label="SLA breaches"
          value={String(breached.length)}
          tone={breached.length ? 'danger' : 'good'}
          hint="unacked past deadline"
        />
        <Tile
          label="Grants expiring"
          value={String(d.expiring.length)}
          tone={d.expiring.length ? 'warn' : 'good'}
          hint="within 14 days, credits unused"
        />
      </Grid>

      <Card
        title="The queue"
        sub="Open alerts in priority order — breaches first, then the SLA clock. Tap a row for the account's 360."
      >
        {d.openAlerts.length === 0 ? (
          <Empty message="Queue is clear. New alerts land here the moment a scan fires them." />
        ) : (
          <div className="flex flex-col gap-2">
            {[...breached, ...withSla, ...nudges].map((a) => {
              const type = String(a.type) as AlertType;
              return (
                <TaskRow
                  key={String(a.id)}
                  href={a.organizationId ? `/search?org=${a.organizationId}` : '/partners'}
                  stripe={a.sla_breached ? 'danger' : TRIGGERS[type]?.priority <= 2 ? 'good' : 'warn'}
                  title={`${String(a.organization ?? a.partner ?? 'Account')} — ${ALERT_TITLES[type] ?? type}`}
                  meta={`${a.partner ? `${a.partner} · ` : ''}fired ${istDateTime(a.firedAt as string)}${
                    a.escalatedAt ? ' · escalated to Sales' : ''
                  }`}
                  right={
                    <>
                      {a.organizationId && (
                        <span className="pill bg-brand-soft text-brand">kit</span>
                      )}
                      <SlaChip hoursLeft={a.sla_hours_left === null || a.sla_hours_left === undefined ? null : Number(a.sla_hours_left)} />
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Yesterday's workshops" sub="Did they land? Registrations should appear within a day.">
          {d.recentWorkshops.length === 0 ? (
            <Empty message="No workshops in the last 72 hours" />
          ) : (
            <div className="flex flex-col gap-2">
              {d.recentWorkshops.map((w) => (
                <TaskRow
                  key={String(w.id)}
                  href={`/workshops/${w.id}`}
                  stripe={w.status === 'SCHEDULED' ? 'danger' : toNum(w.accounts_created) > 0 ? 'good' : 'warn'}
                  title={`${String(w.segmentName)} · ${istDate(w.workshopDate as string)}`}
                  meta={`${w.partner ?? 'No partner'} · ${inShort(w.attendedCount)} attended of ${inShort(w.invitedCount)} invited`}
                  right={
                    w.status === 'SCHEDULED' ? (
                      <StatusPill tone="danger">attendance missing</StatusPill>
                    ) : (
                      <StatusPill tone={toNum(w.accounts_created) > 0 ? 'good' : 'warn'}>
                        {inShort(w.accounts_created)} accounts
                      </StatusPill>
                    )
                  }
                />
              ))}
            </div>
          )}
        </Card>

        <Card title="Grants expiring with credits on the table" sub="The last window where a partner call still changes the outcome.">
          {d.expiring.length === 0 ? (
            <Empty message="Nothing expiring in the next 14 days" />
          ) : (
            <div className="flex flex-col gap-2">
              {d.expiring.map((g) => (
                <TaskRow
                  key={String(g.org_id)}
                  href={`/search?org=${g.org_id}`}
                  stripe={toNum(g.util_pct) < 30 ? 'danger' : 'warn'}
                  title={String(g.name)}
                  meta={`${g.partner ?? 'No partner'} · expires ${istDate(g.expires as string)}`}
                  right={<StatusPill tone={toNum(g.util_pct) < 30 ? 'danger' : 'warn'}>{pct(g.util_pct, 0)} used</StatusPill>}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Is the score working?"
        sub="Conversion rate per band from nightly snapshots — A must beat B must beat C. A flat line here means stop trusting the bands."
      >
        {d.byBand.length === 0 ? (
          <Empty message="Fills in once the nightly snapshot has run and conversions accrue" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <HBars
                data={d.byBand.map((b) => ({ ...b, label: `Band ${b.band}` }))}
                labelKey="label"
                valueKey="conversion_pct"
                valueLabel="Conversion %"
                suffix="%"
                colorByIndex
              />
            </div>
            <div className="table-scroll">
              <table className="pulse">
                <thead>
                  <tr>
                    <th>Band</th>
                    <th className="num">Accounts</th>
                    <th className="num">Converted</th>
                    <th className="num">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byBand.map((b, i) => (
                    <tr key={i}>
                      <td><BandPill band={String(b.band)} /></td>
                      <td className="num">{inShort(b.accounts)}</td>
                      <td className="num">{inShort(b.converted)}</td>
                      <td className="num">{pct(b.conversion_pct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <p className="text-[12.5px] text-ink-muted">
        Missing partner numbers or languages break the WhatsApp loop —{' '}
        <Link href="/inputs" className="text-brand underline underline-offset-2">check the inputs page</Link> when a
        send fails.
      </p>
    </div>
  );
}
