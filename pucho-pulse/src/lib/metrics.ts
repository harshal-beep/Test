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
  const [burn, signups, featureSplit, dauWau, mrr, failedPayments, hot, stalled, economics] =
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
  const [moneyChart, burnCurve, featureMix, partnerBenchmark, atConversion, waste, aging, latency] =
    await Promise.all([
      readQuery(Q.B1_MONEY_CHART, [scope()]),
      readOne(Q.B2_BURN_CURVE, [scope()]),
      readQuery(Q.B3_FEATURE_MIX, [scope()]),
      readQuery(Q.B4_PARTNER_BENCHMARK, [scope(), CREDIT_VALUE_INR]),
      readOne(Q.B5_CREDITS_AT_CONVERSION, [scope()]),
      readOne(Q.B6_GRANT_WASTE, [scope(), CREDIT_VALUE_INR, GRANT_CREDITS]),
      readQuery(Q.Z1_ZERO_USE_AGING, [scope()]),
      readQuery(Q.Z2_ACTIVATION_LATENCY, [scope()]),
    ]);
  return { moneyChart, burnCurve, featureMix, partnerBenchmark, atConversion, waste, aging, latency };
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
