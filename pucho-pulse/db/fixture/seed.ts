/**
 * Deterministic fixture data.
 *
 * TRD §9: "seed script = schema dump + synthetic rows covering every band/bucket
 * edge: 0 credits, 99/100/299/300/699/700/999/1000, W-band, multi-user, expired
 * wallet." Every account below is declared explicitly rather than generated at
 * random, so a test can assert "this org must land in band A" and mean it.
 *
 * All timestamps are relative to `now`, so the fixture stays valid whenever it
 * is rebuilt. Ids are stable strings (not cuids) to make failures readable.
 */
import type { Client } from 'pg';

export interface OrgSpec {
  id: string;
  name: string;
  partner: string;
  workshop: string | null;
  industry: string;
  companySize: string;
  ageDays: number;
  /** Grant credits consumed in total — spread across `usageDays` days. */
  credits: number;
  usageSpanDays?: number;
  /** Office chats: [daysAgo, chatType][] per user index 0/1. */
  office?: { daysAgo: number; app: 'EXCEL' | 'WORD' | 'PPT'; user?: number }[];
  ownDocs?: boolean;
  nonOfficeChats?: number;
  users?: number;
  workflowUse?: boolean;
  converted?: { plan: string; startedDaysAgo: number; paid: number };
  expectBand?: string;
  note?: string;
}

const APP_ENUM = {
  EXCEL: 'PUCHO_OFFICE_EXCEL_CHAT',
  WORD: 'PUCHO_OFFICE_WORD_CHAT',
  PPT: 'PUCHO_OFFICE_POWER_POINT_CHAT',
} as const;

export const PARTNERS = [
  { id: 'cp_alpha', name: 'Alpha Business Systems', tier: 'GOLD', phone: '9812300001', lang: 'gu' },
  { id: 'cp_beta', name: 'Beta Tech Distributors', tier: 'SILVER', phone: '9812300002', lang: 'en' },
  { id: 'cp_gamma', name: 'Gamma Office Solutions', tier: 'BRONZE', phone: '9812300003', lang: 'hi' },
];

export const PACKAGES = [
  { id: 'pkg_starter', title: 'Starter', price: 1500, yearly: 15000, credit: 2000 },
  { id: 'pkg_growth', title: 'Growth', price: 3000, yearly: 30000, credit: 5000 },
  { id: 'pkg_scale', title: 'Scale', price: 9000, yearly: 90000, credit: 20000 },
];

export const WORKSHOPS = [
  {
    id: 'ws_ca_01',
    daysAgo: 40,
    segment: 'CA & Accounting',
    campaignTag: 'SEP26-WEB-CA',
    partner: 'cp_alpha',
    invited: 60,
    attended: 41,
    status: 'DELIVERED',
    token: 'CAWORKSHOP',
  },
  {
    id: 'ws_tex_01',
    daysAgo: 33,
    segment: 'Textiles',
    campaignTag: 'SEP26-WEB-TEX',
    partner: 'cp_beta',
    invited: 55,
    attended: 30,
    status: 'DELIVERED',
    token: 'TEXWORKSHP',
  },
  {
    id: 'ws_chem_01',
    daysAgo: 18,
    segment: 'Chemicals',
    campaignTag: 'SEP26-WEB-CHEM',
    partner: 'cp_gamma',
    invited: 45,
    attended: 22,
    status: 'DELIVERED',
    token: 'CHEMWORKSH',
  },
  {
    id: 'ws_ca_02',
    daysAgo: 0,
    segment: 'CA & Accounting',
    campaignTag: 'SEP26-WEB-CA',
    partner: 'cp_alpha',
    invited: 50,
    attended: 0,
    status: 'SCHEDULED', // today, attendance not entered → red row on the dashboard
    token: 'CATODAY001',
  },
];

/** Office-heavy pattern: 6 distinct days in the last 14 across Excel + Word. */
const habitualOffice = (): OrgSpec['office'] => [
  { daysAgo: 1, app: 'EXCEL' },
  { daysAgo: 2, app: 'EXCEL' },
  { daysAgo: 3, app: 'WORD' },
  { daysAgo: 5, app: 'EXCEL' },
  { daysAgo: 8, app: 'PPT' },
  { daysAgo: 10, app: 'EXCEL', user: 1 },
  { daysAgo: 11, app: 'EXCEL', user: 1 },
  { daysAgo: 12, app: 'WORD' },
];

