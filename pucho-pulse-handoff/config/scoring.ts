/**
 * config/scoring.ts — the ONLY place weights, thresholds, and GTM constants live.
 * Per CLAUDE.md: "All scoring weights, thresholds, credit value (₹0.30), grant size
 * (1,000) live in config/scoring.ts. Never hardcode them elsewhere."
 *
 * Sources: docs/ALGORITHMS.md §1 (PPS v0.1 Office edition), §3 (partner health),
 * §4 (benchmarks/red lines), §5 (GTM economics); docs/NOTIFICATIONS.md (SLAs, quiet
 * hours, kill switches).
 *
 * Changing a weight here + re-running the pps-snapshot job is the entire calibration
 * loop (ROLLOUT M6 acceptance criterion).
 */

// ── GTM economics constants (ALGORITHMS §5) ─────────────────────────────────
export const CREDIT_VALUE_INR = Number(process.env.CREDIT_VALUE_INR ?? 0.3);
export const GRANT_CREDITS = Number(process.env.GRANT_CREDITS ?? 1000);
export const TIMEZONE = 'Asia/Kolkata';

// ── PPS v0.1 — Pucho Office edition (ALGORITHMS §1) ─────────────────────────
export const PPS = {
  /** Office habit: min(cap, office_days_14 × perDay). Full marks ~6 Office days /14. */
  officeHabit: { cap: 25, perDay: 4 },
  /** Credit depth: min(cap, round(credits_used / divisor)). Full marks at 700 credits. */
  depth: { cap: 20, divisor: 35 },
  /** Office app breadth: min(cap, office_apps × perApp). Excel+Word+PPT = full. */
  officeBreadth: { cap: 12, perApp: 4 },
  /** Office volume: min(cap, round(office_chats / divisor)). Full at 50 Office chats. */
  officeVolume: { cap: 10, divisor: 5 },
  /** Embedding: own docs + ≥2 Office users + any workflow (sums to 15). */
  embed: { ownDocs: 6, multiUser: 6, workflow: 3, multiUserThreshold: 2 },
  /** Momentum: rising/steady vs decaying vs dead. */
  momentum: { rising: 10, decaying: 4, dead: 0 },
  /** Firmographic prior — replace the CASE with live P1 rates monthly (ALGORITHMS §6). */
  firmo: {
    targetIndustries: ['Chemicals', 'Textiles', 'Agri inputs', 'Pharma', 'Engineering'],
    targetSizes: ['51-200', '201-500'],
    targetPoints: 8,
    midSizes: ['11-50', '51-200'],
    midPoints: 4,
  },
  /** Recency penalty on last Office activity. */
  recency: { staleDays: 7, stalePenalty: -10, deadDays: 14, deadPenalty: -20 },
  /** Score clamp. */
  clamp: { min: 0, max: 100 },
  /** Wrong-lane override: no Office at all but busy elsewhere → re-demo, never a close. */
  wrongLane: { officeChats: 0, nonOfficeChatsAtLeast: 10 },
  /** Band cut-offs (inclusive lower bounds). W is an override, not a cut-off. */
  bands: { A: 70, B: 45, C: 20 },
  /** Score is meaningless before this many days post-registration (ALGORITHMS §1). */
  minAccountAgeDays: 3,
} as const;

export type PpsBand = 'A' | 'B' | 'C' | 'D' | 'W';

export const BAND_ACTION: Record<PpsBand, string> = {
  A: 'Close within 72h — send close kit',
  B: 'Push to aha event',
  C: 'Re-onboard (15-min workbook session on own data)',
  D: 'Automated drip only — no partner hours',
  W: 'Office re-demo on their own files — never a close attempt',
};

export const BAND_LABEL: Record<PpsBand, string> = {
  A: 'A — close now',
  B: 'B — push to aha',
  C: 'C — re-onboard',
  D: 'D — recycle',
  W: 'W — wrong lane (re-demo Office)',
};

// ── Partner health score (ALGORITHMS §3, SQL A2) ────────────────────────────
export const PARTNER_HEALTH = {
  engagement: { points: 30, fullAt: 0.5, engagedCreditsAtLeast: 300 },
  conversion: { points: 30, fullAt: 0.05 },
  zeroUse: { points: 20, fullAt: 0.8 }, // full marks at ≤20% zero-use
  velocity: { points: 20, fullAt: 0.4, fastStartHours: 48 },
  grades: { A: 80, B: 60, C: 40 },
} as const;

