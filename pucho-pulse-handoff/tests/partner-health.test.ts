import { describe, it, expect, afterAll } from 'vitest';
import { loadEnv } from '../db/env';
loadEnv();

import { readOne, readQuery, closePools } from '../src/lib/db';
import { A2_PARTNER_HEALTH } from '../src/lib/sql/queries';
import { partnerHealth } from '../src/lib/health';
import { PARTNER_HEALTH } from '../config/scoring';

/**
 * Re-validation for the A2 divergence (audit F1): the clamped SQL must agree
 * with a TypeScript implementation of the ALGORITHMS.md §3 formula on every
 * fixture partner, and no component may exceed its cap.
 */
describe('A2 — partner health (clamped per ALGORITHMS §3)', () => {
  it('every component stays within its cap and the SQL matches the documented formula', async () => {
    const rows = await readQuery(A2_PARTNER_HEALTH, [null]);
    expect(rows.length).toBeGreaterThan(0);

    for (const r of rows) {
      const counts = await readOne<{
        accounts: string; engaged: string; converted: string; zero_use: string; fast_start: string;
      }>(
        `SELECT COUNT(*) AS accounts,
                COUNT(*) FILTER (WHERE u.used >= 300) AS engaged,
                COUNT(*) FILTER (WHERE u.converted)   AS converted,
                COUNT(*) FILTER (WHERE u.used = 0)    AS zero_use,
                COUNT(*) FILTER (WHERE u.first_use <= o."createdAt" + interval '48 hours') AS fast_start
           FROM "Organization" o
           JOIN LATERAL (
             SELECT COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f WHERE f."organizationId"=o.id),0) AS used,
                    (SELECT MIN(f."createdAt") FROM "FreeCreditUsage" f WHERE f."organizationId"=o.id) AS first_use,
                    EXISTS (SELECT 1 FROM "OrganizationPackage" op
                            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
           ) u ON true
          WHERE o."channelPartnerId" = $1`,
        [r.partner_id],
      );
      const ts = partnerHealth({
        accounts: Number(counts!.accounts),
        engaged: Number(counts!.engaged),
        converted: Number(counts!.converted),
        zeroUse: Number(counts!.zero_use),
        fastStart: Number(counts!.fast_start),
      });

      expect(Number(r.engagement_pts), `${r.partner} engagement`).toBeLessThanOrEqual(PARTNER_HEALTH.engagement.points);
      expect(Number(r.conversion_pts), `${r.partner} conversion`).toBeLessThanOrEqual(PARTNER_HEALTH.conversion.points);
      expect(Number(r.zero_use_pts), `${r.partner} zero-use`).toBeLessThanOrEqual(PARTNER_HEALTH.zeroUse.points);
      expect(Number(r.velocity_pts), `${r.partner} velocity`).toBeLessThanOrEqual(PARTNER_HEALTH.velocity.points);

      expect(
        {
          e: Number(r.engagement_pts), c: Number(r.conversion_pts),
          z: Number(r.zero_use_pts), v: Number(r.velocity_pts), total: Number(r.health_score),
        },
        `mismatch for ${r.partner}`,
      ).toEqual({ e: ts.engagement, c: ts.conversion, z: ts.zeroUse, v: ts.velocity, total: ts.total });
    }
  });

  it('scores now differentiate partners instead of saturating everyone to A', async () => {
    const rows = await readQuery(A2_PARTNER_HEALTH, [null]);
    const scores = rows.map((r) => Number(r.health_score));
    // Uncapped components pushed every fixture partner to ~100. Clamped, the
    // fixture's weakest partner must sit measurably below the strongest.
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(0);
    expect(Math.min(...scores)).toBeLessThan(100);
  });
});

afterAll(async () => {
  await closePools();
});