export const ORGS: OrgSpec[] = [
  // ── band edges on grant consumption (B1 money chart buckets) ──────────────
  {
    id: 'org_zero',
    name: 'Zero Use Traders',
    partner: 'cp_gamma',
    workshop: 'ws_chem_01',
    industry: 'Chemicals',
    companySize: '11-50',
    ageDays: 16,
    credits: 0,
    expectBand: 'D',
    note: 'zero-use, 14d+ old → ZERO_USE_14D ladder',
  },
  {
    id: 'org_99',
    name: 'Ninety Nine Textiles',
    partner: 'cp_beta',
    workshop: 'ws_tex_01',
    industry: 'Textiles',
    companySize: '11-50',
    ageDays: 30,
    credits: 99,
    note: 'top of the "never landed" bucket',
  },
  {
    id: 'org_100',
    name: 'Hundred Chemicals',
    partner: 'cp_beta',
    workshop: 'ws_tex_01',
    industry: 'Chemicals',
    companySize: '11-50',
    ageDays: 30,
    credits: 100,
    note: 'bottom of "tried it"',
  },
  {
    id: 'org_299',
    name: 'TwoNineNine Engineering',
    partner: 'cp_beta',
    workshop: 'ws_tex_01',
    industry: 'Engineering',
    companySize: '51-200',
    ageDays: 28,
    credits: 299,
  },
  {
    id: 'org_300',
    name: 'Three Hundred Pharma',
    partner: 'cp_alpha',
    workshop: 'ws_ca_01',
    industry: 'Pharma',
    companySize: '51-200',
    ageDays: 27,
    credits: 300,
    office: [
      { daysAgo: 2, app: 'EXCEL' },
      { daysAgo: 6, app: 'EXCEL' },
    ],
    note: 'bottom of "engaged"',
  },
  {
    id: 'org_699',
    name: 'SixNineNine Agri',
    partner: 'cp_alpha',
    workshop: 'ws_ca_01',
    industry: 'Agri inputs',
    companySize: '51-200',
    ageDays: 25,
    credits: 699,
    office: [
      { daysAgo: 1, app: 'EXCEL' },
      { daysAgo: 4, app: 'WORD' },
    ],
  },
  {
    id: 'org_700',
    name: 'Seven Hundred Mills',
    partner: 'cp_alpha',
    workshop: 'ws_ca_01',
    industry: 'Textiles',
    companySize: '51-200',
    ageDays: 22,
    credits: 700,
    office: habitualOffice(),
    ownDocs: true,
    users: 2,
    workflowUse: true,
    expectBand: 'A',
    note: 'the BAND_A / ≥700 crossing case — exactly one alert expected',
  },
  {
    id: 'org_999',
    name: 'Nine Nine Nine Exports',
    partner: 'cp_alpha',
    workshop: 'ws_ca_01',
    industry: 'Chemicals',
    companySize: '201-500',
    ageDays: 20,
    credits: 999,
    office: habitualOffice(),
    ownDocs: true,
    users: 2,
    expectBand: 'A',
  },
  {
    id: 'org_1000',
    name: 'Exhausted Industries',
    partner: 'cp_beta',
    workshop: 'ws_tex_01',
    industry: 'Textiles',
    companySize: '201-500',
    ageDays: 21,
    credits: 1000,
    office: habitualOffice(),
    users: 2,
    expectBand: 'A',
    note: 'grant exhausted → EXHAUSTED trigger (24h SLA)',
  },
  {
    id: 'org_1200',
    name: 'Over Quota Foods',
    partner: 'cp_beta',
    workshop: 'ws_tex_01',
    industry: 'Other MSME',
    companySize: '500+',
    ageDays: 35,
    credits: 1200,
    office: habitualOffice(),
    converted: { plan: 'pkg_growth', startedDaysAgo: 5, paid: 3000 },
    note: 'converted after exhausting — feeds B5 credits-at-conversion',
  },

  // ── behavioural edges ────────────────────────────────────────────────────
  {
    id: 'org_wrong_lane',
    name: 'Wrong Lane Logistics',
    partner: 'cp_gamma',
    workshop: 'ws_chem_01',
    industry: 'Other MSME',
    companySize: '11-50',
    ageDays: 15,
    credits: 420,
    office: [],
    nonOfficeChats: 14,
    expectBand: 'W',
    note: 'W override: 0 Office chats, ≥10 general chats — never a close attempt',
  },
  {
    id: 'org_stale',
    name: 'Gone Quiet Fabrics',
    partner: 'cp_beta',
    workshop: 'ws_tex_01',
    industry: 'Textiles',
    companySize: '51-200',
    ageDays: 34,
    credits: 560,
    office: [
      { daysAgo: 20, app: 'EXCEL' },
      { daysAgo: 22, app: 'EXCEL' },
    ],
    note: 'last Office use >14d → −20 recency penalty, MOMENTUM_BREAK candidate',
  },
  {
    id: 'org_excel_only',
    name: 'Excel Only Spinners',
    partner: 'cp_alpha',
    workshop: 'ws_ca_01',
    industry: 'Textiles',
    companySize: '11-50',
    ageDays: 17,
    credits: 380,
    office: [
      { daysAgo: 1, app: 'EXCEL' },
      { daysAgo: 3, app: 'EXCEL' },
      { daysAgo: 6, app: 'EXCEL' },
    ],
    note: 'strong Excel, no Word/PPT, day 14+ → EXCEL_ONLY nudge',
  },
  {
    id: 'org_single_player',
    name: 'Solo Act Chemicals',
    partner: 'cp_gamma',
    workshop: 'ws_chem_01',
    industry: 'Chemicals',
    companySize: '51-200',
    ageDays: 16,
    credits: 450,
    users: 1,
    office: [
      { daysAgo: 2, app: 'EXCEL' },
      { daysAgo: 4, app: 'WORD' },
    ],
    note: '>400 credits, one user, day 14+ → SINGLE_PLAYER nudge',
  },
  {
    id: 'org_fresh',
    name: 'Just Registered Metals',
    partner: 'cp_alpha',
    workshop: 'ws_ca_02',
    industry: 'Engineering',
    companySize: '11-50',
    ageDays: 1,
    credits: 12,
    note: 'younger than PPS.minAccountAgeDays — score is not yet meaningful',
  },
  {
    id: 'org_no_office_72h',
    name: 'Silent Since Workshop',
    partner: 'cp_gamma',
    workshop: 'ws_chem_01',
    industry: 'Pharma',
    companySize: '11-50',
    ageDays: 5,
    credits: 40,
    office: [],
    note: '>72h post-workshop with zero Office chats → OFFICE_NOUSE_72H',
  },

  // ── converted accounts (paying side of the dashboard) ────────────────────
  {
    id: 'org_paid_growth',
    name: 'Converted Growth Pvt Ltd',
    partner: 'cp_alpha',
    workshop: 'ws_ca_01',
    industry: 'Pharma',
    companySize: '51-200',
    ageDays: 38,
    credits: 820,
    office: habitualOffice(),
    ownDocs: true,
    users: 3,
    workflowUse: true,
    converted: { plan: 'pkg_growth', startedDaysAgo: 12, paid: 3000 },
  },
  {
    id: 'org_paid_scale',
    name: 'Converted Scale Ltd',
    partner: 'cp_alpha',
    workshop: 'ws_ca_01',
    industry: 'Chemicals',
    companySize: '201-500',
    ageDays: 39,
    credits: 940,
    office: habitualOffice(),
    ownDocs: true,
    users: 3,
    workflowUse: true,
    converted: { plan: 'pkg_scale', startedDaysAgo: 20, paid: 9000 },
  },
  // Direct (non-workshop) org — must be EXCLUDED from every grant query.
  {
    id: 'org_direct',
    name: 'Direct Signup Corp',
    partner: '',
    workshop: null,
    industry: 'Engineering',
    companySize: '500+',
    ageDays: 60,
    credits: 0,
    users: 2,
    converted: { plan: 'pkg_scale', startedDaysAgo: 45, paid: 9000 },
    note: 'no channel partner, no workshop → out of grant scope on both switches',
  },
];