// ── Grant benchmark red lines (ALGORITHMS §4) ───────────────────────────────
export const BENCHMARKS = {
  utilizationHealthy: [0.5, 0.75] as const,
  exhaustionSweetSpot: [0.2, 0.4] as const,
  neverLandedRedLine: 0.35, // >35% of accounts under 100 credits = red
  neverLandedCredits: 100,
  medianDaysTo300Target: 14,
  medianDaysToExhaustionHealthy: [25, 45] as const,
  targetConversionPct: 3,
  segmentKillLinePct: 1, // <1% conversion after 4 workshops → kill the segment
  segmentKillMinWorkshops: 4,
  usageBands: [
    { key: 'a', label: '0–99 (never landed)', min: 0, max: 99 },
    { key: 'b', label: '100–299 (tried it)', min: 100, max: 299 },
    { key: 'c', label: '300–699 (engaged)', min: 300, max: 699 },
    { key: 'd', label: '700–999 (hot)', min: 700, max: 999 },
    { key: 'e', label: '1000+ (exhausted)', min: 1000, max: Infinity },
  ],
  hotThresholdCredits: 700,
  engagedThresholdCredits: 300,
} as const;

// ── Notification triggers (NOTIFICATIONS §1 + §3) ───────────────────────────
export type AlertType =
  | 'BAND_A'
  | 'EXHAUSTED'
  | 'OFFICE_NOUSE_72H'
  | 'MOMENTUM_BREAK'
  | 'WRONG_LANE'
  | 'EXCEL_ONLY'
  | 'SINGLE_PLAYER'
  | 'ZERO_USE_7D'
  | 'ZERO_USE_14D'
  | 'DIGEST'
  | 'SCORECARD';

export const TRIGGERS: Record<
  AlertType,
  { enabled: boolean; slaHours: number | null; template: string; priority: number }
> = {
  BAND_A: { enabled: true, slaHours: 72, template: 'T1', priority: 1 },
  EXHAUSTED: { enabled: true, slaHours: 24, template: 'T2', priority: 2 },
  OFFICE_NOUSE_72H: { enabled: true, slaHours: null, template: 'T3', priority: 3 },
  MOMENTUM_BREAK: { enabled: true, slaHours: 48, template: 'T4', priority: 4 },
  WRONG_LANE: { enabled: true, slaHours: 168, template: 'T5', priority: 5 },
  EXCEL_ONLY: { enabled: true, slaHours: null, template: 'T6', priority: 6 },
  SINGLE_PLAYER: { enabled: true, slaHours: null, template: 'T7', priority: 7 },
  ZERO_USE_7D: { enabled: true, slaHours: null, template: 'T8', priority: 8 },
  ZERO_USE_14D: { enabled: true, slaHours: null, template: 'T8', priority: 8 },
  DIGEST: { enabled: true, slaHours: null, template: 'T9', priority: 9 },
  SCORECARD: { enabled: true, slaHours: null, template: 'T10', priority: 10 },
};

/** Quiet hours IST — no partner sends before 08:00 or after 21:00; real-time triggers queue. */
export const QUIET_HOURS = { startHour: 21, endHour: 8 } as const;

/** Nudge thresholds used by the scan jobs (NOTIFICATIONS §1). */
export const NUDGE = {
  momentumBreakSilentDays: 5,
  officeNoUseHours: 72,
  excelOnlyDay: 14,
  singlePlayerDay: 14,
  singlePlayerCredits: 400,
  zeroUseDays: [7, 14] as const,
  bonusCarryCredits: 200,
  bonusCarryWindowDays: 7,
} as const;

// ── Feature → colour mapping (UI_SPEC §1 — fixed order, never re-assigned) ──
export const SERIES_ORDER = ['Chat / Search', 'Workflow (Studio)', 'Agent', 'Voice', 'Other'] as const;

export function bandOf(pps: number, wrongLane: boolean): PpsBand {
  if (wrongLane) return 'W';
  if (pps >= PPS.bands.A) return 'A';
  if (pps >= PPS.bands.B) return 'B';
  if (pps >= PPS.bands.C) return 'C';
  return 'D';
}

export function partnerGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= PARTNER_HEALTH.grades.A) return 'A';
  if (score >= PARTNER_HEALTH.grades.B) return 'B';
  if (score >= PARTNER_HEALTH.grades.C) return 'C';
  return 'D';
}
