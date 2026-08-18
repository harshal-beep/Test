/**
 * One function per API endpoint in TRD §4. Each is a thin composition of the
 * canonical queries — no arithmetic that isn't already in SQL_LIBRARY, so the
 * parity tests can compare a widget's number to its query result directly.
 */
import { readQuery, readOne } from './db';
import { grantScope, type Days } from './scope';
import * as Q from './sql/queries';
import { CREDIT_VALUE_INR, GRANT_CREDITS } from '../../config/scoring';
import { toNum } from './format';

export type Row = Record<string, unknown>;

const scope = () => grantScope();

// ── Command Center ──────────────────────────────────────────────────────────
export async function commandCenter(days: Days) {
  const [burn, signups, featureSplit, dauWau, mrr, failedPayments, hot, stalled, economics, funnel, movement] =
    await Promise.all([
      readQuery(Q.Q1_DAILY_BURN, [days]),
      readQuery(Q.Q8_SIGNUPS_ACTIVATION),
      readQuery(Q.Q2_BURN_BY_FEATURE, [days]),
      readOne(Q.Q9_DAU_WAU_MAU),
      readQuery(Q.Q5_MRR),
      readQuery(Q.Q21_FAILED_PAYMENTS),
      readQuery(Q.G3_HOT_ACCOUNTS, [scope()]),
      readQuery(Q.G4_STALLED, [scope()]),
      readOne(Q.G5_GTM_ECONOMICS, [scope(), CREDIT_VALUE_INR]),
      readQuery(Q.G1_WORKSHOP_FUNNEL, [null, null]),
      readQuery(Q.BAND_MOVEMENT, [7]),
    ]);

  const mrrTotal = mrr.reduce((sum, r) => sum + toNum(r.mrr_inr), 0);
  const latestBurn = burn.at(-1);
  // Q8 comes back newest-first and its newest row is the *current*, partial
  // week — reading activation off it alone would show a near-zero number every
  // Monday morning. Take the trailing four weeks instead.
  const recentWeeks = signups.slice(0, 4);
  const recentSignups = recentWeeks.reduce((sum, r) => sum + toNum(r.signups), 0);
  const recentActivated = recentWeeks.reduce((sum, r) => sum + toNum(r.activated_7d), 0);

  return {
    tiles: {
      mrr_inr: mrrTotal,
      burn_ma_7d: toNum(latestBurn?.ma_7d),
      burn_today: toNum(latestBurn?.credits_burned),
      activation_pct: recentSignups ? (recentActivated / recentSignups) * 100 : 0,
      dau: toNum(dauWau?.dau),
      wau: toNum(dauWau?.wau),
      mau: toNum(dauWau?.mau),
      stickiness_pct: toNum(dauWau?.stickiness_pct),
      failed_payments: failedPayments.length,
      hot_accounts: hot.length,
      revenue_per_credit_rupee: toNum(economics?.revenue_per_credit_rupee),
    },
    burnSeries: burn,
    signupSeries: signups.slice().reverse(),
    featureSplit,
    attention: {
      failedPayments: failedPayments.slice(0, 10),
      hot: hot.slice(0, 10),
      stalled: stalled.slice(0, 10),
    },
    economics,
    headline: (() => {
      const delivered = funnel.filter((f) => f.status !== 'SCHEDULED');
      const withClient = delivered.filter((f) => toNum(f.converted_paid) > 0);
      const conversions = toNum(economics?.conversions);
      return {
        workshopsDelivered: delivered.length,
        workshopsWithClient: withClient.length,
        conversions,
        creditCostPerClient: conversions > 0 ? toNum(economics?.credit_cost_inr) / conversions : null,
      };
    })(),
    weekMovement: movement.reduce(
      (acc, r) => ({ intoA: acc.intoA + toNum(r.into_a), outOfA: acc.outOfA + toNum(r.out_of_a) }),
      { intoA: 0, outOfA: 0 },
    ),
  };
}

