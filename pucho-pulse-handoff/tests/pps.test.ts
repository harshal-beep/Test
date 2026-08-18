import { describe, it, expect, afterAll } from 'vitest';
import { loadEnv } from '../db/env';
loadEnv();

import { readQuery, closePools } from '../src/lib/db';
import { PPS_OFFICE } from '../src/lib/sql/queries';
import { scorePps, signalsFromRow } from '../src/lib/pps';
import { ORGS } from '../db/fixture/seed';
import { PPS } from '../config/scoring';

/**
 * ROLLOUT M3 acceptance: "fixture accounts land in expected bands incl. W-override
 * and recency penalties; components jsonb complete."
 *
 * The first test is the one that keeps config/scoring.ts honest: the SQL
 * scorecard and the TypeScript scorecard must agree on every account, so a
 * weight changed in config without mirroring it in PPS_OFFICE fails here.
 */
describe('PPS v0.1 — Office edition', () => {
  it('the SQL scorecard and config/scoring.ts agree on every grant account', async () => {
    const rows = await readQuery(PPS_OFFICE, [null, null]);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      const ts = scorePps(signalsFromRow(row));
      expect(
        {
          org: row.name,
          pps: ts.pps,
          band: ts.band,
          depth: ts.components.depth,
          habit: ts.components.officeHabit,
          breadth: ts.components.officeBreadth,
          volume: ts.components.officeVolume,
          embed: ts.components.embed,
          momentum: ts.components.momentum,
          firmo: ts.components.firmo,
          recency: ts.components.recency,
        },
        `mismatch on ${String(row.name)}`,
      ).toEqual({
        org: row.name,
        pps: Number(row.pps),
        band: String(row.band),
        depth: Number(row.pts_depth),
        habit: Number(row.pts_office_habit),
        breadth: Number(row.pts_office_breadth),
        volume: Number(row.pts_office_volume),
        embed: Number(row.pts_embed),
        momentum: Number(row.pts_momentum),
        firmo: Number(row.pts_firmo),
        recency: Number(row.pts_recency),
      });
    }
  });

  it('fixture accounts land in their expected bands', async () => {
    const rows = await readQuery(PPS_OFFICE, [null, null]);
    const byId = new Map(rows.map((r) => [String(r.org_id), r]));
    const expected = ORGS.filter((o) => o.expectBand);
    expect(expected.length).toBeGreaterThan(0);

    for (const spec of expected) {
      const row = byId.get(spec.id);
      expect(row, `${spec.id} missing from PPS output`).toBeTruthy();
      expect(String(row!.band), `${spec.name}: ${spec.note ?? ''}`).toBe(spec.expectBand);
    }
  });

  it('the wrong-lane override beats the score, never the other way round', async () => {
    const rows = await readQuery(PPS_OFFICE, [null, null]);
    const wrong = rows.filter((r) => r.wrong_lane);
    expect(wrong.length).toBeGreaterThan(0);
    for (const r of wrong) {
      expect(Number(r.office_chats)).toBe(PPS.wrongLane.officeChats);
      expect(Number(r.non_office_chats)).toBeGreaterThanOrEqual(PPS.wrongLane.nonOfficeChatsAtLeast);
      // W is an override: a wrong-lane account is never listed as closeable.
      expect(String(r.band)).toBe('W');
    }
  });

  it('applies the recency penalty to accounts silent for more than 14 days', async () => {
    const rows = await readQuery(PPS_OFFICE, [null, null]);
    const stale = rows.find((r) => r.org_id === 'org_stale');
    expect(stale).toBeTruthy();
    expect(Number(stale!.pts_recency)).toBe(PPS.recency.deadPenalty);
  });

  it('never scores outside 0–100', async () => {
    const rows = await readQuery(PPS_OFFICE, [null, null]);
    for (const r of rows) {
      expect(Number(r.pps)).toBeGreaterThanOrEqual(PPS.clamp.min);
      expect(Number(r.pps)).toBeLessThanOrEqual(PPS.clamp.max);
    }
  });

  it('excludes accounts outside the grant scope', async () => {
    const workshopScoped = await readQuery(PPS_OFFICE, ['WORKSHOP', null]);
    expect(workshopScoped.some((r) => r.org_id === 'org_direct')).toBe(false);
  });
});

afterAll(async () => {
  await closePools();
});
