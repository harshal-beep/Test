'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { inShort, istDate } from '@/lib/format';

/**
 * Hand-rolled SVG charts, ported from reference/pucho-pulse-dashboard.html
 * (TRD §2 explicitly allows this over a chart library — the prototype IS the
 * spec). Chart rules kept from UI_SPEC §3: bars ≤24px with a 4px rounded data
 * end and a square baseline, 2px lines, 2px surface gaps between stacked
 * segments, hairline grids, one axis, ≤3 x-ticks on mobile, and text never
 * drawn in a series colour.
 *
 * Every chart is wrapped in <Figure>, which supplies the table-view toggle that
 * UI_SPEC §5 requires ("accessibility relief for low-contrast hues").
 */

const SERIES_VARS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];

export type Datum = Record<string, unknown>;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0);

/**
 * X-axis label style. This is a string, not a function: charts are client
 * components and a server component may not hand a function across that
 * boundary.
 */
export type XType = 'date' | 'month' | 'text';

const xLabel = (type: XType) => (v: unknown) => {
  if (v === null || v === undefined) return '—';
  if (type === 'text') return String(v);
  if (type === 'month') {
    const d = new Date(v as string);
    return Number.isNaN(d.getTime())
      ? String(v)
      : new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', year: '2-digit' }).format(d);
  }
  return istDate(v as string);
};

function Figure({
  children,
  rows,
  columns,
  caption,
}: {
  children: ReactNode;
  rows: Datum[];
  columns: { key: string; label: string; format?: (v: unknown) => string }[];
  caption?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          className="text-[11.5px] text-ink-muted underline underline-offset-2 hover:text-ink"
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? 'View chart' : 'View as table'}
        </button>
      </div>
      {asTable ? (
        <div className="table-scroll">
          <table className="pulse">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={c.key === columns[0].key ? '' : 'num'}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.key === columns[0].key ? '' : 'num'}>
                      {c.format ? c.format(r[c.key]) : String(r[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      {caption && <p className="mt-2 text-[12px] text-ink-muted">{caption}</p>}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[12px] text-ink-soft">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

// ── Line chart with crosshair + all-series tooltip ──────────────────────────
export function LineChart({
  data,
  xKey,
  lines,
  height = 200,
  xType = 'date',
}: {
  data: Datum[];
  xKey: string;
  lines: { key: string; label: string; dashed?: boolean }[];
  height?: number;
  xType?: XType;
}) {
  const xFormat = xLabel(xType);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const pad = { l: 44, r: 12, t: 10, b: 24 };

  const max = useMemo(
    () => Math.max(1, ...data.flatMap((d) => lines.map((l) => num(d[l.key])))),
    [data, lines],
  );
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);

  if (!data.length) return <p className="py-8 text-center text-[13px] text-ink-muted">No data in this range</p>;

  const ticks = [0, 0.5, 1].map((f) => max * f);
  const xTickIdx = data.length <= 3 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1];

  return (
    <Figure
      rows={data}
      columns={[
        { key: xKey, label: 'Day', format: xFormat },
        ...lines.map((l) => ({ key: l.key, label: l.label, format: (v: unknown) => inShort(v) })),
      ]}
    >
      <Legend items={lines.map((l, i) => ({ label: l.label, color: SERIES_VARS[i % SERIES_VARS.length] }))} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={lines.map((l) => l.label).join(', ')}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
              {inShort(t)}
            </text>
          </g>
        ))}
        {lines.map((l, li) => (
          <polyline
            key={l.key}
            fill="none"
            stroke={SERIES_VARS[li % SERIES_VARS.length]}
            strokeWidth={2}
            strokeDasharray={l.dashed ? '5 4' : undefined}
            strokeLinejoin="round"
            points={data.map((d, i) => `${x(i)},${y(num(d[l.key]))}`).join(' ')}
          />
        ))}
        {xTickIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
            {xFormat(data[i][xKey])}
          </text>
        ))}
        {data.map((_, i) => (
          <rect
            key={i}
            x={x(i) - (W - pad.l - pad.r) / Math.max(1, data.length) / 2}
            y={0}
            width={(W - pad.l - pad.r) / Math.max(1, data.length)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--text-muted)" strokeWidth={1} />
        )}
      </svg>
      {hover !== null && (
        <div className="mt-1 rounded-lg bg-[color:var(--tooltip-bg)] px-3 py-2 text-[12px] text-[color:var(--tooltip-fg)]">
          <strong>{xFormat(data[hover][xKey])}</strong>
          {lines.map((l) => (
            <span key={l.key} className="ml-3">
              {l.label}: {inShort(data[hover][l.key])}
            </span>
          ))}
        </div>
      )}
    </Figure>
  );
}

