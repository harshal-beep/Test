import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { loadEnv } from '../db/env';
loadEnv();

import { readOne, writeQuery, closePools, primaryPool } from '../src/lib/db';
import { dataGaps, partnerInputs } from '../src/lib/metrics';

/** The missing-data inputs system: gaps are detected and settings are writable. */
describe('Inputs — missing-data system', () => {
  beforeAll(async () => {
    // The upsert test below creates cp_beta's row; reset so the gap assertions
    // hold on every run, not just the first after a reseed.
    await primaryPool().query(`DELETE FROM "PulsePartnerSettings" WHERE "channelPartnerId" = 'cp_beta'`);
  });

  it('surfaces the seeded gaps with their owners', async () => {
    const gaps = await dataGaps();
    // cp_gamma has no phoneNumber and no whatsappNumber override… but the
    // seed gives gamma a settings row WITH a whatsapp number, so only partners
    // with neither should appear. Beta has a phone, Alpha has both.
    expect(gaps.partnersNoPhone.map((p) => p.id)).toEqual([]);
    // Beta deliberately has no settings row → language unknown.
    expect(gaps.partnersNoSettings.map((p) => p.id)).toContain('cp_beta');
    // org_direct is seeded without an industry.
    expect(gaps.orgsNoFirmo.map((o) => o.id)).toContain('org_direct');
    // Enterprise plan has no credit quota.
    expect(gaps.packagesNoQuota.map((p) => p.id)).toContain('pkg_enterprise');
    // The scheduled workshop was seeded without a workbook link.
    expect(gaps.workshopsNoWorkbook.map((w) => w.id)).toContain('ws_ca_02');
  });

  it('partner settings upsert followed by read-back round-trips', async () => {
    await writeQuery(
      `INSERT INTO "PulsePartnerSettings"
         ("channelPartnerId", "preferredLanguage", "whatsappNumber", "digestEnabled", notes, "updatedAt")
       VALUES ('cp_beta', 'gu', '9812399999', false, 'test note', now())
       ON CONFLICT ("channelPartnerId")
       DO UPDATE SET "preferredLanguage" = EXCLUDED."preferredLanguage",
                     "whatsappNumber" = EXCLUDED."whatsappNumber",
                     "digestEnabled" = EXCLUDED."digestEnabled",
                     notes = EXCLUDED.notes, "updatedAt" = now()`,
    );
    const rows = await partnerInputs();
    const beta = rows.find((r) => r.id === 'cp_beta');
    expect(beta?.preferredLanguage).toBe('gu');
    expect(beta?.whatsappNumber).toBe('9812399999');
    expect(beta?.digestEnabled).toBe(false);

    // And the gap disappears once the row exists.
    const gaps = await dataGaps();
    expect(gaps.partnersNoSettings.map((p) => p.id)).not.toContain('cp_beta');
  });

  it('jobs resolve partner contact through the settings override', async () => {
    const contact = await readOne<{ phone: string; lang: string }>(
      `SELECT COALESCE(s."whatsappNumber", cp."phoneNumber") AS phone,
              COALESCE(s."preferredLanguage", 'en') AS lang
         FROM "ChannelPartner" cp
         LEFT JOIN "PulsePartnerSettings" s ON s."channelPartnerId" = cp.id
        WHERE cp.id = 'cp_gamma'`,
    );
    // Gamma has NO phoneNumber on ChannelPartner — the send route exists only
    // because the settings row supplies one.
    expect(contact?.phone).toBe('9898700003');
    expect(contact?.lang).toBe('hi');
  });
});

afterAll(async () => {
  await closePools();
});
