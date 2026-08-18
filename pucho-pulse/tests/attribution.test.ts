import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { loadEnv } from '../db/env';
loadEnv();

import { readOne, readQuery, closePools, writeQuery } from '../src/lib/db';
import { createWorkshop, patchWorkshop, register, getWorkshopByToken } from '../src/lib/workshops';
import { G1_WORKSHOP_FUNNEL } from '../src/lib/sql/queries';
import { GRANT_CREDITS } from '../config/scoring';

/**
 * ROLLOUT M1 acceptance, end to end:
 *   "register through a QR → org row has workshopId/signupSegment/signupSource/
 *    channelPartnerId; grant wallet exists; G1 returns the row; double-submit
 *    same phone = one org."
 */
describe('M1 — attribution chain', () => {
  let workshopId: string;
  let token: string;
  const phone = '9876500001';

  beforeAll(async () => {
    const created = await createWorkshop({
      workshopDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
      segmentName: 'CA & Accounting',
      campaignTag: 'SEP26-WEB-CA',
      channelPartnerId: 'cp_alpha',
      invitedCount: 25,
      workbookUrl: 'https://pucho.ai/workbook/office',
    });
    workshopId = String(created.workshop.id);
    token = String(created.workshop.registrationToken);
  });

  it('generates a unique registration token and a scannable QR', async () => {
    expect(token).toMatch(/^[A-Z2-9]{10}$/);
    const again = await createWorkshop({
      workshopDate: new Date().toISOString().slice(0, 19).replace('T', ' '),
      segmentName: 'Textiles',
      invitedCount: 10,
    });
    expect(again.workshop.registrationToken).not.toBe(token);
    expect(again.qr.startsWith('data:image/png;base64,')).toBe(true);
    expect(again.registrationUrl).toContain(`/r/${again.workshop.registrationToken}`);
  });

  it('stamps all four attribution fields and provisions the 1,000-credit grant', async () => {
    const result = await register(token, {
      companyName: 'QR Registered Pvt Ltd',
      fullName: 'Test Attendee',
      phone,
      otp: '000000', // OTP is verified at the route layer, not here
      email: 'qr.attendee@example.in',
      industry: 'Chemicals',
      companySize: '51-200',
    });
    expect(result.created).toBe(true);

    const org = await readOne(
      `SELECT "workshopId", "signupSegment", "signupSource", "channelPartnerId", industry, "companySize"
         FROM "Organization" WHERE id = $1`,
      [result.organizationId],
    );
    expect(org).toEqual({
      workshopId: workshopId,
      signupSegment: 'CA & Accounting',
      signupSource: 'WORKSHOP',
      channelPartnerId: 'cp_alpha',
      industry: 'Chemicals',
      companySize: '51-200',
    });

    const wallet = await readOne(
      `SELECT allocated, "isActive" FROM "CreditWallets" WHERE "organizationId" = $1 AND type = 'BONUS'`,
      [result.organizationId],
    );
    expect(Number(wallet?.allocated)).toBe(GRANT_CREDITS);
    expect(wallet?.isActive).toBe(true);

    const link = await readOne(
      `SELECT ou.id FROM "OrganizationUser" ou WHERE ou."organizationId" = $1 AND ou."userId" = $2`,
      [result.organizationId, result.userId],
    );
    expect(link).toBeTruthy();
  });

  it('is idempotent per phone + workshop — a double submit creates one org', async () => {
    const second = await register(token, {
      companyName: 'QR Registered Pvt Ltd (retry)',
      fullName: 'Test Attendee',
      phone: `+91${phone}`, // same number, different formatting
      otp: '000000',
      email: 'qr.attendee@example.in',
      industry: 'Chemicals',
      companySize: '51-200',
    });
    expect(second.created).toBe(false);

    const count = await readOne<{ n: string }>(
      `SELECT count(*) AS n FROM "Organization" WHERE "workshopId" = $1`,
      [workshopId],
    );
    expect(Number(count?.n)).toBe(1);
  });

  it('the new account appears in the G1 funnel under its workshop', async () => {
    const rows = await readQuery(G1_WORKSHOP_FUNNEL, [null, null]);
    const row = rows.find((r) => r.workshop_id === workshopId);
    expect(row).toBeTruthy();
    expect(Number(row!.accounts_created)).toBe(1);
    expect(row!.segment).toBe('CA & Accounting');
    expect(row!.campaign_tag).toBe('SEP26-WEB-CA');
  });

  it('attendance entry marks the workshop delivered', async () => {
    const updated = await patchWorkshop(workshopId, { attendedCount: 18, status: 'DELIVERED' });
    expect(Number(updated?.attendedCount)).toBe(18);
    expect(updated?.status).toBe('DELIVERED');
    const reread = await getWorkshopByToken(token);
    expect(reread?.status).toBe('DELIVERED');
  });

  it('refuses to write any production table Pulse does not own', async () => {
    await expect(
      writeQuery(`UPDATE "Package" SET price = 1 WHERE id = 'pkg_growth'`),
    ).rejects.toThrow(/READ-ONLY/);
    await expect(
      writeQuery(`UPDATE "Organization" SET name = 'nope' WHERE id = 'org_700'`),
    ).rejects.toThrow(/READ-ONLY/);
    await expect(writeQuery(`DELETE FROM "GtmAlert" WHERE id = 'x'`)).rejects.toThrow(/never deletes/);
  });
});

afterAll(async () => {
  await closePools();
});
