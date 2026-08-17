import type { ReactNode } from 'react';
import { inShort, pct } from '@/lib/format';
import { BAND_LABEL, type PpsBand } from '@config/scoring';

export function Card({
  title,
  sub,
  children,
  className = '',
  right,
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  hint,
  tone,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'warn' | 'danger';
  href?: string;
}) {
  const toneClass = tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : '';
  const body = (
    <div className="card h-full">
      <div className="tile-label">{label}</div>
      <div className={`tile-value ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-[12px] text-ink-muted">{hint}</div>}
    </div>
  );
  return href ? (
    <a href={href} className="block transition-transform hover:-translate-y-[1px]">
      {body}
    </a>
  ) : (
    body
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