/** Deterministic PRNG so repeated seeds produce byte-identical data. */
function mulberry32(seed: number) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ago = (days: number, hour = 10) =>
  `now() - interval '${days} days' + interval '${hour} hours' - interval '${new Date().getHours()} hours'`;

export async function seed(client: Client): Promise<void> {
  const rand = mulberry32(20260817);
  const q = (sql: string, params: unknown[] = []) => client.query(sql, params);

  await q(`INSERT INTO "Language" (id, name) VALUES
      ('lang_en','English'), ('lang_gu','Gujarati'), ('lang_hi','Hindi')`);

  for (const p of PARTNERS) {
    await q(
      `INSERT INTO "ChannelPartner" (id, "companyName", email, phone, tier, status, "preferredLanguage", "createdAt")
       VALUES ($1,$2,$3,$4,$5,'Active',$6, now() - interval '120 days')`,
      [p.id, p.name, `${p.id}@partners.pucho.ai`, p.phone, p.tier, p.lang],
    );
  }

  for (const pkg of PACKAGES) {
    await q(`INSERT INTO "Package" (id, title, price, "yearlyPrice", credit) VALUES ($1,$2,$3,$4,$5)`, [
      pkg.id,
      pkg.title,
      pkg.price,
      pkg.yearly,
      pkg.credit,
    ]);
  }

  for (const w of WORKSHOPS) {
    await q(
      `INSERT INTO "Workshop"
         (id, "workshopDate", "segmentName", "campaignTag", "channelPartnerId", "deliveredBy",
          "invitedCount", "attendedCount", status, "registrationToken", "workbookUrl", "createdAt")
       VALUES ($1, ${ago(w.daysAgo, 15)}, $2, $3, $4, NULL, $5, $6, $7, $8,
               'https://pucho.ai/workbook/office', ${ago(w.daysAgo + 7)})`,
      [w.id, w.segment, w.campaignTag, w.partner, w.invited, w.attended, w.status, w.token],
    );
  }

  for (const org of ORGS) {
    const userCount = org.users ?? 1;
    await q(
      `INSERT INTO "Organization"
         (id, name, email, industry, "companySize", "channelPartnerId", "isOnboarded", status,
          "workshopId", "signupSegment", "signupSource", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Active',$8,$9,$10, ${ago(org.ageDays, 11)})`,
      [
        org.id,
        org.name,
        `${org.id}@example.in`,
        org.industry,
        org.companySize,
        org.partner || null,
        org.credits > 0,
        org.workshop,
        org.workshop ? WORKSHOPS.find((w) => w.id === org.workshop)?.segment ?? null : null,
        org.workshop ? 'WORKSHOP' : 'DIRECT',
      ],
    );

    // Grant wallet. org_zero's wallet is expired to cover the expired-wallet edge.
    await q(
      `INSERT INTO "CreditWallets"
         (id, "organizationId", type, allocated, used, "isActive", "isAddon", "entityType", "expiryDate")
       VALUES ($1,$2,'FREE',1000,$3,$4,false,'ORGANIZATION', ${
         org.id === 'org_zero' ? `now() - interval '2 days'` : `now() + interval '60 days'`
       })`,
      [`wal_${org.id}`, org.id, Math.min(org.credits, 1000), org.id !== 'org_zero'],
    );

    for (let u = 0; u < userCount; u++) {
      const uid = `usr_${org.id}_${u}`;
      await q(
        `INSERT INTO "User" (id, "firstName", "lastName", email, "phoneNumber", status, "isOnboarded",
                             "preferredLanguageId", "createdAt")
         VALUES ($1,$2,$3,$4,$5,'Active',$6,$7, ${ago(org.ageDays, 11)})`,
        [
          uid,
          `${org.name.split(' ')[0]}`,
          `User${u + 1}`,
          `${uid}@example.in`,
          `98${String(76000000 + Math.floor(rand() * 999999)).slice(0, 8)}`,
          org.credits > 0,
          ['lang_en', 'lang_gu', 'lang_hi'][u % 3],
        ],
      );
      await q(
        `INSERT INTO "OrganizationUser" (id, "userId", "organizationId", status) VALUES ($1,$2,$3,'Active')`,
        [`ou_${org.id}_${u}`, uid, org.id],
      );
      const logins = 2 + Math.floor(rand() * 8);
      for (let l = 0; l < logins; l++) {
        await q(
          `INSERT INTO "LoginHistory" (id, "userId", "orgId", device, os, "createdAt")
           VALUES ($1,$2,$3,$4,$5, ${ago(Math.floor(rand() * Math.max(1, org.ageDays)), 9 + (l % 8))})`,
          [
            `lh_${org.id}_${u}_${l}`,
            uid,
            org.id,
            rand() > 0.45 ? 'Mobile' : 'Desktop',
            rand() > 0.5 ? 'Android' : rand() > 0.5 ? 'Windows' : 'iOS',
          ],
        );
      }
    }

    // Grant consumption, spread over the account's life so B2 burn-curve
    // milestones and Z2 activation latency have something to measure.
    if (org.credits > 0) {
      const span = Math.max(1, Math.min(org.usageSpanDays ?? org.ageDays - 1, org.ageDays - 1));
      const events = Math.max(1, Math.min(12, Math.ceil(org.credits / 90)));
      // Split exactly: the last event carries the remainder so the account's
      // total is precisely org.credits — the band edges (99/100/999/1000) only
      // mean something if they land on the number, not near it.
      const per = Math.floor((org.credits / events) * 100) / 100;
      for (let i = 0; i < events; i++) {
        const amount = i === events - 1 ? Number((org.credits - per * (events - 1)).toFixed(2)) : per;
        const dayOffset = Math.max(0, org.ageDays - 1 - Math.floor((i / events) * span));
        const isWorkflow = org.workflowUse && i % 4 === 0;
        await q(
          `INSERT INTO "FreeCreditUsage" (id, "organizationId", "userId", credits, "flowId", type, "createdAt")
           VALUES ($1,$2,$3,$4,$5,$6, ${ago(dayOffset, 12 + (i % 6))})`,
          [
            `fcu_${org.id}_${i}`,
            org.id,
            `usr_${org.id}_${i % userCount}`,
            amount,
            isWorkflow ? `flow_${i % 3}` : null,
            isWorkflow ? 'workflow_run' : 'chat',
          ],
        );
      }
    }

    // Office signal — the thing PPS actually scores.
    let chatIdx = 0;
    for (const oc of org.office ?? []) {
      const u = oc.user ?? 0;
      if (u >= userCount) continue;
      await q(
        `INSERT INTO "ChatHistory" (id, "chatType", "organizationUserId", "createdBy", "createdAt")
         VALUES ($1,$2::"chatType",$3,$4, ${ago(oc.daysAgo, 11 + (chatIdx % 7))})`,
        [`ch_${org.id}_${chatIdx++}`, APP_ENUM[oc.app], `ou_${org.id}_${u}`, `usr_${org.id}_${u}`],
      );
    }
    if (org.ownDocs) {
      await q(
        `INSERT INTO "ChatHistory" (id, "chatType", "organizationUserId", "createdBy", "createdAt")
         VALUES ($1,'ORG_KNOWLEDGE',$2,$3, ${ago(4, 15)})`,
        [`ch_${org.id}_docs`, `ou_${org.id}_0`, `usr_${org.id}_0`],
      );
    }
    for (let n = 0; n < (org.nonOfficeChats ?? 0); n++) {
      await q(
        `INSERT INTO "ChatHistory" (id, "chatType", "organizationUserId", "createdBy", "createdAt")
         VALUES ($1,'GENERAL',$2,$3, ${ago(Math.max(1, n % 12), 10 + (n % 8))})`,
        [`ch_${org.id}_gen_${n}`, `ou_${org.id}_0`, `usr_${org.id}_0`],
      );
    }

    // Questions drive activation (Q8) and the feature tiles (Q12).
    const questions = org.credits > 0 ? 3 + Math.floor(rand() * 10) : 0;
    for (let i = 0; i < questions; i++) {
      await q(
        `INSERT INTO "ChatQuestion" (id, "chatHistoryId", "createdBy", "isProSearch", "isDeepResearch",
                                     "isMobile", "isFile", "createdAt")
         VALUES ($1, NULL, $2, $3, $4, $5, $6, ${ago(Math.max(0, org.ageDays - 1 - (i % 5)), 12)})`,
        [
          `cq_${org.id}_${i}`,
          `usr_${org.id}_${i % userCount}`,
          rand() > 0.7,
          rand() > 0.85,
          rand() > 0.5,
          rand() > 0.75,
        ],
      );
    }

    if (org.converted) {
      await q(
        `INSERT INTO "OrganizationPackage"
           (id, "organizationId", "packageId", status, "startDate", "endDate", "PayFrequency", "numberOfUser")
         VALUES ($1,$2,$3,'Active', ${ago(org.converted.startedDaysAgo, 10)},
                 now() + interval '11 months', $4, $5)`,
        [
          `op_${org.id}`,
          org.id,
          org.converted.plan,
          rand() > 0.6 ? 'YEARLY' : 'MONTHLY',
          Math.max(2, userCount + 2),
        ],
      );
      await q(
        `INSERT INTO "Payment" (id, "organizationId", amount, "paymentStatus", "paymentMethod", "paymentDate")
         VALUES ($1,$2,$3,'COMPLETED','UPI', ${ago(org.converted.startedDaysAgo, 10)})`,
        [`pay_${org.id}`, org.id, org.converted.paid],
      );
      // Paid usage after conversion (Q1/Q2/Q4/Q24 all read CreditTransaction).
      for (let i = 0; i < 14; i++) {
        const flow = i % 3 === 0;
        await q(
          `INSERT INTO "CreditTransaction"
             (id, "userId", "organizationId", credits, "transactionType", type, "chatQueId", "flowId",
              "flowName", "runId", "agentName", "createdAt")
           VALUES ($1,$2,$3,$4,'USAGE',$5,$6,$7,$8,$9,$10, ${ago(i * 2, 11 + (i % 6))})`,
          [
            `ct_${org.id}_${i}`,
            `usr_${org.id}_${i % userCount}`,
            org.id,
            Number((20 + rand() * 90).toFixed(2)),
            flow ? 'workflow_run' : 'chat',
            flow ? null : `cq_${i}`,
            flow ? `flow_${i % 3}` : null,
            flow ? ['Invoice extractor', 'GST reconciler', 'Quote builder'][i % 3] : null,
            flow ? `run_${org.id}_${i}` : null,
            null,
          ],
        );
      }
      await q(
        `INSERT INTO "CreditWallets"
           (id, "organizationId", type, allocated, used, "isActive", "isAddon", "entityType", "expiryDate")
         VALUES ($1,$2,'PAID',$3,$4,true,false,'ORGANIZATION', now() + interval '11 months')`,
        [`wal_paid_${org.id}`, org.id, 5000, Math.floor(400 + rand() * 2000)],
      );
      // Voice usage, for the Feature view.
      for (let i = 0; i < 4; i++) {
        await q(
          `INSERT INTO "Calls" (id, "orgId", "durationSec", "callDuration", "callStatus", "createdAt")
           VALUES ($1,$2,$3,$4,$5, ${ago(i * 3, 14)})`,
          [
            `call_${org.id}_${i}`,
            org.id,
            120 + Math.floor(rand() * 600),
            'ignore-this-text-column',
            i === 3 ? 'failed' : 'completed',
          ],
        );
      }
    }
  }

  // Funnel-view sources.
  for (let i = 0; i < 40; i++) {
    await q(
      `INSERT INTO "WaitlistUser" (id, email, "createdAt") VALUES ($1,$2, ${ago(60 - i)})`,
      [`wl_${i}`, i % 4 === 0 ? `usr_org_700_0@example.in` : `waitlist${i}@example.in`],
    );
  }
  const leadStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'DEMO', 'WON', 'LOST'];
  for (let i = 0; i < 60; i++) {
    await q(`INSERT INTO "CampaignLead" (id, status, "createdAt") VALUES ($1,$2, ${ago(50 - (i % 45))})`, [
      `cl_${i}`,
      leadStatuses[i % leadStatuses.length],
    ]);
  }
  const sizes = ['1-10', '11-50', '51-200', '201-500', '500+'];
  for (let i = 0; i < 25; i++) {
    await q(
      `INSERT INTO "ContactSales" (id, email, "companySize", "createdAt") VALUES ($1,$2,$3, ${ago(70 - i * 2)})`,
      [`cs_${i}`, `enquiry${i}@example.in`, sizes[i % sizes.length]],
    );
  }
  for (let i = 0; i < 9; i++) {
    await q(
      `INSERT INTO "CreditUsageError" (id, "userId", "createdAt") VALUES ($1,$2, ${ago(i + 1, 13)})`,
      [`cue_${i}`, 'usr_org_700_0'],
    );
  }
  for (let i = 0; i < 6; i++) {
    await q(
      `INSERT INTO "SubscriptionUpgrade" (id, "upgradeStatus", "createdAt") VALUES ($1,$2, ${ago(20 + i * 10)})`,
      [`su_${i}`, i % 3 === 0 ? 'DOWNGRADE' : 'UPGRADE'],
    );
  }
  for (let i = 0; i < 30; i++) {
    await q(
      `INSERT INTO "UsageTracking" (id, model, provider, "totalPrice", "createdAt") VALUES ($1,$2,$3,$4, ${ago(i)})`,
      [`ut_${i}`, ['claude-opus-5', 'gpt-4o', 'gemini-2.0'][i % 3], ['anthropic', 'openai', 'google'][i % 3], Number((rand() * 20).toFixed(3))],
    );
  }
  // A failed and a pending payment for the Command Center attention list.
  await q(
    `INSERT INTO "Payment" (id, "organizationId", amount, "paymentStatus", "paymentMethod", "paymentDate")
     VALUES ('pay_failed_1','org_paid_growth',3000,'FAILED','CARD', ${ago(2, 10)}),
            ('pay_pending_1','org_paid_scale',9000,'PENDING','NETBANKING', ${ago(1, 16)})`,
  );
}