// ── Stacked / grouped bars ──────────────────────────────────────────────────
export function StackedBars({
  data,
  xKey,
  series,
  height = 210,
  xType = 'date',
}: {
  data: Datum[];
  xKey: string;
  series: { key: string; label: string }[];
  height?: number;
  xType?: XType;
}) {
  const xFormat = xLabel(xType);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = height;
  const pad = { l: 44, r: 12, t: 10, b: 26 };
  const max = Math.max(1, ...data.map((d) => series.reduce((s, x) => s + num(d[x.key]), 0)));
  const slot = (W - pad.l - pad.r) / Math.max(1, data.length);
  const barW = Math.min(24, slot * 0.6);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);

  if (!data.length) return <p className="py-8 text-center text-[13px] text-ink-muted">No data in this range</p>;

  return (
    <Figure
      rows={data}
      columns={[
        { key: xKey, label: 'Bucket', format: xFormat },
        ...series.map((s) => ({ key: s.key, label: s.label, format: (v: unknown) => inShort(v) })),
      ]}
    >
      <Legend items={series.map((s, i) => ({ label: s.label, color: SERIES_VARS[i % SERIES_VARS.length] }))} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} role="img">
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={pad.l}
            x2={W - pad.r}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="var(--grid)"
            strokeWidth={1}
          />
        ))}
        <text x={pad.l - 8} y={y(max) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
          {inShort(max)}
        </text>
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          let acc = 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - slot / 2} y={0} width={slot} height={H} fill="transparent" />
              {series.map((s, si) => {
                const v = num(d[s.key]);
                const y0 = y(acc + v);
                const h = Math.max(0, y(acc) - y(acc + v) - (si > 0 ? 2 : 0)); // 2px surface gap
                acc += v;
                return (
                  <rect
                    key={s.key}
                    x={cx - barW / 2}
                    y={y0}
                    width={barW}
                    height={h}
                    rx={si === series.length - 1 ? 4 : 0}
                    fill={SERIES_VARS[si % SERIES_VARS.length]}
                  />
                );
              })}
            </g>
          );
        })}
        {(data.length <= 3 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1]).map(
          (i) => (
            <text
              key={i}
              x={pad.l + slot * i + slot / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize={11}
              fill="var(--text-muted)"
            >
              {xFormat(data[i][xKey])}
            </text>
          ),
        )}
      </svg>
      {hover !== null && (
        <div className="mt-1 rounded-lg bg-[color:var(--tooltip-bg)] px-3 py-2 text-[12px] text-[color:var(--tooltip-fg)]">
          <strong>{xFormat(data[hover][xKey])}</strong>
          {series.map((s) => (
            <span key={s.key} className="ml-3">
              {s.label}: {inShort(data[hover][s.key])}
            </span>
          ))}
        </div>
      )}
    </Figure>
  );
}

// ── Horizontal bars (chat types, leaderboards, money chart) ─────────────────
export function HBars({
  data,
  labelKey,
  valueKey,
  valueLabel = 'Value',
  suffix = '',
  colorByIndex = false,
}: {
  data: Datum[];
  labelKey: string;
  valueKey: string;
  valueLabel?: string;
  suffix?: string;
  colorByIndex?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => num(d[valueKey])));
  if (!data.length) return <p className="py-6 text-center text-[13px] text-ink-muted">No data</p>;
  return (
    <Figure
      rows={data}
      columns={[
        { key: labelKey, label: 'Item' },
        { key: valueKey, label: valueLabel, format: (v) => `${inShort(v)}${suffix}` },
      ]}
    >
      <div className="flex flex-col gap-2">
        {data.map((d, i) => (
          <div key={i} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[minmax(120px,220px)_1fr_auto]">
            {/* On mobile the label moves above the bar (UI_SPEC §3). */}
            <div className="truncate text-[12.5px] text-ink-soft" title={String(d[labelKey] ?? '')}>
              {String(d[labelKey] ?? '—')}
            </div>
            <div className="h-[14px] w-full overflow-hidden rounded-sm bg-surface-2">
              <div
                className="h-full rounded-r-[4px]"
                style={{
                  width: `${(num(d[valueKey]) / max) * 100}%`,
                  background: colorByIndex
                    ? `var(--seq-${Math.min(7, Math.max(1, Math.round(((i + 1) / data.length) * 7)))})`
                    : SERIES_VARS[i % SERIES_VARS.length],
                }}
              />
            </div>
            <div className="text-right text-[12.5px] tabular-nums text-ink-soft">
              {inShort(d[valueKey])}
              {suffix}
            </div>
          </div>
        ))}
      </div>
    </Figure>
  );
}

