/**
 * PPS v0.1 (Office edition) in TypeScript — the same scorecard the canonical
 * PPS_OFFICE query computes in SQL, driven entirely by config/scoring.ts.
 *
 * Why both exist: the SQL version is what the dashboard and the nightly job
 * read (ALGORITHMS.md: "the SQL is truth for v0/v0.1"), while this version is
 * what tests/pps.test.ts scores every fixture account with, asserting the two
 * agree. That turns "weights live in config/scoring.ts" from a convention into
 * something the build enforces: change a weight in config without mirroring it
 * in the SQL and the test fails.
 */
import { PPS, bandOf, type PpsBand } from '../../config/scoring';

/** The per-org signals the SQL `sig` CTE produces. */
export interface PpsSignals {
  usedTotal: number;
  officeChats: number;
  officeApps: number;
  officeDays14: number;
  officeUsers: number;
  office7d: number;
  officePrior7: number;
  nonOfficeChats: number;
  lastOffice: Date | null;
  usesOwnDocs: boolean;
  hasWorkflow: boolean;
  industry: string | null;
  companySize: string | null;
}

export interface PpsComponents {
  depth: number;
  officeHabit: number;
  officeBreadth: number;
  officeVolume: number;
  embed: number;
  momentum: number;
  firmo: number;
  recency: number;
}

export interface PpsResult {
  pps: number;
  band: PpsBand;
  wrongLane: boolean;
  components: PpsComponents;
}

/** Postgres ROUND() is half-away-from-zero; JS Math.round is half-up. Match Postgres. */
function pgRound(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}

export function scoreComponents(s: PpsSignals, now: Date = new Date()): PpsComponents {
  const depth = Math.min(PPS.depth.cap, pgRound(s.usedTotal / PPS.depth.divisor));
  const officeHabit = Math.min(PPS.officeHabit.cap, s.officeDays14 * PPS.officeHabit.perDay);
  const officeBreadth = Math.min(PPS.officeBreadth.cap, s.officeApps * PPS.officeBreadth.perApp);
  const officeVolume = Math.min(PPS.officeVolume.cap, pgRound(s.officeChats / PPS.officeVolume.divisor));

  const embed =
    (s.usesOwnDocs ? PPS.embed.ownDocs : 0) +
    (s.officeUsers >= PPS.embed.multiUserThreshold ? PPS.embed.multiUser : 0) +
    (s.hasWorkflow ? PPS.embed.workflow : 0);

  const momentum =
    s.office7d > 0 && s.office7d >= s.officePrior7
      ? PPS.momentum.rising
      : s.office7d > 0
        ? PPS.momentum.decaying
        : PPS.momentum.dead;

  const { targetIndustries, targetSizes, targetPoints, midSizes, midPoints } = PPS.firmo;
  const firmo =
    s.industry && (targetIndustries as readonly string[]).includes(s.industry) &&
    s.companySize && (targetSizes as readonly string[]).includes(s.companySize)
      ? targetPoints
      : s.companySize && (midSizes as readonly string[]).includes(s.companySize)
        ? midPoints
        : 0;

  let recency = 0;
  if (s.lastOffice) {
    const ageDays = (now.getTime() - s.lastOffice.getTime()) / 86_400_000;
    if (ageDays > PPS.recency.deadDays) recency = PPS.recency.deadPenalty;
    else if (ageDays > PPS.recency.staleDays) recency = PPS.recency.stalePenalty;
  }

  return { depth, officeHabit, officeBreadth, officeVolume, embed, momentum, firmo, recency };
}

export function scorePps(s: PpsSignals, now: Date = new Date()): PpsResult {
  const components = scoreComponents(s, now);
  const raw = Object.values(components).reduce((a, b) => a + b, 0);
  const pps = Math.max(PPS.clamp.min, Math.min(PPS.clamp.max, raw));
  const wrongLane =
    s.officeChats === PPS.wrongLane.officeChats && s.nonOfficeChats >= PPS.wrongLane.nonOfficeChatsAtLeast;
  return { pps, band: bandOf(pps, wrongLane), wrongLane, components };
}

/** Map a PPS_OFFICE result row onto the signal shape (used by tests and jobs). */
export function signalsFromRow(row: Record<string, unknown>): PpsSignals {
  const num = (v: unknown) => Number(v ?? 0);
  return {
    usedTotal: num(row.used_total),
    officeChats: num(row.office_chats),
    officeApps: num(row.office_apps),
    officeDays14: num(row.office_days_14),
    officeUsers: num(row.office_users),
    office7d: num(row.office_7d),
    officePrior7: num(row.office_prior7),
    nonOfficeChats: num(row.non_office_chats),
    lastOffice: row.last_office ? new Date(row.last_office as string) : null,
    usesOwnDocs: Boolean(row.uses_own_docs),
    hasWorkflow: Boolean(row.has_workflow),
    industry: (row.industry as string | null) ?? null,
    companySize: (row.companySize as string | null) ?? null,
  };
}

/**
 * Suggested plan for a hot account (NOTIFICATIONS §3): monthly-ise the burn rate
 * and pick the smallest plan whose credit quota covers it.
 */
export function suggestPlan(
  creditsUsed: number,
  daysActive: number,
  plans: { id: string; title: string; price: number; credit: number }[],
): { plan: { id: string; title: string; price: number; credit: number } | null; monthlyBurn: number } {
  const monthlyBurn = daysActive > 0 ? Math.round((creditsUsed / daysActive) * 30) : creditsUsed;
  const sorted = [...plans].sort((a, b) => a.credit - b.credit);
  const plan = sorted.find((p) => p.credit >= monthlyBurn) ?? sorted[sorted.length - 1] ?? null;
  return { plan: plan ?? null, monthlyBurn };
}