// ── Credits & Revenue ───────────────────────────────────────────────────────
export async function creditsRevenue(days: Days) {
  const [burn, byFeature, wallets, mrr, revenue, freeVsPaid, failed, upgrades, workflows] =
    await Promise.all([
      readQuery(Q.Q1_DAILY_BURN, [days]),
      readQuery(Q.Q2_BURN_BY_FEATURE, [days]),
      readQuery(Q.Q3_WALLET_UTILIZATION),
      readQuery(Q.Q5_MRR),
      readQuery(Q.Q6_REVENUE_BY_MONTH),
      readQuery(Q.Q7_FREE_VS_PAID, [days]),
      readQuery(Q.Q21_FAILED_PAYMENTS),
      readQuery(Q.Q22_UPGRADES),
      readQuery(Q.Q24_WORKFLOW_LEADERBOARD, [days]),
    ]);
  return { burn, byFeature, wallets, mrr, revenue, freeVsPaid, failed, upgrades, workflows };
}

// ── Users & Engagement ──────────────────────────────────────────────────────
export async function engagement(days: Days) {
  const [signups, dauWau, cohorts, topUsers, seats, devices] = await Promise.all([
    readQuery(Q.Q8_SIGNUPS_ACTIVATION),
    readOne(Q.Q9_DAU_WAU_MAU),
    readQuery(Q.Q10_COHORTS),
    readQuery(Q.Q4_TOP_USERS, [days]),
    readQuery(Q.Q15_SEATS, [days]),
    readQuery(Q.Q23_DEVICES, [days]),
  ]);
  return { signups, dauWau, cohorts, topUsers, seats, devices };
}

// ── Feature Usage ───────────────────────────────────────────────────────────
export async function features(days: Days) {
  const [chatTypes, flags, voice, workflows] = await Promise.all([
    readQuery(Q.Q11_CHAT_TYPES, [days]),
    readOne(Q.Q12_QUESTION_FLAGS, [days]),
    readQuery(Q.Q13_VOICE, [days]),
    readQuery(Q.Q24_WORKFLOW_LEADERBOARD, [days]),
  ]);
  return { chatTypes, flags, voice, workflows };
}

// ── Partners & Funnel ───────────────────────────────────────────────────────
export async function partnersFunnel(days: Days) {
  const [scorecard, waitlist, leads, contactSales, health] = await Promise.all([
    readQuery(Q.Q16_PARTNER_SCORECARD, [days]),
    readOne(Q.Q17_WAITLIST),
    readQuery(Q.Q18_LEAD_FUNNEL),
    readQuery(Q.Q19_CONTACT_SALES),
    readQuery(Q.A2_PARTNER_HEALTH, [scope()]),
  ]);
  return { scorecard, waitlist, leads, contactSales, health };
}

// ── Credit Grant Benchmark ──────────────────────────────────────────────────
export async function creditGrant() {
  const [moneyChart, burnCurve, featureMix, partnerBenchmark, atConversion, waste, aging, latency, burndown, expiring] =
    await Promise.all([
      readQuery(Q.B1_MONEY_CHART, [scope()]),
      readOne(Q.B2_BURN_CURVE, [scope()]),
      readQuery(Q.B3_FEATURE_MIX, [scope()]),
      readQuery(Q.B4_PARTNER_BENCHMARK, [scope(), CREDIT_VALUE_INR]),
      readOne(Q.B5_CREDITS_AT_CONVERSION, [scope()]),
      readOne(Q.B6_GRANT_WASTE, [scope(), CREDIT_VALUE_INR, GRANT_CREDITS]),
      readQuery(Q.Z1_ZERO_USE_AGING, [scope()]),
      readQuery(Q.Z2_ACTIVATION_LATENCY, [scope()]),
      readQuery(Q.BURNDOWN, [scope(), 45]),
      readQuery(Q.EXPIRING_GRANTS, [scope(), 14]),
    ]);
  return { moneyChart, burnCurve, featureMix, partnerBenchmark, atConversion, waste, aging, latency, burndown, expiring };
}

// ── Workshops ───────────────────────────────────────────────────────────────
export async function workshopFunnel(filters: { campaignTag?: string | null; segment?: string | null } = {}) {
  const [funnel, campaigns, segments] = await Promise.all([
    readQuery(Q.G1_WORKSHOP_FUNNEL, [filters.campaignTag ?? null, filters.segment ?? null]),
    readQuery(Q.C1_CAMPAIGN),
    readQuery(Q.G2_SEGMENT_SCOREBOARD),
  ]);
  return { funnel, campaigns, segments };
}

// ── Search & 360 ────────────────────────────────────────────────────────────
export async function search(q: string, type: 'all' | 'partner' | 'org' | 'user' = 'all') {
  if (!q.trim()) return [];
  return readQuery(Q.S1_SEARCH, [q.trim(), type]);
}