// ── Donut (feature split) ───────────────────────────────────────────────────
export function Donut({
  data,
  labelKey,
  valueKey,
}: {
  data: Datum[];
  labelKey: string;
  valueKey: string;
}) {
  const total = data.reduce((s, d) => s + num(d[valueKey]), 0);
  if (!total) return <p className="py-6 text-center text-[13px] text-ink-muted">No usage in this range</p>;
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <Figure
      rows={data}
      columns={[
        { key: labelKey, label: 'Feature' },
        { key: valueKey, label: 'Credits', format: (v) => inShort(v) },
      ]}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <svg viewBox="0 0 160 160" className="h-[160px] w-[160px] shrink-0" role="img">
          <g transform="translate(80,80) rotate(-90)">
            {data.map((d, i) => {
              const frac = num(d[valueKey]) / total;
              const dash = `${Math.max(0, frac * C - 2)} ${C - Math.max(0, frac * C - 2)}`;
              const el = (
                <circle
                  key={i}
                  r={R}
                  fill="none"
                  stroke={SERIES_VARS[i % SERIES_VARS.length]}
                  strokeWidth={22}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += frac * C;
              return el;
            })}
          </g>
          <text x="80" y="84" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--text-primary)">
            {inShort(total)}
          </text>
        </svg>
        <div className="flex flex-col gap-1.5">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[12.5px] text-ink-soft">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: SERIES_VARS[i % SERIES_VARS.length] }}
              />
              <span className="min-w-[130px]">{String(d[labelKey] ?? '—')}</span>
              <span className="tabular-nums">{inShort(d[valueKey])}</span>
              <span className="text-ink-muted">
                ({((num(d[valueKey]) / total) * 100).toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </Figure>
  );
}

// ── Cohort heatmap ──────────────────────────────────────────────────────────
export function Heatmap({ rows }: { rows: Datum[] }) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-ink-muted">No cohorts yet</p>;
  const cell = (size: number, base: number) => {
    if (!base) return 'var(--surface-2)';
    const ratio = size / base;
    const step = Math.min(7, Math.max(1, Math.ceil(ratio * 7)));
    return `var(--seq-${step})`;
  };
  return (
    <Figure
      rows={rows}
      columns={[
        { key: 'cohort', label: 'Cohort', format: (v) => istDate(v as string) },
        { key: 'cohort_size', label: 'Users', format: (v) => inShort(v) },
        { key: 'm1', label: 'M1', format: (v) => inShort(v) },
        { key: 'm2', label: 'M2', format: (v) => inShort(v) },
        { key: 'm3', label: 'M3', format: (v) => inShort(v) },
      ]}
    >
      <div className="table-scroll">
        <table className="pulse">
          <thead>
            <tr>
              <th>Cohort</th>
              <th className="num">Size</th>
              <th className="num">M1</th>
              <th className="num">M2</th>
              <th className="num">M3</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const base = num(r.cohort_size);
              return (
                <tr key={i}>
                  <td>{istDate(r.cohort as string)}</td>
                  <td className="num">{inShort(base)}</td>
                  {(['m1', 'm2', 'm3'] as const).map((k) => (
                    <td key={k} className="num">
                      <span
                        className="inline-block min-w-[42px] rounded px-2 py-[2px] text-ink"
                        style={{ background: cell(num(r[k]), base) }}
                      >
                        {base ? `${Math.round((num(r[k]) / base) * 100)}%` : '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Figure>
  );
}
