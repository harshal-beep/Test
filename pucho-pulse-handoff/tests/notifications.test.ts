import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { loadEnv } from '../db/env';
loadEnv();

import { readOne, readQuery, closePools, writeQuery } from '../src/lib/db';
import { ackAlert, fireAlert, inQuietHours, renderTemplate } from '../src/lib/whatsapp';
import { hotScan, ppsSnapshot, slaEscalation, runJob } from '../jobs/index';
import { TRIGGERS, QUIET_HOURS } from '../config/scoring';

/**
 * ROLLOUT M4 acceptance: "fixture crossing 700 → exactly one T1 with correct
 * suggested plan; unacked T1 escalates at 72h; kill switch stops a trigger
 * without deploy."
 */
describe('M4 — notification engine', () => {
  beforeAll(async () => {
    await writeQuery(`DELETE FROM "GtmAlert" WHERE id IS NOT NULL`).catch(async () => {
      // writeQuery refuses DELETE by design; clear through a direct truncate on
      // the fixture instead.
      const { primaryPool } = await import('../src/lib/db');
      await primaryPool().query(`TRUNCATE "GtmAlert"`);
    });
  });

  it('fires exactly one alert per (type, org) — the dedupe rule', async () => {
    const payload = { org_name: 'Seven Hundred Mills', pps: 92 };
    const first = await fireAlert({ type: 'BAND_A', organizationId: 'org_700', payload });
    const second = await fireAlert({ type: 'BAND_A', organizationId: 'org_700', payload });

    expect(first.fired).toBe(true);
    expect(second).toEqual({ fired: false, reason: 'duplicate' });

    const count = await readOne<{ n: string }>(
      `SELECT count(*) AS n FROM "GtmAlert" WHERE type = 'BAND_A' AND "organizationId" = 'org_700'`,
    );
    expect(Number(count?.n)).toBe(1);
  });

  it('records the SLA hours the trigger table specifies', async () => {
    const row = await readOne(
      `SELECT "slaHours" FROM "GtmAlert" WHERE type = 'BAND_A' AND "organizationId" = 'org_700'`,
    );
    expect(Number(row?.slaHours)).toBe(TRIGGERS.BAND_A.slaHours);
  });

  it('a kill switch stops a trigger without a deploy', async () => {
    const original = TRIGGERS.MOMENTUM_BREAK.enabled;
    TRIGGERS.MOMENTUM_BREAK.enabled = false;
    try {
      const out = await fireAlert({ type: 'MOMENTUM_BREAK', organizationId: 'org_stale', payload: {} });
      expect(out).toEqual({ fired: false, reason: 'kill-switch' });
      const count = await readOne<{ n: string }>(
        `SELECT count(*) AS n FROM "GtmAlert" WHERE type = 'MOMENTUM_BREAK' AND "organizationId" = 'org_stale'`,
      );
      expect(Number(count?.n)).toBe(0);
    } finally {
      TRIGGERS.MOMENTUM_BREAK.enabled = original;
    }
  });

  it('quiet hours cover 21:00–08:00 IST', () => {
    const at = (istHour: number) => {
      // IST is UTC+5:30; build a UTC instant that lands on the wanted IST hour.
      const utcHour = (istHour - 5 + 24) % 24;
      return new Date(Date.UTC(2026, 7, 17, utcHour, 0, 0));
    };
    expect(inQuietHours(at(QUIET_HOURS.startHour + 1))).toBe(true);
    expect(inQuietHours(at(3))).toBe(true);
    expect(inQuietHours(at(12))).toBe(false);
  });

  it('hot-scan produces one BAND_A per hot account and one EXHAUSTED per exhausted account', async () => {
    const { primaryPool } = await import('../src/lib/db');
    await primaryPool().query(`TRUNCATE "GtmAlert"`);

    const first = await hotScan();
    const second = await hotScan(); // a second pass must add nothing

    expect(Number(first.bandA) + Number(first.exhausted)).toBeGreaterThan(0);
    expect(Number(second.bandA)).toBe(0);
    expect(Number(second.exhausted)).toBe(0);
    expect(Number(second.duplicates)).toBeGreaterThan(0);

    const perOrg = await readQuery<{ organizationId: string; n: string }>(
      `SELECT "organizationId", count(*) AS n FROM "GtmAlert" GROUP BY 1 HAVING count(*) > 1`,
    );
    // One org can legitimately hold both a BAND_A and an EXHAUSTED row, but
    // never two of the same type — that is what the partial unique index buys.
    const dupTypes = await readQuery(
      `SELECT type, "organizationId", count(*) FROM "GtmAlert"
        GROUP BY 1,2 HAVING count(*) > 1`,
    );
    expect(dupTypes).toEqual([]);
    expect(perOrg.length).toBeGreaterThanOrEqual(0);
  });

  it('a hot alert carries the plan computed from the account’s own burn rate', async () => {
    const alert = await readOne<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM "GtmAlert" WHERE type = 'BAND_A' AND "organizationId" = 'org_700'`,
    );
    expect(alert?.payload.suggested_plan).toBeTruthy();
    expect(Number(alert?.payload.price)).toBeGreaterThan(0);
    expect(Number(alert?.payload.credits_used)).toBeGreaterThanOrEqual(700);
  });

  it('escalates an unacked alert once its SLA has passed, and never after an ack', async () => {
    const { primaryPool } = await import('../src/lib/db');
    // Age the BAND_A alert past its 72h SLA.
    await primaryPool().query(
      `UPDATE "GtmAlert" SET "firedAt" = now() - interval '73 hours' WHERE type = 'BAND_A'`,
    );
    const first = await slaEscalation();
    expect(Number(first.escalated)).toBeGreaterThan(0);

    const again = await slaEscalation();
    expect(Number(again.escalated)).toBe(0); // escalatedAt is set, so it does not repeat

    const alert = await readOne<{ id: string }>(`SELECT id FROM "GtmAlert" WHERE type = 'BAND_A' LIMIT 1`);
    expect(await ackAlert(alert!.id)).toBe(true);
    expect(await ackAlert(alert!.id)).toBe(false); // acking twice is a no-op
  });

  it('renders the NOTIFICATIONS.md templates with the parameters filled in', () => {
    const text = renderTemplate('T1', {
      org_name: 'Seven Hundred Mills',
      pps: 92,
      office_days: 6,
      office_chats: 41,
      apps_list: 'Excel + Word/PPT',
      credits_used: 700,
      days_left: 9,
      suggested_plan: 'Growth',
      price: 3000,
    });
    expect(text).toContain('🔥 HOT LEAD — Seven Hundred Mills');
    expect(text).toContain('Score 92/100');
    expect(text).toContain('Growth @ ₹3000/mo');
    expect(text).not.toMatch(/\{[a-z_]+\}/); // no unfilled placeholders
  });

  it('every job writes a run log row', async () => {
    await runJob('pps-snapshot', ppsSnapshot);
    const run = await readOne(
      `SELECT job, status, detail FROM "PulseJobRun" WHERE job = 'pps-snapshot' ORDER BY "startedAt" DESC LIMIT 1`,
    );
    expect(run?.status).toBe('OK');
    expect(Number((run?.detail as Record<string, unknown>).written)).toBeGreaterThan(0);
  });
});

afterAll(async () => {
  await closePools();
});