export async function partner360(partnerId: string) {
  const [health, trend, aging, ppsRows] = await Promise.all([
    readQuery(Q.A2_PARTNER_HEALTH, [scope()]),
    readQuery(Q.A1_PARTNER_TREND, [scope(), partnerId]),
    readQuery(Q.Z1_ZERO_USE_AGING, [scope()]),
    readQuery(Q.PPS_OFFICE, [scope(), null]),
  ]);
  const row = health.find((h) => h.partner_id === partnerId) ?? null;
  // The 360 shows ONLY this partner's portfolio — the global leaderboard was
  // audit finding F10 (context collapse: global table under a partner header).
  const portfolio = ppsRows.filter((p) => p.channelPartnerId === partnerId);
  return {
    health: row,
    trend,
    aging: row ? aging.find((a) => a.partner === row.partner) ?? null : null,
    portfolio,
  };
}

export async function org360(orgId: string) {
  const [org, pps, history] = await Promise.all([
    readQuery(Q.Q25_ORG_360).then((rows) => rows.find((r) => r.org_id === orgId) ?? null),
    readOne(Q.PPS_OFFICE, [scope(), orgId]),
    readQuery(
      `SELECT "snapshotDate", pps, band, components FROM "PropensityLog"
        WHERE "organizationId" = $1 ORDER BY "snapshotDate" DESC LIMIT 60`,
      [orgId],
    ),
  ]);
  return { org, pps, history };
}

export async function user360(userId: string) {
  return readOne(Q.S2_USER_360, [userId]);
}

// ── PPS ─────────────────────────────────────────────────────────────────────
export async function ppsLeaderboard(band?: string | null) {
  const rows = await readQuery(Q.PPS_OFFICE, [scope(), null]);
  return band ? rows.filter((r) => r.band === band) : rows;
}

export async function bandMovement(days: Days) {
  return readQuery(Q.BAND_MOVEMENT, [days]);
}

export async function ppsHistory(orgId: string) {
  return readQuery(
    `SELECT "snapshotDate", pps, band, components FROM "PropensityLog"
      WHERE "organizationId" = $1 ORDER BY "snapshotDate"`,
    [orgId],
  );
}

// ── Alerts ──────────────────────────────────────────────────────────────────
export async function alerts(status: 'open' | 'all' = 'open') {
  const where = status === 'open' ? 'WHERE a."ackAt" IS NULL' : '';
  return readQuery(
    `SELECT a.id, a.type, a."organizationId", a."channelPartnerId", a.payload,
            a."firedAt", a."ackAt", a."escalatedAt", a."slaHours",
            o.name AS organization, cp."companyName" AS partner,
            CASE WHEN a."slaHours" IS NULL THEN NULL
                 ELSE a."firedAt" + (a."slaHours" || ' hours')::interval END AS sla_due,
            CASE WHEN a."slaHours" IS NULL THEN NULL
                 ELSE ROUND(EXTRACT(epoch FROM (a."firedAt" + (a."slaHours" || ' hours')::interval - now())) / 3600.0, 1)
            END AS sla_hours_left,
            CASE WHEN a."slaHours" IS NOT NULL AND a."ackAt" IS NULL
                  AND now() > a."firedAt" + (a."slaHours" || ' hours')::interval
                 THEN true ELSE false END AS sla_breached
       FROM "GtmAlert" a
       LEFT JOIN "Organization" o ON o.id = a."organizationId"
       LEFT JOIN "ChannelPartner" cp ON cp.id = a."channelPartnerId"
       ${where}
      ORDER BY a."firedAt" DESC
      LIMIT 200`,
  );
}

