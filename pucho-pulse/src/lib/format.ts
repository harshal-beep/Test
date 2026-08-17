/** Indian number formatting (UI_SPEC §3: "Numbers: Indian formatting (K/L/Cr)"). */

export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 1234 → "1.2K", 250000 → "2.5L", 12000000 → "1.2Cr". */
export function inShort(value: unknown, digits = 1): string {
  const n = toNum(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}${trim(abs / 1e7, digits)}Cr`;
  if (abs >= 1e5) return `${sign}${trim(abs / 1e5, digits)}L`;
  if (abs >= 1e3) return `${sign}${trim(abs / 1e3, digits)}K`;
  return `${sign}${trim(abs, abs % 1 === 0 ? 0 : digits)}`;
}

function trim(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Full Indian grouping: 1234567 → "12,34,567". */
export function inFull(value: unknown): string {
  const n = toNum(value);
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

export function rupees(value: unknown, short = true): string {
  return `₹${short ? inShort(value) : inFull(value)}`;
}

export function pct(value: unknown, digits = 1): string {
  const n = toNum(value);
  return `${n.toFixed(digits).replace(/\.0$/, '')}%`;
}

/** Dates are bucketed and displayed in IST everywhere (CLAUDE.md ground rules). */
export function istDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  }).format(d);
}

export function istDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function daysAgo(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}
