import Link from 'next/link';
import { search, ppsLeaderboard, partner360, org360, user360 } from '@/lib/metrics';
import { Card, Grid, Tile, Empty, BandPill, StatusPill, Meter } from '@/components/ui';
import { SearchBox } from '@/components/SearchBox';
import { inShort, pct, istDate, istDateTime, toNum, daysAgo } from '@/lib/format';
import { BAND_ACTION, partnerGrade, PPS, type PpsBand } from '@config/scoring';

export const dynamic = 'force-dynamic';

type Props = {
  searchParams: { q?: string; type?: string; partner?: string; org?: string; user?: string; band?: string };
};

/** Search & 360 + Propensity — S1, S2, A1, A2, Q25, Z1 and the PPS leaderboard. */
export default async function SearchPage({ searchParams }: Props) {
  const q = searchParams.q ?? '';
  const type = (['all', 'partner', 'org', 'user'].includes(searchParams.type ?? '')
    ? searchParams.type
    : 'all') as 'all' | 'partner' | 'org' | 'user';

  const [results, pps] = await Promise.all([search(q, type), ppsLeaderboard(searchParams.band ?? null)]);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Search" sub="S1 · channel partners, organizations and end users in one box">
        <SearchBox initialQuery={q} initialType={type} />
        {q && results.length === 0 && <Empty message={`Nothing matches “${q}”`} />}
        {results.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {results.map((r) => {
              const kind = String(r.type);
              const href =
                kind === 'PARTNER'
                  ? `/search?q=${encodeURIComponent(q)}&type=${type}&partner=${r.id}`
                  : kind === 'ORG'
                    ? `/search?q=${encodeURIComponent(q)}&type=${type}&org=${r.id}`
                    : `/search?q=${encodeURIComponent(q)}&type=${type}&user=${r.id}`;
              return (
                <li key={`${kind}-${r.id}`}>
                  <Link href={href} className="flex items-center gap-3 py-2 hover:text-brand">
                    <span
                      className="pill"
                      style={{
                        color: kind === 'PARTNER' ? 'var(--series-4)' : kind === 'ORG' ? 'var(--series-1)' : 'var(--series-2)',
                        background: 'var(--surface-2)',
                      }}
                    >
                      {kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{String(r.name)}</span>
                    <span className="hidden truncate text-[12.5px] text-ink-muted sm:block">{String(r.detail ?? '')}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {searchParams.partner && <Partner360 id={searchParams.partner} />}
      {searchParams.org && <Org360 id={searchParams.org} />}
      {searchParams.user && <User360 id={searchParams.user} />}

      <Card
        title="PPS Office leaderboard"
        sub="PPS v0.1 · Office behaviour is the score. W = wrong lane: re-demo, never a close attempt."
        right={
          <div className="flex flex-wrap gap-1">
            {['A', 'B', 'C', 'D', 'W'].map((b) => (
              <Link
                key={b}
                href={`/search?${new URLSearchParams({ ...(q ? { q } : {}), type, ...(searchParams.band === b ? {} : { band: b }) }).toString()}`}
                className={`btn ${searchParams.band === b ? 'btn-active' : ''}`}
              >
                {b}
              </Link>
            ))}
          </div>
        }
      >
        {pps.length === 0 ? (
          <Empty message="No grant accounts scored yet" />
        ) : (
          <div className="table-scroll">
            <table className="pulse">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th className="num">Credits</th>
                  <th className="num">Office days/14</th>
                  <th className="num">Office apps</th>
                  <th className="num">Office chats</th>
                  <th className="num">Momentum</th>
                  <th className="num">PPS</th>
                  <th>Band</th>
                  <th>Next action</th>
                </tr>
              </thead>
              <tbody>
                {pps.map((r) => {
                  const band = String(r.band) as PpsBand;
                  const tooYoung = (daysAgo(r.org_created as string) ?? 99) < PPS.minAccountAgeDays;
                  return (
                    <tr key={String(r.org_id)}>
                      <td className="text-ink">
                        <Link href={`/search?org=${r.org_id}`} className="hover:text-brand">
                          {String(r.name)}
                        </Link>
                        {tooYoung && <span className="ml-2 text-[11px] text-ink-muted">(new — score not yet meaningful)</span>}
                      </td>
                      <td className="num">{inShort(r.used_total)}</td>
                      <td className="num">{inShort(r.office_days_14)}</td>
                      <td className="num">{inShort(r.office_apps)}</td>
                      <td className="num">{inShort(r.office_chats)}</td>
                      <td className="num">{toNum(r.pts_momentum) >= 10 ? '↑' : toNum(r.pts_momentum) > 0 ? '→' : '↓'}</td>
                      <td className="num font-bold text-ink">{inShort(r.pps)}</td>
                      <td>
                        <BandPill band={band} />
                      </td>
                      <td className="whitespace-normal text-[12.5px]">{BAND_ACTION[band]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

async function Partner360({ id }: { id: string }) {
  const d = await partner360(id);
  if (!d.health) return <Card title="Partner 360"><Empty message="This partner has no grant accounts yet" /></Card>;
  const score = toNum(d.health.health_score);
  const grade = partnerGrade(score);
  return (
    <Card title={`Partner 360 — ${String(d.health.partner)}`} sub="A2 health components · A1 monthly trend · Z1 zero-use">
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <div
            className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-4"
            style={{ borderColor: 'var(--brand)' }}
          >
            <span className="text-[26px] font-extrabold leading-none text-ink">{score}</span>
            <span className="text-[11px] text-ink-muted">Grade {grade}</span>
          </div>
          <ul className="flex flex-col gap-1 text-[12.5px]">
            <li>Engagement {toNum(d.health.engagement_pts).toFixed(1)}/30</li>
            <li>Conversion {toNum(d.health.conversion_pts).toFixed(1)}/30</li>
            <li>Zero-use control {toNum(d.health.zero_use_pts).toFixed(1)}/20</li>
            <li>Velocity {toNum(d.health.velocity_pts).toFixed(1)}/20</li>
          </ul>
        </div>
        <Grid cols={4}>
          <Tile label="Accounts" value={inShort(d.health.accounts)} />
          <Tile label="Zero-use" value={inShort(d.aging?.zero_use_total ?? 0)} hint={pct(d.aging?.zero_use_pct ?? 0)} />
          <Tile label="Band A" value={String(d.portfolio.filter((p) => p.band === 'A').length)} tone="good" />
          <Tile label="Wrong lane" value={String(d.portfolio.filter((p) => p.band === 'W').length)} tone="warn" />
        </Grid>
      </div>
      {d.trend.length > 0 && (
        <div className="table-scroll mt-4">
          <table className="pulse">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Accounts</th>
                <th className="num">Engaged</th>
                <th className="num">Converted</th>
              </tr>
            </thead>
            <tbody>
              {d.trend.slice(0, 3).map((r, i) => (
                <tr key={i}>
                  <td>{istDate(r.month as string)}</td>
                  <td className="num">{inShort(r.accounts)}</td>
                  <td className="num">{inShort(r.engaged)}</td>
                  <td className="num">{inShort(r.converted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function Org360({ id }: { id: string }) {
  const d = await org360(id);
  if (!d.org && !d.pps) return <Card title="Org 360"><Empty message="Organization not found" /></Card>;
  const pps = d.pps;
  return (
    <Card title={`Org 360 — ${String(d.org?.name ?? pps?.name ?? id)}`} sub="Q25 slice + grant status + PPS row">
      <Grid cols={4}>
        <Tile label="Plan" value={String(d.org?.plan ?? 'Free grant')} hint={String(d.org?.PayFrequency ?? '')} />
        <Tile label="Partner" value={String(d.org?.partner ?? '—')} />
        <Tile label="PPS" value={pps ? inShort(pps.pps) : '—'} hint={pps ? String(pps.band) : ''} />
        <Tile label="Grant used" value={inShort(pps?.used_total ?? d.org?.credits_used)} hint="of 1,000" />
      </Grid>
      {d.org && (
        <div className="mt-4 flex items-center gap-3">
          <Meter value={toNum(d.org.util_pct)} />
          <span className="text-[12.5px] text-ink-soft">
            {pct(d.org.util_pct)} of {inShort(d.org.credits_allocated)} allocated credits used
          </span>
        </div>
      )}
      {pps && (
        <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[12.5px] text-ink-soft">
          <strong>Signal:</strong> {inShort(pps.office_days_14)} Office days in the last 14, {inShort(pps.office_apps)}{' '}
          Office apps, {inShort(pps.office_chats)} Office chats. Last Office activity{' '}
          {pps.last_office ? istDateTime(pps.last_office as string) : 'never'}. Action:{' '}
          {BAND_ACTION[String(pps.band) as PpsBand]}
        </p>
      )}
      {d.history.length > 0 && (
        <div className="table-scroll mt-4">
          <table className="pulse">
            <thead>
              <tr>
                <th>Snapshot</th>
                <th className="num">PPS</th>
                <th>Band</th>
              </tr>
            </thead>
            <tbody>
              {d.history.slice(0, 10).map((h, i) => (
                <tr key={i}>
                  <td>{istDate(h.snapshotDate as string)}</td>
                  <td className="num">{inShort(h.pps)}</td>
                  <td>
                    <BandPill band={String(h.band)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

async function User360({ id }: { id: string }) {
  const u = await user360(id);
  if (!u) return <Card title="End-user 360"><Empty message="User not found" /></Card>;
  const zeroUse = toNum(u.free_credits_used) === 0;
  return (
    <Card title={`End-user 360 — ${String(u.name)}`} sub="S2 · profile vs behaviour">
      <div className="mb-3">
        <StatusPill tone={zeroUse ? 'danger' : toNum(u.free_credits_used) >= 300 ? 'good' : 'warn'}>
          {zeroUse ? 'ZERO USE' : toNum(u.free_credits_used) >= 300 ? 'ENGAGED' : 'TRYING'}
        </StatusPill>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <dl className="flex flex-col gap-1 text-[13px]">
          <Field label="Organization" value={String(u.organization ?? '—')} />
          <Field label="Industry" value={String(u.industry ?? '—')} />
          <Field label="Company size" value={String(u.companySize ?? '—')} />
          <Field label="Segment" value={String(u.segment ?? '—')} />
          <Field label="Partner" value={String(u.partner ?? '—')} />
          <Field label="Language" value={String(u.language ?? '—')} />
          <Field label="Signed up" value={istDate(u.signed_up as string)} />
        </dl>
        <dl className="flex flex-col gap-1 text-[13px]">
          <Field label="Logins" value={inShort(u.total_logins)} />
          <Field label="Last login" value={istDateTime(u.last_login as string)} />
          <Field label="Last device" value={String(u.last_device ?? '—')} />
          <Field label="Questions asked" value={inShort(u.questions_asked)} />
          <Field label="Free credits" value={inShort(u.free_credits_used)} />
          <Field label="Paid credits" value={inShort(u.paid_credits_used)} />
        </dl>
      </div>
      {zeroUse && (
        <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[12.5px] text-ink-soft">
          Zero credits used — the account is not a lead yet. Partner action: 15-minute call re-running the workbook on
          their own file.
        </p>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-1 last:border-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="truncate text-ink">{value}</dd>
    </div>
  );
}
