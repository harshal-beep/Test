import { describe, it, expect, afterAll } from 'vitest';
import { loadEnv } from '../db/env';
loadEnv();

import { readQuery, closePools } from '../src/lib/db';
import * as Q from '../src/lib/sql/queries';
import { libraryQuery } from './library';
import { CREDIT_VALUE_INR, GRANT_CREDITS } from '../config/scoring';

/**
 * TRD §9 parity tests: "every dashboard number must equal its SQL_LIBRARY query
 * result on a seeded fixture DB."
 *
 * Each case runs the untouched library text and the app's version side by side
 * and requires identical result sets. This is what makes the day-window
 * parameterisation in src/lib/sql/queries.ts safe: with days=30 the parameterised
 * query must be indistinguishable from the hardcoded original.
 *
 * The grant-scope parameter is passed as NULL here, which is exactly the
 * library's `channelPartnerId IS NOT NULL` form (see the scope note at the top
 * of SQL_LIBRARY.sql).
 */

const D30 = 30;

type Case = {
  name: string;
  marker: string;
  app: string;
  params: unknown[];
};

const CASES: Case[] = [
  { name: 'Q1 daily burn', marker: 'Q1: Daily credit burn', app: Q.Q1_DAILY_BURN, params: [D30] },
  { name: 'Q2 burn by feature', marker: 'Q2: Credit burn by feature', app: Q.Q2_BURN_BY_FEATURE, params: [D30] },
  { name: 'Q3 wallet utilisation', marker: 'Q3: Wallet utilization', app: Q.Q3_WALLET_UTILIZATION, params: [] },
  { name: 'Q4 top users', marker: 'Q4: Top 20 credit-consuming users', app: Q.Q4_TOP_USERS, params: [D30] },
  { name: 'Q5 MRR', marker: 'Q5: MRR proxy', app: Q.Q5_MRR, params: [] },
  { name: 'Q6 revenue by month', marker: 'Q6: Revenue collected by month', app: Q.Q6_REVENUE_BY_MONTH, params: [] },
  { name: 'Q7 free vs paid', marker: 'Q7: Free vs paid credit consumption', app: Q.Q7_FREE_VS_PAID, params: [D30] },
  { name: 'Q8 signups + activation', marker: 'Q8: Signups per week', app: Q.Q8_SIGNUPS_ACTIVATION, params: [] },
  { name: 'Q9 DAU/WAU/MAU', marker: 'Q9: DAU / WAU / MAU', app: Q.Q9_DAU_WAU_MAU, params: [] },
  { name: 'Q10 cohorts', marker: 'Q10: Monthly retention cohorts', app: Q.Q10_COHORTS, params: [] },
  { name: 'Q11 chat types', marker: 'Q11: Feature adoption by chat type', app: Q.Q11_CHAT_TYPES, params: [D30] },
  { name: 'Q12 question flags', marker: 'Q12: Pro Search', app: Q.Q12_QUESTION_FLAGS, params: [D30] },
  { name: 'Q13 voice', marker: 'Q13: Voice agent usage', app: Q.Q13_VOICE, params: [D30] },
  { name: 'Q14 dormant risk', marker: 'Q14: Dormant risk', app: Q.Q14_DORMANT_RISK, params: [] },
  { name: 'Q15 seats', marker: 'Q15: Seat utilization', app: Q.Q15_SEATS, params: [D30] },
  { name: 'Q16 partner scorecard', marker: 'Q16: Channel partner scorecard', app: Q.Q16_PARTNER_SCORECARD, params: [D30] },
  { name: 'Q17 waitlist', marker: 'Q17: Waitlist', app: Q.Q17_WAITLIST, params: [] },
  { name: 'Q18 lead funnel', marker: 'Q18: SDR / campaign funnel', app: Q.Q18_LEAD_FUNNEL, params: [] },
  { name: 'Q19 contact sales', marker: 'Q19: Contact-sales pipeline', app: Q.Q19_CONTACT_SALES, params: [] },
  { name: 'Q20 credit errors', marker: 'Q20: Credit usage errors', app: Q.Q20_CREDIT_ERRORS, params: [] },
  { name: 'Q21 failed payments', marker: 'Q21: Failed / pending payments', app: Q.Q21_FAILED_PAYMENTS, params: [] },
  { name: 'Q22 upgrades', marker: 'Q22: Plan upgrades', app: Q.Q22_UPGRADES, params: [] },
  { name: 'Q23 devices', marker: 'Q23: Login patterns', app: Q.Q23_DEVICES, params: [D30] },
  { name: 'Q24 workflow leaderboard', marker: 'Q24: Workflow (Studio) leaderboard', app: Q.Q24_WORKFLOW_LEADERBOARD, params: [D30] },
  { name: 'G2 segment scoreboard', marker: 'G2: Segment scoreboard', app: Q.G2_SEGMENT_SCOREBOARD, params: [] },
  { name: 'B1 money chart', marker: 'B1: THE MONEY CHART', app: Q.B1_MONEY_CHART, params: [null] },
  { name: 'B2 burn curve', marker: 'B2: BURN CURVE', app: Q.B2_BURN_CURVE, params: [null] },
  { name: 'B3 feature mix', marker: 'B3: WHAT THE FREE CREDITS BUY', app: Q.B3_FEATURE_MIX, params: [null] },
  { name: 'B4 partner benchmark', marker: 'B4: PARTNER BENCHMARK', app: Q.B4_PARTNER_BENCHMARK, params: [null, CREDIT_VALUE_INR] },
  { name: 'B5 credits at conversion', marker: 'B5: IS 1,000 THE RIGHT NUMBER', app: Q.B5_CREDITS_AT_CONVERSION, params: [null] },
  { name: 'B6 grant waste', marker: 'B6: GRANT WASTE', app: Q.B6_GRANT_WASTE, params: [null, CREDIT_VALUE_INR, GRANT_CREDITS] },
  { name: 'C1 campaign', marker: 'C1: Campaign performance', app: Q.C1_CAMPAIGN, params: [] },
  { name: 'Z1 zero-use aging', marker: 'Z1: ZERO-UTILIZATION AGING', app: Q.Z1_ZERO_USE_AGING, params: [null] },
  { name: 'Z2 activation latency', marker: 'Z2: Time to first credit use', app: Q.Z2_ACTIVATION_LATENCY, params: [null] },
  { name: 'P1 firmographics', marker: 'P1: END-USER PROFILE', app: Q.P1_FIRMOGRAPHICS, params: [null] },
  { name: 'P2 device/language', marker: 'P2: End-user behavioral profile', app: Q.P2_DEVICE_LANGUAGE, params: [null] },
];

