/**
 * Partner health score (ALGORITHMS.md §3) in TypeScript, driven by
 * config/scoring.ts PARTNER_HEALTH — the same doc-vs-SQL agreement pattern as
 * PPS: tests/partner-health.test.ts scores every fixture partner both ways and
 * requires agreement, so the clamped A2 query can never drift from the
 * documented formula.
 */
import { PARTNER_HEALTH } from '../../config/scoring';

export interface PartnerCounts {
  accounts: number;
  engaged: number;   // ≥300 grant credits
  converted: number;
  zeroUse: number;
  fastStart: number; // first credit use within 48h
}

export interface HealthComponents {
  engagement: number;
  conversion: number;
  zeroUse: number;
  velocity: number;
  total: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function partnerHealth(c: PartnerCounts): HealthComponents {
  const { engagement, conversion, zeroUse, velocity } = PARTNER_HEALTH;
  if (c.accounts === 0) {
    return { engagement: 0, conversion: 0, zeroUse: 0, velocity: 0, total: 0 };
  }
  const e = round1(engagement.points * Math.min(1, c.engaged / c.accounts / engagement.fullAt));
  const cv = round1(conversion.points * Math.min(1, c.converted / c.accounts / conversion.fullAt));
  const z = round1(zeroUse.points * Math.min(1, (1 - c.zeroUse / c.accounts) / zeroUse.fullAt));
  const v = round1(velocity.points * Math.min(1, c.fastStart / c.accounts / velocity.fullAt));
  return {
    engagement: e,
    conversion: cv,
    zeroUse: z,
    velocity: v,
    total: Math.min(100, Math.round(e + cv + z + v)),
  };
}