// ── Today (the action queue view — audit F2/F3) ─────────────────────────────
export async function today() {
  const [openAlerts, movement, recentWorkshops, expiring, funnel, economics, byBand, quintiles] =
    await Promise.all([
      alerts('open'),
      readQuery(Q.BAND_MOVEMENT, [7]),
      readQuery(Q.RECENT_WORKSHOPS),
      readQuery(Q.EXPIRING_GRANTS, [scope(), 14]),
      readQuery(Q.G1_WORKSHOP_FUNNEL, [null, null]),
      readOne(Q.G5_GTM_ECONOMICS, [scope(), CREDIT_VALUE_INR]),
      readQuery(Q.CONVERSION_BY_BAND),
      readQuery(Q.CALIBRATION_QUINTILES, [scope()]),
    ]);

  const week = movement.reduce(
    (acc, r) => ({
      intoA: acc.intoA + toNum(r.into_a),
      intoB: acc.intoB + toNum(r.into_b),
      intoW: acc.intoW + toNum(r.into_w),
      outOfA: acc.outOfA + toNum(r.out_of_a),
    }),
    { intoA: 0, intoB: 0, intoW: 0, outOfA: 0 },
  );

  const delivered = funnel.filter((f) => f.status !== 'SCHEDULED');
  const withClient = delivered.filter((f) => toNum(f.converted_paid) > 0);
  const conversions = toNum(economics?.conversions);
  const headline = {
    workshopsDelivered: delivered.length,
    workshopsWithClient: withClient.length,
    conversions,
    creditCostPerClient: conversions > 0 ? toNum(economics?.credit_cost_inr) / conversions : null,
    revenuePerCreditRupee: toNum(economics?.revenue_per_credit_rupee),
  };

  return { openAlerts, movement, week, recentWorkshops, expiring, headline, byBand, quintiles };
}

// ── Workshop detail (audit F7) ──────────────────────────────────────────────
export async function workshopDetail(id: string) {
  const [workshop, accounts, funnelRows] = await Promise.all([
    readOne(Q.WORKSHOP_ONE, [id]),
    readQuery(Q.WORKSHOP_ACCOUNTS, [id]),
    readQuery(Q.G1_WORKSHOP_FUNNEL, [null, null]),
  ]);
  return {
    workshop,
    accounts,
    funnel: funnelRows.find((f) => f.workshop_id === id) ?? null,
  };
}

// ── Missing-data inputs system ──────────────────────────────────────────────
/**
 * Data the GTM depends on that production has no home for (or has left empty).
 * Each gap names its consequence — a gap without a consequence is just noise.
 */
export async function dataGaps() {
  const [partnersNoPhone, partnersNoSettings, orgsNoFirmo, packagesNoQuota, workshopsNoWorkbook, staleAttendance] =
    await Promise.all([
      readQuery(
        `SELECT cp.id, cp."companyName"
           FROM "ChannelPartner" cp
           LEFT JOIN "PulsePartnerSettings" s ON s."channelPartnerId" = cp.id
          WHERE cp.status = 'Active' AND COALESCE(s."whatsappNumber", cp."phoneNumber") IS NULL`,
      ),
      readQuery(
        `SELECT cp.id, cp."companyName"
           FROM "ChannelPartner" cp
           LEFT JOIN "PulsePartnerSettings" s ON s."channelPartnerId" = cp.id
          WHERE cp.status = 'Active' AND s."channelPartnerId" IS NULL`,
      ),
      readQuery(
        `SELECT o.id, o.name,
                (o.industry IS NULL OR o.industry = '') AS missing_industry,
                (o."companySize" IS NULL OR o."companySize" = '') AS missing_size
           FROM "Organization" o
          WHERE o.status = 'Active'
            AND (o.industry IS NULL OR o.industry = '' OR o."companySize" IS NULL OR o."companySize" = '')`,
      ),
      readQuery(`SELECT id, title FROM "Package" WHERE status = 'Active' AND credit IS NULL`),
      readQuery(
        `SELECT id, "segmentName", "workshopDate"::date AS date FROM "Workshop"
          WHERE "workbookUrl" IS NULL AND status <> 'CANCELLED'`,
      ),
      readQuery(
        `SELECT id, "segmentName", "workshopDate"::date AS date FROM "Workshop"
          WHERE status = 'SCHEDULED' AND "workshopDate" < now() - interval '1 day'`,
      ),
    ]);
  return { partnersNoPhone, partnersNoSettings, orgsNoFirmo, packagesNoQuota, workshopsNoWorkbook, staleAttendance };
}

export async function partnerInputs() {
  return readQuery(
    `SELECT cp.id, cp."companyName", cp.tier, cp."phoneNumber",
            s."preferredLanguage", s."whatsappNumber", s."digestEnabled", s.notes, s."updatedAt",
            (SELECT COUNT(*) FROM "Organization" o WHERE o."channelPartnerId" = cp.id) AS accounts
       FROM "ChannelPartner" cp
       LEFT JOIN "PulsePartnerSettings" s ON s."channelPartnerId" = cp.id
      WHERE cp.status = 'Active'
      ORDER BY cp."companyName"`,
  );
}