/** Compare only the columns the library query produces, in the library's order. */
function project(rows: Record<string, unknown>[], columns: string[]) {
  return rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null])));
}

describe('SQL parity — app queries vs docs/SQL_LIBRARY.sql', () => {
  for (const c of CASES) {
    it(`${c.name} matches the library verbatim`, async () => {
      const expected = await readQuery(libraryQuery(c.marker));
      const actual = await readQuery(c.app, c.params);
      const columns = expected.length ? Object.keys(expected[0]) : [];
      expect(actual.length).toBe(expected.length);
      expect(project(actual, columns)).toEqual(project(expected, columns));
    });
  }

  it('G1 workshop funnel matches the library (with both filters unset)', async () => {
    const expected = await readQuery(libraryQuery('G1: Workshop funnel'));
    const actual = await readQuery(Q.G1_WORKSHOP_FUNNEL, [null, null]);
    const columns = Object.keys(expected[0] ?? {});
    expect(project(actual, columns)).toEqual(project(expected, columns));
  });

  it('G3 hot accounts matches the library under the WORKSHOP scope', async () => {
    // G3/G4/G5/W1 in the library are written with signupSource='WORKSHOP'
    // already, so the app's scope parameter is passed the same way.
    const expected = await readQuery(libraryQuery('G3: Hot accounts'));
    const actual = await readQuery(Q.G3_HOT_ACCOUNTS, ['WORKSHOP']);
    const columns = Object.keys(expected[0] ?? {});
    expect(project(actual, columns)).toEqual(project(expected, columns));
  });

  it('G5 economics matches the library under the WORKSHOP scope', async () => {
    const expected = await readQuery(libraryQuery('G5: September GTM economics'));
    const actual = await readQuery(Q.G5_GTM_ECONOMICS, ['WORKSHOP', CREDIT_VALUE_INR]);
    const columns = Object.keys(expected[0] ?? {});
    expect(project(actual, columns)).toEqual(project(expected, columns));
  });

  it('W1 partner weekly matches the library under the WORKSHOP scope', async () => {
    const expected = await readQuery(libraryQuery('W1: Weekly partner WhatsApp report'));
    const actual = await readQuery(Q.W1_PARTNER_WEEKLY, ['WORKSHOP']);
    const columns = Object.keys(expected[0] ?? {});
    expect(project(actual, columns)).toEqual(project(expected, columns));
  });

  // A2 deliberately diverges from the library text: the library omits the
  // min(1, …) clamp that ALGORITHMS.md §3 specifies, letting components exceed
  // their caps (audit finding F1). tests/partner-health.test.ts re-validates
  // the clamped query against the documented formula instead.

  it('the 90-day window really is wider than the 7-day one', async () => {
    const [d7, d90] = await Promise.all([readQuery(Q.Q1_DAILY_BURN, [7]), readQuery(Q.Q1_DAILY_BURN, [90])]);
    expect(d90.length).toBeGreaterThanOrEqual(d7.length);
  });
});

afterAll(async () => {
  await closePools();
});
