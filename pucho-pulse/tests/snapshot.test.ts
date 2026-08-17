import { describe, it, expect, afterAll } from 'vitest';
import { loadEnv } from '../db/env';
loadEnv();

import { readOne, readQuery, closePools } from '../src/lib/db';
import { ppsSnapshot } from '../jobs/index';
import { PPS_OFFICE } from '../src/lib/sql/queries';
import { grantScope } from '../src/lib/scope';

/**
 * ROLLOUT M3 acceptance: "snapshot idempotent (re-run = same rows)"; TRD §9:
 * "PropensityLog has exactly one row per grant org per day."
 */
describe('M3 — nightly PPS snapshot', () => {
  it('writes exactly one row per grant org per day, and re-running changes nothing', async () => {
    const first = await ppsSnapshot();
    const afterFirst = await readQuery(
      `SELECT "organizationId", pps, band, components FROM "PropensityLog"
        WHERE "snapshotDate" = current_date ORDER BY "organizationId"`,
    );
    const scored = await readQuery(PPS_OFFICE, [grantScope(), null]);
    expect(afterFirst.length).toBe(scored.length);
    expect(Number(first.written)).toBe(scored.length);

    const second = await ppsSnapshot();
    const afterSecond = await readQuery(
      `SELECT "organizationId", pps, band, components FROM "PropensityLog"
        WHERE "snapshotDate" = current_date ORDER BY "organizationId"`,
    );
    expect(Number(second.written)).toBe(Number(first.written));
    expect(afterSecond).toEqual(afterFirst);

    const dupes = await readQuery(
      `SELECT "organizationId", count(*) FROM "PropensityLog"
        WHERE "snapshotDate" = current_date GROUP BY 1 HAVING count(*) > 1`,
    );
    expect(dupes).toEqual([]);
  });

  it('stores a complete components object for every snapshot', async () => {
    const row = await readOne<{ components: Record<string, number> }>(
      `SELECT components FROM "PropensityLog" WHERE "snapshotDate" = current_date LIMIT 1`,
    );
    expect(Object.keys(row!.components).sort()).toEqual(
      ['depth', 'embed', 'firmo', 'momentum', 'officeBreadth', 'officeHabit', 'officeVolume', 'recency'].sort(),
    );
  });

  it('the stored score equals the sum of its components, clamped to 0–100', async () => {
    const rows = await readQuery<{ pps: number; components: Record<string, number> }>(
      `SELECT pps, components FROM "PropensityLog" WHERE "snapshotDate" = current_date`,
    );
    for (const r of rows) {
      const sum = Object.values(r.components).reduce((a, b) => a + b, 0);
      expect(Number(r.pps)).toBe(Math.max(0, Math.min(100, sum)));
    }
  });
});

afterAll(async () => {
  await closePools();
});
