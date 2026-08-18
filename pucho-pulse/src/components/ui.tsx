import type { ReactNode } from 'react';
import Link from 'next/link';
import { inShort, pct, hoursUntil } from '@/lib/format';
import { BAND_LABEL, PPS, type PpsBand } from '@config/scoring';

export function Card({
  title,
  sub,
  tag,
  children,
  className = '',
  right,
}: {
  title?: string;
  sub?: string;
  /** Canonical-query provenance (e.g. "Q8") — corner chip, not subtitle noise. */
  tag?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right || tag) && (
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="card-title">{title}</h2>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {right}
            {tag && <span className="card-tag" title={`Canonical query ${tag} in docs/SQL_LIBRARY.sql`}>{tag}</span>}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Stat tile with an optional delta badge — the bagui.pro stat-card pattern
 * (label / value / trend chip) rendered in Pulse tokens. `delta` is a signed
 * count or percent with an explicit good-direction.
 */
export function Tile({
  label,
  value,
  hint,
  tone,
  href,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'warn' | 'danger';
  href?: string;
  delta?: { value: number; label?: string; goodWhen?: 'up' | 'down' };
}) {
  const toneClass = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : '';
  const body = (
    <div className="card h-full">
      <div className="flex items-start justify-between gap-2">
        <div className="tile-label">{label}</div>
        {delta && <DeltaBadge {...delta} />}
      </div>
      <div className={`tile-value ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-[12px] text-ink-muted">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-[1px]">
      {body}
    </Link>
  ) : (
    body
  );
}

export function DeltaBadge({ value, label, goodWhen = 'up' }: { value: number; label?: string; goodWhen?: 'up' | 'down' }) {
  if (value === 0) {
    return <span className="pill bg-surface-2 text-ink-muted">— {label ?? ''}</span>;
  }
  const isGood = goodWhen === 'up' ? value > 0 : value < 0;
  return (
    <span className={`pill ${isGood ? 'bg-[color:var(--good)]/15 text-good' : 'bg-[color:var(--danger)]/15 text-danger'}`}>
      {value > 0 ? '↑' : '↓'} {Math.abs(value)}{label ? ` ${label}` : ''}
    </span>
  );
}

export function Grid({ cols = 3, children }: { cols?: 2 | 3 | 4 | 6; children: ReactNode }) {
  // Mobile shows tiles 2-across (UI_SPEC §3), never 1-across — a phone screen of
  // single tiles is a scroll, not a dashboard.
  const map = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
    6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  } as const;
  return <div className={`grid gap-3 ${map[cols]}`}>{children}</div>;
}

export function Empty({ message }: { message: string }) {
  return <p className="py-6 text-center text-[13px] text-ink-muted">{message}</p>;
}

const BAND_TONE: Record<PpsBand, string> = {
  A: 'bg-[color:var(--good)]/15 text-good',
  B: 'bg-[color:var(--brand-soft)] text-brand',
  C: 'bg-[color:var(--warn)]/15 text-warn',
  D: 'bg-[color:var(--danger)]/15 text-danger',
  W: 'bg-[color:var(--warn)]/15 text-warn',
};

export function BandPill({ band }: { band: string }) {
  const key = (band?.[0] as PpsBand) ?? 'D';
  return (
    <span className={`pill ${BAND_TONE[key] ?? BAND_TONE.D}`} title={BAND_LABEL[key]}>
      {key}
    </span>
  );
}

export function StatusPill({ children, tone }: { children: ReactNode; tone: 'good' | 'warn' | 'danger' | 'neutral' }) {
  const map = {
    good: 'bg-[color:var(--good)]/15 text-good',
    warn: 'bg-[color:var(--warn)]/15 text-warn',
    danger: 'bg-[color:var(--danger)]/15 text-danger',
    neutral: 'bg-surface-2 text-ink-soft',
  } as const;
  return <span className={`pill ${map[tone]}`}>{children}</span>;
}

/** Horizontal meter for utilisation-style rows (grant %, wallet %, seat %). */
export function Meter({ value, max = 100 }: { value: number; max?: number }) {
  const ratio = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full bg-brand" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export const fmt = { inShort, pct };

/**
 * Confidence meter for a PPS score — the beautifului.dev recommendation-card
 * meter: a track with the band cut-offs drawn as ticks, so a 68 visibly sits
 * "2 short of A" instead of being just a number.
 */
export function ConfidenceMeter({ score, band }: { score: number; band: string }) {
  const color =
    band === 'A' ? 'var(--good)' : band === 'B' ? 'var(--brand)' : band === 'W' || band === 'C' ? 'var(--warn)' : 'var(--danger)';
  return (
    <span className="inline-flex min-w-[90px] items-center gap-2" title={`PPS ${score}/100 — band ${band}`}>
      <span className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${score}%`, background: color }} />
        {[PPS.bands.C, PPS.bands.B, PPS.bands.A].map((cut) => (
          <span key={cut} className="absolute inset-y-0 w-px bg-[color:var(--border)]" style={{ left: `${cut}%` }} />
        ))}
      </span>
      <span className="text-[12.5px] font-bold tabular-nums text-ink">{score}</span>
    </span>
  );
}

/**
 * SLA countdown chip: green while comfortable, warn when close, danger when
 * breached. Prefer `hoursLeft` computed by the database — production
 * timestamps are timezone-naive IST, and re-deriving them client-side skews
 * the clock by the UTC offset.
 */
export function SlaChip({ due, hoursLeft }: { due?: string | null; hoursLeft?: number | null }) {
  const hours = hoursLeft ?? hoursUntil(due ?? null);
  if (hours === null || hours === undefined) return <span className="pill bg-surface-2 text-ink-muted">no SLA</span>;
  if (hours <= 0) {
    return <span className="pill bg-[color:var(--danger)]/15 text-danger">breached {Math.round(-hours)}h ago</span>;
  }
  const label = hours < 24 ? `${Math.round(hours)}h left` : `${Math.round(hours / 24)}d left`;
  return (
    <span className={`pill ${hours < 12 ? 'bg-[color:var(--warn)]/15 text-warn' : 'bg-[color:var(--good)]/15 text-good'}`}>
      {label}
    </span>
  );
}

/**
 * Queue row — the beautifului.dev task-row primitive: severity stripe, title,
 * meta line, right-aligned status chips, whole row a link. Used by the Today
 * queue and anywhere a list means "act on this", not "read this".
 */
export function TaskRow({
  href,
  stripe,
  title,
  meta,
  right,
}: {
  href: string;
  stripe: 'good' | 'warn' | 'danger' | 'neutral';
  title: string;
  meta: string;
  right?: ReactNode;
}) {
  const stripeColor =
    stripe === 'neutral' ? 'var(--border)' : `var(--${stripe})`;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-line bg-surface-1 px-3 py-2.5 transition-colors hover:bg-surface-2"
      style={{ borderLeft: `3px solid ${stripeColor}` }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-bold text-ink">{title}</span>
        <span className="block truncate text-[12px] text-ink-muted">{meta}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">{right}</span>
    </Link>
  );
}
