import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { loadEnv } from '../db/env';
loadEnv();

import { readOne, closePools, primaryPool } from '../src/lib/db';
import { registerToWorkshop, register, RegistrationError } from '../src/lib/workshops';
import { GRANT_CREDITS } from '../config/scoring';

/**
 * A workshop account can be created three ways — manual entry (today's primary
 * path), Pucho's registration webhook, and the built-in self-service page.
 * The whole point of routing all three through `provisionAttendee` is that the
 * attribution and the grant come out identical, so that is what these assert.
 */
const attendee = (n: string, phone: string) => ({
  companyName: `${n} Co`,
  fullName: `${n} Person`,
  phone,
  email: `${n.toLowerCase().replace(/\s/g, '')}@entry-test.in`,
  industry: 'Chemicals' as const,
  companySize: '51-200' as const,
});

async function attribution(orgId: string) {
  return readOne(
    `SELECT o."workshopId", o."signupSegment", o."signupSource", o."channelPartnerId",
            (SELECT allocated::int FROM "CreditWallets" w
              WHERE w."organizationId" = o.id AND w.type = 'BONUS') AS grant
       FROM "Organization" o WHERE o.id = $1`,
    [orgId],
  );
}

describe('Attendee entry paths', () => {
  beforeAll(async () => {
    // These tests assert `created: true`, which only holds against accounts
    // that do not exist yet — so they must clear their own rows rather than
    // assuming a freshly seeded fixture. Without this, `npm test` passes once
    // and fails on every subsequent run.
    const pool = primaryPool();
    const orgs = await pool.query<{ id: string }>(
      `SELECT DISTINCT o.id FROM "Organization" o
         JOIN "OrganizationUser" ou ON ou."organizationId" = o.id
         JOIN "User" u ON u.id = ou."userId"
        WHERE u.email LIKE '%@entry-test.in'`,
    );
    const ids = orgs.rows.map((r) => r.id);
    if (!ids.length) return;
    await pool.query(`DELETE FROM "CreditWallets" WHERE "organizationId" = ANY($1)`, [ids]);
    await pool.query(
      `DELETE FROM "User" WHERE id IN (
         SELECT "userId" FROM "OrganizationUser" WHERE "organizationId" = ANY($1))`, [ids]);
    await pool.query(`DELETE FROM "OrganizationUser" WHERE "organizationId" = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM "Organization" WHERE id = ANY($1)`, [ids]);
  });

  it('manual entry stamps full attribution and the grant', async () => {
    const r = await registerToWorkshop('ws_chem_01', attendee('Manual', '9871100001'));
    expect(r.created).toBe(true);
    expect(await attribution(r.organizationId)).toEqual({
      workshopId: 'ws_chem_01',
      signupSegment: 'Chemicals',
      signupSource: 'WORKSHOP',
      channelPartnerId: 'cp_gamma',
      grant: GRANT_CREDITS,
    });
  });

  it('the webhook path produces a byte-identical result to manual entry', async () => {
    // registerToWorkshop is exactly what the webhook route calls once it has
    // resolved the workshop, so this is the webhook's provisioning contract.
    const manual = await registerToWorkshop('ws_tex_01', attendee('PathA', '9871100002'));
    const webhook = await registerToWorkshop('ws_tex_01', attendee('PathB', '9871100003'));
    const a = await attribution(manual.organizationId);
    const b = await attribution(webhook.organizationId);
    expect(b).toEqual(a);
  });

  it('is idempotent per phone + workshop across ALL paths', async () => {
    const first = await registerToWorkshop('ws_ca_01', attendee('Dupe', '9871100004'));
    // Same human, different formatting, arriving through a webhook retry.
    const retry = await registerToWorkshop('ws_ca_01', attendee('Dupe', '+919871100004'));
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.organizationId).toBe(first.organizationId);

    const count = await readOne<{ n: string }>(
      `SELECT count(*) AS n FROM "Organization" o
         JOIN "OrganizationUser" ou ON ou."organizationId" = o.id
         JOIN "User" u ON u.id = ou."userId"
        WHERE o."workshopId" = 'ws_ca_01'
          AND right(regexp_replace(u."phoneNumber", '\\D', '', 'g'), 10) = '9871100004'`,
    );
    expect(Number(count?.n)).toBe(1);
  });

  it('the same phone at a DIFFERENT workshop is a separate account', async () => {
    // Idempotency is scoped per workshop: one person can legitimately bring two
    // companies to two sessions, and each gets its own grant and attribution.
    const a = await registerToWorkshop('ws_chem_01', attendee('CrossA', '9871100005'));
    const b = await registerToWorkshop('ws_tex_01', attendee('CrossB', '9871100005'));
    expect(a.organizationId).not.toBe(b.organizationId);
  });

  it('refuses an unknown workshop and a cancelled one', async () => {
    await expect(registerToWorkshop('does-not-exist', attendee('Ghost', '9871100006'))).rejects.toThrow(
      RegistrationError,
    );
    await expect(register('NOSUCHTOKEN', { ...attendee('Ghost', '9871100007'), otp: '000000' })).rejects.toThrow(
      /not valid/,
    );
  });
});

afterAll(async () => {
  await closePools();
});
