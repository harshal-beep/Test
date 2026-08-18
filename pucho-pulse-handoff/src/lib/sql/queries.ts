/**
 * src/lib/sql/queries.ts — the app's port of docs/SQL_LIBRARY.sql.
 *
 * CLAUDE.md: "SQL_LIBRARY.sql is truth. Port queries verbatim; if you must
 * modify one, re-validate against a Postgres loaded with the schema."
 *
 * The single modification made here is the date window: the library hardcodes
 * `interval '30 days'` / `'14 days'` / `'7 days'` where the dashboard needs a
 * 7/30/90-day filter, so those windows become `WINDOW($n)` — see `win()` below.
 * Windows that are part of a *definition* rather than the user's filter (the
 * "activated within 7 days" rule, the 14-day Office habit window, the momentum
 * 7d-vs-prior-7d split, the zero-use aging buckets) are left hardcoded, because
 * changing them would change what the metric means.
 *
 * tests/parity.test.ts re-validates every modified query: it runs the verbatim
 * text extracted from docs/SQL_LIBRARY.sql and the version below with days=30
 * against the fixture DB and asserts the result sets are identical.
 */

/** `(($n)::text || ' days')::interval` — a bound day-window. */
const win = (n: number) => `((($${n})::text || ' days')::interval)`;

// ############ Q1–Q25: CORE DASHBOARD ############

/** Q1: Daily credit burn with 7-day moving average. $1 = days. */
export const Q1_DAILY_BURN = `
SELECT
  date_trunc('day', ct."createdAt")::date AS day,
  SUM(ct.credits)                          AS credits_burned,
  COUNT(DISTINCT ct."userId")              AS active_burning_users,
  ROUND(AVG(SUM(ct.credits)) OVER (ORDER BY date_trunc('day', ct."createdAt")::date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS ma_7d
FROM "CreditTransaction" ct
WHERE ct."transactionType" IN ('USAGE','DEBIT')
  AND ct."createdAt" >= now() - ${win(1)}
GROUP BY 1
ORDER BY 1`;

/** Q2: Credit burn by feature. $1 = days. */
export const Q2_BURN_BY_FEATURE = `
SELECT
  CASE
    WHEN ct."chatQueId" IS NOT NULL THEN 'Chat / Search'
    WHEN ct."flowId"    IS NOT NULL THEN 'Workflow (Studio)'
    WHEN ct."agentName" IS NOT NULL THEN 'Agent'
    ELSE COALESCE(ct.type, 'Other')
  END                                   AS feature,
  SUM(ct.credits)                       AS credits_burned,
  COUNT(*)                              AS txn_count,
  COUNT(DISTINCT ct."userId")           AS unique_users,
  ROUND(100.0 * SUM(ct.credits) / NULLIF(SUM(SUM(ct.credits)) OVER (), 0), 1) AS pct_of_total
FROM "CreditTransaction" ct
WHERE ct."transactionType" IN ('USAGE','DEBIT')
  AND ct."createdAt" >= now() - ${win(1)}
GROUP BY 1
ORDER BY credits_burned DESC`;

/** Q3: Wallet utilization by organization. No date window. */
export const Q3_WALLET_UTILIZATION = `
SELECT
  o.name                                        AS organization,
  cw.type                                       AS credit_type,
  SUM(cw.allocated)                             AS allocated,
  SUM(cw.used)                                  AS used,
  ROUND(100.0 * SUM(cw.used) / NULLIF(SUM(cw.allocated),0), 1) AS utilization_pct,
  MIN(cw."expiryDate")                          AS earliest_expiry
FROM "CreditWallets" cw
JOIN "Organization" o ON o.id = cw."organizationId"
WHERE cw."isActive" = true
GROUP BY o.name, cw.type
ORDER BY utilization_pct DESC NULLS LAST`;

/** Q4: Top 20 credit-consuming users. $1 = days. */
export const Q4_TOP_USERS = `
SELECT
  u."firstName" || ' ' || COALESCE(u."lastName",'') AS user_name,
  u.email,
  o.name                        AS organization,
  SUM(ct.credits)               AS credits_30d,
  COUNT(*)                      AS transactions,
  MAX(ct."createdAt")           AS last_activity
FROM "CreditTransaction" ct
JOIN "User" u ON u.id = ct."userId"
LEFT JOIN "Organization" o ON o.id = ct."organizationId"
WHERE ct."transactionType" IN ('USAGE','DEBIT')
  AND ct."createdAt" >= now() - ${win(1)}
GROUP BY 1, 2, 3
ORDER BY credits_30d DESC
LIMIT 20`;

/** Q5: MRR proxy. */
export const Q5_MRR = `
SELECT
  p.title                                            AS plan,
  COUNT(*)                                           AS active_orgs,
  SUM(CASE op."PayFrequency"
        WHEN 'YEARLY'    THEN COALESCE(p."yearlyPrice", p.price*10)/12.0
        WHEN 'QUARTERLY' THEN p.price
        ELSE p.price
      END)                                           AS mrr_inr
FROM "OrganizationPackage" op
JOIN "Package" p ON p.id = op."packageId"
WHERE op.status = 'Active'
  AND (op."endDate" IS NULL OR op."endDate" > now())
GROUP BY p.title
ORDER BY mrr_inr DESC NULLS LAST`;

/** Q6: Revenue collected by month. */
export const Q6_REVENUE_BY_MONTH = `
SELECT
  date_trunc('month', pay."paymentDate")::date AS month,
  SUM(pay.amount)                              AS revenue_inr,
  COUNT(*)                                     AS payments,
  COUNT(DISTINCT pay."organizationId")         AS paying_orgs
FROM "Payment" pay
WHERE pay."paymentStatus" IN ('COMPLETED','PAID')
GROUP BY 1
ORDER BY 1`;

/** Q7: Free vs paid credit consumption. $1 = days (used twice). */
export const Q7_FREE_VS_PAID = `
SELECT 'Paid/Wallet credits' AS source, SUM(credits) AS credits
FROM "CreditTransaction"
WHERE "transactionType" IN ('USAGE','DEBIT') AND "createdAt" >= now() - ${win(1)}
UNION ALL
SELECT 'Free credits', SUM(credits)
FROM "FreeCreditUsage"
WHERE "createdAt" >= now() - ${win(1)}`;

/** Q8: Signups per week + activation. The 7-day activation window is a definition, not a filter. */
export const Q8_SIGNUPS_ACTIVATION = `
WITH signups AS (
  SELECT u.id, u."createdAt",
         EXISTS (
           SELECT 1 FROM "ChatQuestion" cq
           WHERE cq."createdBy" = u.id
             AND cq."createdAt" <= u."createdAt" + interval '7 days'
         ) AS asked_in_7d,
         u."isOnboarded"
  FROM "User" u
  WHERE u.status <> 'Deleted'
)
SELECT
  date_trunc('week', "createdAt")::date AS week,
  COUNT(*)                              AS signups,
  COUNT(*) FILTER (WHERE "isOnboarded") AS onboarded,
  COUNT(*) FILTER (WHERE asked_in_7d)   AS activated_7d,
  ROUND(100.0 * COUNT(*) FILTER (WHERE asked_in_7d) / NULLIF(COUNT(*),0), 1) AS activation_pct
FROM signups
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12`;

/** Q9: DAU / WAU / MAU. Windows are the metric definition — never parameterized. */
export const Q9_DAU_WAU_MAU = `
WITH activity AS (
  SELECT "createdBy" AS user_id, "createdAt" FROM "ChatQuestion"
  UNION ALL
  SELECT "userId", "createdAt" FROM "CreditTransaction" WHERE "userId" IS NOT NULL
  UNION ALL
  SELECT "userId", "createdAt" FROM "LoginHistory"
)
SELECT
  COUNT(DISTINCT user_id) FILTER (WHERE "createdAt" >= now() - interval '1 day')   AS dau,
  COUNT(DISTINCT user_id) FILTER (WHERE "createdAt" >= now() - interval '7 days')  AS wau,
  COUNT(DISTINCT user_id) FILTER (WHERE "createdAt" >= now() - interval '30 days') AS mau,
  ROUND(100.0 * COUNT(DISTINCT user_id) FILTER (WHERE "createdAt" >= now() - interval '1 day')
      / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE "createdAt" >= now() - interval '30 days'),0), 1) AS stickiness_pct
FROM activity`;

/** Q10: Monthly retention cohorts. */
export const Q10_COHORTS = `
WITH activity AS (
  SELECT "createdBy" AS user_id, date_trunc('month', "createdAt") AS active_month
  FROM "ChatQuestion"
  GROUP BY 1, 2
),
cohorts AS (
  SELECT id AS user_id, date_trunc('month', "createdAt") AS cohort_month
  FROM "User" WHERE status <> 'Deleted'
)
SELECT
  c.cohort_month::date                                       AS cohort,
  COUNT(DISTINCT c.user_id)                                  AS cohort_size,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_month = c.cohort_month + interval '1 month') AS m1,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_month = c.cohort_month + interval '2 months') AS m2,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.active_month = c.cohort_month + interval '3 months') AS m3
FROM cohorts c
LEFT JOIN activity a ON a.user_id = c.user_id
GROUP BY 1
ORDER BY 1 DESC
LIMIT 12`;

/** Q11: Feature adoption by chat type. $1 = days. */
export const Q11_CHAT_TYPES = `
SELECT
  ch."chatType",
  COUNT(DISTINCT ch.id)          AS chats,
  COUNT(cq.id)                   AS questions,
  COUNT(DISTINCT cq."createdBy") AS unique_users
FROM "ChatHistory" ch
LEFT JOIN "ChatQuestion" cq ON cq."chatHistoryId" = ch.id
WHERE ch."createdAt" >= now() - ${win(1)}
GROUP BY 1
ORDER BY questions DESC`;

/** Q12: Pro Search / Deep Research / file / mobile usage. $1 = days. */
export const Q12_QUESTION_FLAGS = `
SELECT
  COUNT(*)                                        AS total_questions,
  COUNT(*) FILTER (WHERE "isProSearch")           AS pro_search,
  COUNT(*) FILTER (WHERE "isDeepResearch")        AS deep_research,
  COUNT(*) FILTER (WHERE "isFile")                AS with_files,
  COUNT(*) FILTER (WHERE "isMobile")              AS from_mobile
FROM "ChatQuestion"
WHERE "createdAt" >= now() - ${win(1)}`;

/** Q13: Voice agent usage by org. $1 = days. */
export const Q13_VOICE = `
SELECT
  o.name                                   AS organization,
  COUNT(*)                                 AS calls,
  SUM(c."durationSec")                     AS total_seconds,
  ROUND(SUM(c."durationSec")/60.0, 1)      AS total_minutes,
  COUNT(*) FILTER (WHERE c."callStatus" = 'completed') AS completed_calls
FROM "Calls" c
JOIN "Organization" o ON o.id = c."orgId"
WHERE c."createdAt" >= now() - ${win(1)}
GROUP BY 1
ORDER BY total_minutes DESC NULLS LAST`;

/** Q14: Dormant risk — paying orgs with falling usage. */
export const Q14_DORMANT_RISK = `
WITH usage_by_org AS (
  SELECT
    ct."organizationId" AS org_id,
    SUM(ct.credits) FILTER (WHERE ct."createdAt" >= now() - interval '30 days') AS cur_30d,
    SUM(ct.credits) FILTER (WHERE ct."createdAt" >= now() - interval '60 days'
                            AND ct."createdAt" < now() - interval '30 days')   AS prev_30d
  FROM "CreditTransaction" ct
  WHERE ct."transactionType" IN ('USAGE','DEBIT') AND ct."organizationId" IS NOT NULL
  GROUP BY 1
)
SELECT
  o.name,
  COALESCE(ub.cur_30d, 0)  AS credits_this_30d,
  COALESCE(ub.prev_30d, 0) AS credits_prior_30d,
  ROUND(100.0 * (COALESCE(ub.cur_30d,0) - COALESCE(ub.prev_30d,0)) / NULLIF(ub.prev_30d,0), 1) AS change_pct
FROM "OrganizationPackage" op
JOIN "Organization" o ON o.id = op."organizationId"
LEFT JOIN usage_by_org ub ON ub.org_id = o.id
WHERE op.status = 'Active'
  AND (COALESCE(ub.cur_30d,0) < 0.5 * COALESCE(ub.prev_30d,0) OR ub.cur_30d IS NULL)
ORDER BY credits_prior_30d DESC`;

/** Q15: Seat utilization per org. $1 = days. */
export const Q15_SEATS = `
SELECT
  o.name,
  op."numberOfUser"                       AS seats_bought,
  COUNT(DISTINCT ou."userId")             AS seats_assigned,
  COUNT(DISTINCT lh."userId") FILTER (WHERE lh."createdAt" >= now() - ${win(1)}) AS seats_active_30d,
  ROUND(100.0 * COUNT(DISTINCT lh."userId") FILTER (WHERE lh."createdAt" >= now() - ${win(1)})
       / NULLIF(op."numberOfUser",0), 1)  AS active_seat_pct
FROM "OrganizationPackage" op
JOIN "Organization" o ON o.id = op."organizationId"
LEFT JOIN "OrganizationUser" ou ON ou."organizationId" = o.id AND ou.status = 'Active'
LEFT JOIN "LoginHistory" lh ON lh."orgId" = o.id
WHERE op.status = 'Active'
GROUP BY o.name, op."numberOfUser"
ORDER BY active_seat_pct ASC NULLS FIRST`;

/** Q16: Channel partner scorecard. $1 = days. */
export const Q16_PARTNER_SCORECARD = `
SELECT
  cp."companyName"                          AS partner,
  cp.tier,
  COUNT(DISTINCT o.id)                      AS orgs_onboarded,
  COUNT(DISTINCT o.id) FILTER (WHERE o."isOnboarded") AS orgs_live,
  COALESCE(SUM(ct.credits), 0)              AS credits_burned_30d
FROM "ChannelPartner" cp
LEFT JOIN "Organization" o ON o."channelPartnerId" = cp.id
LEFT JOIN "CreditTransaction" ct
       ON ct."organizationId" = o.id
      AND ct."transactionType" IN ('USAGE','DEBIT')
      AND ct."createdAt" >= now() - ${win(1)}
WHERE cp.status = 'Active'
GROUP BY cp."companyName", cp.tier
ORDER BY credits_burned_30d DESC`;

/** Q17: Waitlist → signup conversion. */
export const Q17_WAITLIST = `
SELECT
  COUNT(*)                                          AS waitlist_total,
  COUNT(u.id)                                       AS converted_to_user,
  ROUND(100.0 * COUNT(u.id) / NULLIF(COUNT(*),0),1) AS conversion_pct
FROM "WaitlistUser" w
LEFT JOIN "User" u ON lower(u.email) = lower(w.email)`;

/** Q18: SDR / campaign funnel. */
export const Q18_LEAD_FUNNEL = `
SELECT
  cl.status,
  COUNT(*) AS leads,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (),0), 1) AS pct
FROM "CampaignLead" cl
GROUP BY cl.status
ORDER BY leads DESC`;

/** Q19: Contact-sales pipeline by month and company size. */
export const Q19_CONTACT_SALES = `
SELECT
  date_trunc('month', "createdAt")::date AS month,
  "companySize",
  COUNT(*) AS enquiries
FROM "ContactSales"
GROUP BY 1, 2
ORDER BY 1 DESC, enquiries DESC`;

/** Q20: Credit usage errors per day (billing health). */
export const Q20_CREDIT_ERRORS = `
SELECT
  date_trunc('day', "createdAt")::date AS day,
  COUNT(*) AS errors,
  COUNT(DISTINCT "userId") AS affected_users
FROM "CreditUsageError"
WHERE "createdAt" >= now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC`;

/** Q21: Failed / pending payments needing follow-up. */
export const Q21_FAILED_PAYMENTS = `
SELECT
  o.id AS org_id,
  o.name, pay.amount, pay."paymentMethod", pay."paymentStatus", pay."paymentDate"
FROM "Payment" pay
JOIN "Organization" o ON o.id = pay."organizationId"
WHERE pay."paymentStatus" IN ('FAILED','PENDING','PROCESSING')
ORDER BY pay."paymentDate" DESC
LIMIT 50`;

/** Q22: Plan upgrades / downgrades trend. */
export const Q22_UPGRADES = `
SELECT
  date_trunc('month', su."createdAt")::date AS month,
  su."upgradeStatus",
  COUNT(*) AS upgrades
FROM "SubscriptionUpgrade" su
GROUP BY 1, 2
ORDER BY 1 DESC`;

/** Q23: Login patterns — device and OS split. $1 = days. */
export const Q23_DEVICES = `
SELECT
  COALESCE(device, 'Unknown') AS device,
  COALESCE(os, 'Unknown')     AS os,
  COUNT(*)                    AS logins,
  COUNT(DISTINCT "userId")    AS users
FROM "LoginHistory"
WHERE "createdAt" >= now() - ${win(1)}
GROUP BY 1, 2
ORDER BY logins DESC
LIMIT 15`;

/** Q24: Workflow (Studio) leaderboard. $1 = days. */
export const Q24_WORKFLOW_LEADERBOARD = `
SELECT
  ct."flowName",
  COUNT(DISTINCT ct."runId")   AS runs,
  SUM(ct.credits)              AS credits,
  COUNT(DISTINCT ct."userId")  AS users
FROM "CreditTransaction" ct
WHERE ct."flowId" IS NOT NULL
  AND ct."transactionType" IN ('USAGE','DEBIT')
  AND ct."createdAt" >= now() - ${win(1)}
GROUP BY ct."flowName"
ORDER BY credits DESC
LIMIT 20`;

/** Q25: Org-level 360 (one row per org). */
export const Q25_ORG_360 = `
SELECT
  o.id                                      AS org_id,
  o.name,
  o.industry,
  o."createdAt"::date                       AS signed_up,
  o."isOnboarded",
  p.title                                   AS plan,
  op."PayFrequency",
  op."endDate"::date                        AS renewal_date,
  COALESCE(w.allocated,0)                   AS credits_allocated,
  COALESCE(w.used,0)                        AS credits_used,
  ROUND(100.0*COALESCE(w.used,0)/NULLIF(w.allocated,0),1) AS util_pct,
  cp."companyName"                          AS partner
FROM "Organization" o
LEFT JOIN "OrganizationPackage" op ON op."organizationId" = o.id AND op.status = 'Active'
LEFT JOIN "Package" p ON p.id = op."packageId"
LEFT JOIN (
  SELECT "organizationId", SUM(allocated) AS allocated, SUM(used) AS used
  FROM "CreditWallets" WHERE "isActive" GROUP BY 1
) w ON w."organizationId" = o.id
LEFT JOIN "ChannelPartner" cp ON cp.id = o."channelPartnerId"
WHERE o.status = 'Active'
ORDER BY credits_used DESC NULLS LAST`;

// ############ G1–G5, W1: WORKSHOP / GTM FUNNEL ############

/**
 * G1: Workshop funnel, one row per workshop.
 * Optional filters appended by the API: $1 = campaignTag (nullable), $2 = segment (nullable).
 */
export const G1_WORKSHOP_FUNNEL = `
WITH accounts AS (
  SELECT
    o."workshopId",
    o.id AS org_id,
    EXISTS (SELECT 1 FROM "FreeCreditUsage" f
            WHERE f."organizationId" = o.id
              AND f."createdAt" <= o."createdAt" + interval '7 days') AS activated_7d,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = o.id
                AND f."createdAt" <= o."createdAt" + interval '14 days'), 0) AS credits_14d,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId" = o.id AND op.status = 'Active') AS converted
  FROM "Organization" o
  WHERE o."workshopId" IS NOT NULL
)
SELECT
  w.id                                                      AS workshop_id,
  w."workshopDate"::date                                    AS date,
  w."segmentName"                                           AS segment,
  w."campaignTag"                                           AS campaign_tag,
  w.status,
  cp."companyName"                                          AS partner,
  w."invitedCount"                                          AS invited,
  w."attendedCount"                                         AS attended,
  COUNT(a.org_id)                                           AS accounts_created,
  COUNT(*) FILTER (WHERE a.activated_7d)                    AS activated_7d,
  ROUND(AVG(a.credits_14d), 0)                              AS avg_credits_14d,
  COUNT(*) FILTER (WHERE a.credits_14d >= 300)              AS engaged_300plus,
  COUNT(*) FILTER (WHERE a.converted)                       AS converted_paid,
  ROUND(100.0 * COUNT(*) FILTER (WHERE a.converted)
        / NULLIF(COUNT(a.org_id),0), 1)                     AS conversion_pct
FROM "Workshop" w
LEFT JOIN "ChannelPartner" cp ON cp.id = w."channelPartnerId"
LEFT JOIN accounts a ON a."workshopId" = w.id
WHERE ($1::text IS NULL OR w."campaignTag" = $1::text)
  AND ($2::text IS NULL OR w."segmentName" = $2::text)
GROUP BY w.id, w."workshopDate", w."segmentName", w."campaignTag", w.status, cp."companyName",
         w."invitedCount", w."attendedCount"
ORDER BY w."workshopDate" DESC`;

/** G2: Segment scoreboard (kill/double-down). */
export const G2_SEGMENT_SCOREBOARD = `
WITH accounts AS (
  SELECT
    o."signupSegment" AS segment,
    o.id AS org_id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = o.id), 0) AS free_credits_used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId" = o.id AND op.status = 'Active') AS converted
  FROM "Organization" o
  WHERE o."signupSource" = 'WORKSHOP'
)
SELECT
  segment,
  COUNT(*)                                              AS accounts,
  ROUND(AVG(free_credits_used), 0)                      AS avg_credits_used,
  ROUND(100.0 * COUNT(*) FILTER (WHERE free_credits_used >= 300) / NULLIF(COUNT(*),0), 1) AS engaged_pct,
  COUNT(*) FILTER (WHERE converted)                     AS paid,
  ROUND(100.0 * COUNT(*) FILTER (WHERE converted) / NULLIF(COUNT(*),0), 1) AS conversion_pct
FROM accounts
GROUP BY segment
ORDER BY conversion_pct DESC NULLS LAST, engaged_pct DESC`;

/**
 * G3: Hot accounts for partner follow-up (≥700 grant credits, not yet converted).
 * $1 = grant scope: 'WORKSHOP' once M1 attribution is live, NULL to fall back to
 * `channelPartnerId IS NOT NULL` (SQL_LIBRARY scope note / TRD §7).
 */
export const G3_HOT_ACCOUNTS = `
SELECT
  o.id                                          AS org_id,
  o.name                                        AS organization,
  cp."companyName"                              AS partner,
  o."signupSegment"                             AS segment,
  SUM(f.credits)                                AS free_credits_used,
  ROUND(100.0 * SUM(f.credits) / 1000, 0)       AS pct_of_free_quota,
  MAX(f."createdAt")                            AS last_active
FROM "Organization" o
JOIN "FreeCreditUsage" f ON f."organizationId" = o.id
LEFT JOIN "ChannelPartner" cp ON cp.id = o."channelPartnerId"
WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
  AND NOT EXISTS (SELECT 1 FROM "OrganizationPackage" op
                  WHERE op."organizationId" = o.id AND op.status = 'Active')
GROUP BY o.id, o.name, cp."companyName", o."signupSegment"
HAVING SUM(f.credits) >= 700
ORDER BY free_credits_used DESC`;

/** G4: Stalled accounts (created ≥14d ago, under 100 credits). $1 = grant scope. */
export const G4_STALLED = `
SELECT
  o.id AS org_id, o.name, cp."companyName" AS partner, o."signupSegment" AS segment,
  o."createdAt"::date AS created,
  COALESCE(SUM(f.credits),0) AS free_credits_used
FROM "Organization" o
LEFT JOIN "FreeCreditUsage" f ON f."organizationId" = o.id
LEFT JOIN "ChannelPartner" cp ON cp.id = o."channelPartnerId"
WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
  AND o."createdAt" <= now() - interval '14 days'
GROUP BY o.id, o.name, cp."companyName", o."signupSegment", o."createdAt"
HAVING COALESCE(SUM(f.credits),0) < 100
ORDER BY o."createdAt"`;

/** G5: GTM economics rollup. $1 = grant scope, $2 = credit value INR. */
export const G5_GTM_ECONOMICS = `
WITH gtm AS (
  SELECT o.id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f WHERE f."organizationId"=o.id),0) AS free_used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op WHERE op."organizationId"=o.id AND op.status='Active') AS converted,
    (SELECT COALESCE(SUM(p.amount),0) FROM "Payment" p
      WHERE p."organizationId"=o.id AND p."paymentStatus" IN ('COMPLETED','PAID')) AS revenue
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT
  COUNT(*)                                   AS accounts,
  SUM(free_used)                             AS free_credits_consumed,
  ROUND(SUM(free_used) * $2::numeric, 0)     AS credit_cost_inr,
  COUNT(*) FILTER (WHERE converted)          AS conversions,
  SUM(revenue)                               AS revenue_collected_inr,
  ROUND(SUM(revenue) / NULLIF(SUM(free_used)*$2::numeric, 0), 2) AS revenue_per_credit_rupee
FROM gtm`;

/** W1: Weekly partner report, one row per partner. $1 = grant scope. */
export const W1_PARTNER_WEEKLY = `
WITH accts AS (
  SELECT o.id, o."channelPartnerId", o.name,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f WHERE f."organizationId"=o.id),0) AS used,
    o."createdAt" >= now() - interval '7 days' AS is_new,
    EXISTS (SELECT 1 FROM "FreeCreditUsage" f WHERE f."organizationId"=o.id
            AND f."createdAt" >= now() - interval '7 days') AS active_this_week,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op WHERE op."organizationId"=o.id
            AND op.status='Active') AS converted
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
    AND o."channelPartnerId" IS NOT NULL
)
SELECT
  cp.id                                               AS partner_id,
  cp."companyName"                                    AS partner,
  COUNT(*) FILTER (WHERE is_new)                      AS new_accounts_7d,
  COUNT(*) FILTER (WHERE active_this_week)            AS active_this_week,
  COUNT(*) FILTER (WHERE used >= 700 AND NOT converted) AS hot_leads,
  COUNT(*) FILTER (WHERE used < 100)                  AS stalled,
  COUNT(*) FILTER (WHERE converted)                   AS total_converted
FROM accts a
JOIN "ChannelPartner" cp ON cp.id = a."channelPartnerId"
GROUP BY cp.id, cp."companyName"
ORDER BY hot_leads DESC`;

// ############ B1–B6: CREDIT GRANT BENCHMARK ############

/** B1: THE MONEY CHART — conversion rate by credit-usage band. $1 = grant scope. */
export const B1_MONEY_CHART = `
WITH grant_orgs AS (
  SELECT o.id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = o.id), 0) AS used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId" = o.id AND op.status = 'Active') AS converted
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT
  CASE
    WHEN used < 100  THEN 'a. 0–99 (never landed)'
    WHEN used < 300  THEN 'b. 100–299 (tried it)'
    WHEN used < 700  THEN 'c. 300–699 (engaged)'
    WHEN used < 1000 THEN 'd. 700–999 (hot)'
    ELSE                  'e. 1000+ (exhausted)'
  END                                                    AS usage_band,
  COUNT(*)                                               AS accounts,
  COUNT(*) FILTER (WHERE converted)                      AS converted,
  ROUND(100.0 * COUNT(*) FILTER (WHERE converted)
        / NULLIF(COUNT(*),0), 1)                         AS conversion_pct
FROM grant_orgs
GROUP BY 1
ORDER BY 1`;

/** B2: BURN CURVE — median days to each milestone. $1 = grant scope. */
export const B2_BURN_CURVE = `
WITH daily_cum AS (
  SELECT
    f."organizationId" AS org_id,
    o."createdAt"      AS org_created,
    f."createdAt",
    SUM(f.credits) OVER (PARTITION BY f."organizationId"
                         ORDER BY f."createdAt") AS cum_credits
  FROM "FreeCreditUsage" f
  JOIN "Organization" o ON o.id = f."organizationId"
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
),
milestones AS (
  SELECT org_id,
    MIN("createdAt") FILTER (WHERE cum_credits >= 100)  - MIN(org_created) AS to_100,
    MIN("createdAt") FILTER (WHERE cum_credits >= 300)  - MIN(org_created) AS to_300,
    MIN("createdAt") FILTER (WHERE cum_credits >= 700)  - MIN(org_created) AS to_700,
    MIN("createdAt") FILTER (WHERE cum_credits >= 1000) - MIN(org_created) AS to_1000
  FROM daily_cum
  GROUP BY org_id
)
SELECT
  percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM to_100)/86400)  AS median_days_to_100,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM to_300)/86400)  AS median_days_to_300,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM to_700)/86400)  AS median_days_to_700,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM to_1000)/86400) AS median_days_to_1000,
  COUNT(*) FILTER (WHERE to_1000 IS NOT NULL)                                    AS exhausted_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE to_1000 IS NOT NULL) / NULLIF(COUNT(*),0), 1) AS exhaustion_pct
FROM milestones`;

/** B3: What the free credits buy — dominant feature vs conversion. $1 = grant scope. */
export const B3_FEATURE_MIX = `
WITH usage_mix AS (
  SELECT
    f."organizationId" AS org_id,
    CASE
      WHEN f."flowId" IS NOT NULL THEN 'Workflow'
      WHEN f.type ILIKE '%voice%' OR f.type ILIKE '%call%' THEN 'Voice'
      WHEN f.type ILIKE '%agent%' THEN 'Agent'
      ELSE 'Chat / Search'
    END AS feature,
    SUM(f.credits) AS credits
  FROM "FreeCreditUsage" f
  JOIN "Organization" o ON o.id = f."organizationId"
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
  GROUP BY 1, 2
),
dominant AS (
  SELECT DISTINCT ON (org_id) org_id, feature, credits
  FROM usage_mix
  ORDER BY org_id, credits DESC
)
SELECT
  d.feature                                              AS dominant_feature,
  COUNT(*)                                               AS accounts,
  ROUND(AVG(d.credits), 0)                               AS avg_credits_on_it,
  ROUND(100.0 * COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM "OrganizationPackage" op
      WHERE op."organizationId" = d.org_id AND op.status = 'Active'))
      / NULLIF(COUNT(*),0), 1)                           AS conversion_pct
FROM dominant d
GROUP BY d.feature
ORDER BY conversion_pct DESC`;

/** B4: Partner benchmark — same grant, different outcomes. $1 = grant scope, $2 = credit value. */
export const B4_PARTNER_BENCHMARK = `
WITH grant_orgs AS (
  SELECT o.id, o."channelPartnerId",
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = o.id), 0) AS used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId" = o.id AND op.status = 'Active') AS converted
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT
  cp."companyName"                                       AS partner,
  COUNT(*)                                               AS accounts,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY g.used)::numeric, 0) AS median_credits_used,
  ROUND(100.0 * COUNT(*) FILTER (WHERE g.used >= 300) / NULLIF(COUNT(*),0), 1) AS engaged_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE g.used >= 1000) / NULLIF(COUNT(*),0), 1) AS exhausted_pct,
  COUNT(*) FILTER (WHERE g.converted)                    AS conversions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE g.converted) / NULLIF(COUNT(*),0), 1) AS conversion_pct,
  ROUND(SUM(g.used) * $2::numeric / NULLIF(COUNT(*) FILTER (WHERE g.converted), 0), 0) AS credit_cost_per_conversion_inr
FROM grant_orgs g
JOIN "ChannelPartner" cp ON cp.id = g."channelPartnerId"
GROUP BY cp."companyName"
ORDER BY conversion_pct DESC`;

/** B5: Is 1,000 the right number? Credits consumed at the moment of conversion. $1 = grant scope. */
export const B5_CREDITS_AT_CONVERSION = `
WITH conv AS (
  SELECT o.id AS org_id, MIN(op."startDate") AS converted_at
  FROM "Organization" o
  JOIN "OrganizationPackage" op ON op."organizationId" = o.id
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
    AND op."startDate" IS NOT NULL
  GROUP BY o.id
)
SELECT
  ROUND(percentile_cont(0.25) WITHIN GROUP (ORDER BY used_at_conv)::numeric, 0) AS p25_credits_at_conversion,
  ROUND(percentile_cont(0.5)  WITHIN GROUP (ORDER BY used_at_conv)::numeric, 0) AS median_credits_at_conversion,
  ROUND(percentile_cont(0.75) WITHIN GROUP (ORDER BY used_at_conv)::numeric, 0) AS p75_credits_at_conversion,
  COUNT(*)                                                                      AS conversions_measured
FROM (
  SELECT c.org_id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = c.org_id
                AND f."createdAt" <= c.converted_at), 0) AS used_at_conv
  FROM conv c
) x`;

/** B6: Grant waste — credits issued vs consumed. $1 = grant scope, $2 = credit value, $3 = grant size. */
export const B6_GRANT_WASTE = `
SELECT
  COUNT(*)                                        AS grant_accounts,
  COUNT(*) * $3::int                              AS credits_issued,
  SUM(used)                                       AS credits_consumed,
  ROUND(100.0 * SUM(used) / NULLIF(COUNT(*)*$3::int, 0), 1) AS utilization_pct,
  ROUND((COUNT(*)*$3::int - SUM(used)) * $2::numeric, 0)    AS unused_value_inr
FROM (
  SELECT o.id,
    LEAST($3::int, COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = o.id), 0)) AS used
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
) g`;

// ############ C1, Z1–Z2, P1–P2, A1–A2, S1–S2 ############

/** C1: Campaign performance. */
export const C1_CAMPAIGN = `
WITH accts AS (
  SELECT w."campaignTag", o.id AS org_id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0) AS used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Workshop" w
  JOIN "Organization" o ON o."workshopId" = w.id
)
SELECT
  "campaignTag"                                          AS campaign,
  COUNT(*)                                               AS accounts,
  COUNT(*) FILTER (WHERE used = 0)                       AS zero_use,
  ROUND(100.0*COUNT(*) FILTER (WHERE used = 0)/NULLIF(COUNT(*),0),1) AS zero_use_pct,
  ROUND(AVG(used),0)                                     AS avg_credits,
  COUNT(*) FILTER (WHERE converted)                      AS paid,
  ROUND(100.0*COUNT(*) FILTER (WHERE converted)/NULLIF(COUNT(*),0),1) AS conversion_pct
FROM accts
GROUP BY 1 ORDER BY conversion_pct DESC NULLS LAST`;

/** Z1: Zero-utilization aging. $1 = grant scope. */
export const Z1_ZERO_USE_AGING = `
WITH grant_orgs AS (
  SELECT o.id, o.name, o."createdAt", o."channelPartnerId",
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0) AS used
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT
  cp."companyName"                                            AS partner,
  COUNT(*) FILTER (WHERE used=0)                              AS zero_use_total,
  COUNT(*) FILTER (WHERE used=0 AND g."createdAt" >= now()-interval '7 days')   AS age_0_7d,
  COUNT(*) FILTER (WHERE used=0 AND g."createdAt" <  now()-interval '7 days'
                                AND g."createdAt" >= now()-interval '14 days')  AS age_7_14d,
  COUNT(*) FILTER (WHERE used=0 AND g."createdAt" <  now()-interval '14 days'
                                AND g."createdAt" >= now()-interval '30 days')  AS age_14_30d,
  COUNT(*) FILTER (WHERE used=0 AND g."createdAt" <  now()-interval '30 days')  AS age_30d_plus,
  ROUND(100.0*COUNT(*) FILTER (WHERE used=0)/NULLIF(COUNT(*),0),1)            AS zero_use_pct
FROM grant_orgs g
JOIN "ChannelPartner" cp ON cp.id = g."channelPartnerId"
GROUP BY cp."companyName"
ORDER BY zero_use_pct DESC`;

/** Z2: Time to first credit use per signup week. $1 = grant scope. */
export const Z2_ACTIVATION_LATENCY = `
WITH firstuse AS (
  SELECT o.id, o."createdAt" AS signup,
    (SELECT MIN(f."createdAt") FROM "FreeCreditUsage" f
     WHERE f."organizationId"=o.id) AS first_use
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT
  date_trunc('week', signup)::date                            AS signup_week,
  COUNT(*)                                                    AS accounts,
  COUNT(first_use)                                            AS ever_used,
  ROUND(100.0*(COUNT(*)-COUNT(first_use))/NULLIF(COUNT(*),0),1) AS never_used_pct,
  ROUND(percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(epoch FROM first_use-signup)/86400)::numeric, 1) AS median_days_to_first_use,
  COUNT(*) FILTER (WHERE first_use <= signup + interval '48 hours') AS used_within_48h
FROM firstuse
GROUP BY 1 ORDER BY 1 DESC`;

/** P1: End-user profile vs behaviour (industry × size). $1 = grant scope. */
export const P1_FIRMOGRAPHICS = `
WITH grant_orgs AS (
  SELECT o.id, o.industry, o."companySize",
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0) AS used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT
  COALESCE(industry,'Unknown')                                 AS industry,
  COALESCE("companySize",'?')                                  AS company_size,
  COUNT(*)                                                     AS accounts,
  ROUND(100.0*COUNT(*) FILTER (WHERE used=0)/NULLIF(COUNT(*),0),1)  AS zero_use_pct,
  ROUND(AVG(used),0)                                           AS avg_credits,
  ROUND(100.0*COUNT(*) FILTER (WHERE converted)/NULLIF(COUNT(*),0),1) AS conversion_pct
FROM grant_orgs
GROUP BY 1,2
HAVING COUNT(*) >= 3
ORDER BY conversion_pct DESC`;

/** P2: Device / language profile vs engagement. $1 = grant scope. */
export const P2_DEVICE_LANGUAGE = `
WITH grant_users AS (
  SELECT u.id AS user_id, o.id AS org_id,
    l.name AS language,
    (SELECT lh.device FROM "LoginHistory" lh WHERE lh."userId"=u.id
     ORDER BY lh."createdAt" DESC LIMIT 1) AS last_device,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."userId"=u.id),0) AS user_credits
  FROM "User" u
  JOIN "OrganizationUser" ou ON ou."userId"=u.id
  JOIN "Organization" o ON o.id=ou."organizationId"
  LEFT JOIN "Language" l ON l.id = u."preferredLanguageId"
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT
  COALESCE(last_device,'Never logged in')  AS device,
  COALESCE(language,'?')                   AS language,
  COUNT(*)                                 AS users,
  ROUND(AVG(user_credits),0)               AS avg_credits,
  COUNT(*) FILTER (WHERE user_credits=0)   AS zero_use
FROM grant_users
GROUP BY 1,2
ORDER BY users DESC`;

/** A1: Partner monthly trend. $1 = grant scope, $2 = partner id (nullable). */
export const A1_PARTNER_TREND = `
WITH accts AS (
  SELECT o."channelPartnerId", date_trunc('month', o."createdAt") AS m,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0) AS used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT
  cp.id            AS partner_id,
  cp."companyName" AS partner,
  m::date          AS month,
  COUNT(*)         AS accounts,
  COUNT(*) FILTER (WHERE used>=300)   AS engaged,
  COUNT(*) FILTER (WHERE converted)   AS converted
FROM accts a JOIN "ChannelPartner" cp ON cp.id=a."channelPartnerId"
WHERE ($2::text IS NULL OR cp.id = $2::text)
GROUP BY 1,2,3 ORDER BY 2,3 DESC`;

/**
 * A2: Partner health score. $1 = grant scope.
 *
 * DELIBERATE DIVERGENCE from SQL_LIBRARY.sql, re-validated per CLAUDE.md:
 * the library text divides by the full-marks fraction WITHOUT clamping, so a
 * partner at 13% conversion scores "78/30" on a 30-point component and every
 * partner saturates to grade A. ALGORITHMS.md §3 — which "governs intent" —
 * writes every component as `points × min(1, ratio/target)`. This query
 * implements the documented formula; tests/partner-health.test.ts re-validates
 * it against a TypeScript implementation of ALGORITHMS §3 on the fixture.
 */
export const A2_PARTNER_HEALTH = `
WITH base AS (
  SELECT o."channelPartnerId" AS cp_id,
    COUNT(*) AS accounts,
    COUNT(*) FILTER (WHERE u.used >= 300)  AS engaged,
    COUNT(*) FILTER (WHERE u.used = 0)     AS zero_use,
    COUNT(*) FILTER (WHERE u.converted)    AS conv,
    COUNT(*) FILTER (WHERE u.first_use <= o."createdAt" + interval '48 hours') AS fast_start
  FROM "Organization" o
  JOIN LATERAL (
    SELECT
      COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
                WHERE f."organizationId"=o.id),0) AS used,
      (SELECT MIN(f."createdAt") FROM "FreeCreditUsage" f
       WHERE f."organizationId"=o.id) AS first_use,
      EXISTS (SELECT 1 FROM "OrganizationPackage" op
              WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  ) u ON true
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
  GROUP BY 1
),
pts AS (
  SELECT cp_id, accounts,
    ROUND(30.0 * LEAST(1, b.engaged::numeric / NULLIF(b.accounts,0) / 0.50), 1) AS engagement_pts,
    ROUND(30.0 * LEAST(1, b.conv::numeric    / NULLIF(b.accounts,0) / 0.05), 1) AS conversion_pts,
    ROUND(20.0 * LEAST(1, (1 - b.zero_use::numeric / NULLIF(b.accounts,0)) / 0.80), 1) AS zero_use_pts,
    ROUND(20.0 * LEAST(1, b.fast_start::numeric / NULLIF(b.accounts,0) / 0.40), 1) AS velocity_pts
  FROM base b
)
SELECT
  cp.id            AS partner_id,
  cp."companyName" AS partner,
  p.accounts,
  p.engagement_pts, p.conversion_pts, p.zero_use_pts, p.velocity_pts,
  LEAST(100, ROUND(p.engagement_pts + p.conversion_pts + p.zero_use_pts + p.velocity_pts, 0)) AS health_score
FROM pts p JOIN "ChannelPartner" cp ON cp.id = p.cp_id
ORDER BY health_score DESC`;

/** S1: Universal search. $1 = term, $2 = type filter ('all'|'partner'|'org'|'user'). */
export const S1_SEARCH = `
SELECT * FROM (
  SELECT 'PARTNER' AS type, cp.id, cp."companyName" AS name, cp.email, cp.tier AS detail
  FROM "ChannelPartner" cp
  WHERE ($2::text IN ('all','partner'))
    AND (cp."companyName" ILIKE '%' || $1::text || '%'
     OR cp.email ILIKE '%' || $1::text || '%')
  UNION ALL
  SELECT 'ORG', o.id, o.name, o.email, o.industry
  FROM "Organization" o
  WHERE ($2::text IN ('all','org'))
    AND (o.name ILIKE '%' || $1::text || '%'
     OR o.email ILIKE '%' || $1::text || '%')
  UNION ALL
  SELECT 'USER', u.id, u."firstName"||' '||COALESCE(u."lastName",''), u.email, u.status::text
  FROM "User" u
  WHERE ($2::text IN ('all','user'))
    AND (u."firstName" ILIKE '%' || $1::text || '%'
     OR u.email ILIKE '%' || $1::text || '%')
) s
LIMIT 20`;

/** S2: End-user 360. $1 = user id. */
export const S2_USER_360 = `
SELECT
  u.id,
  u."firstName"||' '||COALESCE(u."lastName",'') AS name,
  u.email, u."phoneNumber",
  u."createdAt"::date                            AS signed_up,
  u."isOnboarded",
  u.status                                       AS user_status,
  o.id                                           AS org_id,
  o.name                                         AS organization,
  o.industry, o."companySize",
  o."signupSegment"                              AS segment,
  cp."companyName"                               AS partner,
  l.name                                         AS language,
  (SELECT COUNT(*) FROM "LoginHistory" lh WHERE lh."userId"=u.id)             AS total_logins,
  (SELECT MAX(lh."createdAt") FROM "LoginHistory" lh WHERE lh."userId"=u.id)  AS last_login,
  (SELECT lh.device FROM "LoginHistory" lh WHERE lh."userId"=u.id
    ORDER BY lh."createdAt" DESC LIMIT 1)                                     AS last_device,
  (SELECT COUNT(*) FROM "ChatQuestion" cq WHERE cq."createdBy"=u.id)          AS questions_asked,
  COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f WHERE f."userId"=u.id),0) AS free_credits_used,
  COALESCE((SELECT SUM(ct.credits) FROM "CreditTransaction" ct
            WHERE ct."userId"=u.id AND ct."transactionType" IN ('USAGE','DEBIT')),0) AS paid_credits_used
FROM "User" u
LEFT JOIN "OrganizationUser" ou ON ou."userId"=u.id
LEFT JOIN "Organization" o ON o.id=ou."organizationId"
LEFT JOIN "ChannelPartner" cp ON cp.id=o."channelPartnerId"
LEFT JOIN "Language" l ON l.id = u."preferredLanguageId"
WHERE u.id = $1::text`;

// ############ PPS v0.1 — OFFICE EDITION (CANONICAL) ############

/**
 * PPS_OFFICE — the canonical scorecard. $1 = grant scope, $2 = org id (nullable).
 * Numeric weights below are the SQL expression of config/scoring.ts PPS; the
 * `pps.test.ts` suite asserts the two agree for every fixture account, so a
 * weight change in config that is not mirrored here fails the build.
 */
export const PPS_OFFICE = `
WITH office AS (
  SELECT
    ou."organizationId" AS org_id,
    COUNT(*) FILTER (WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%')          AS office_chats,
    COUNT(DISTINCT ch."chatType") FILTER
      (WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%')                        AS office_apps,
    COUNT(DISTINCT ch."createdAt"::date) FILTER
      (WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%'
         AND ch."createdAt" >= now()-interval '14 days')                      AS office_days_14,
    COUNT(DISTINCT ch."createdBy") FILTER
      (WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%')                        AS office_users,
    MAX(ch."createdAt") FILTER (WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%') AS last_office,
    COUNT(*) FILTER (WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%'
                       AND ch."createdAt" >= now()-interval '7 days')         AS office_7d,
    COUNT(*) FILTER (WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%'
                       AND ch."createdAt" >= now()-interval '14 days'
                       AND ch."createdAt" <  now()-interval '7 days')         AS office_prior7,
    COUNT(*) FILTER (WHERE ch."chatType"::text NOT LIKE 'PUCHO_OFFICE%')      AS non_office_chats,
    BOOL_OR(ch."chatType"::text = 'ORG_KNOWLEDGE')                            AS uses_own_docs,
    COUNT(DISTINCT ch."chatType") FILTER
      (WHERE ch."chatType"::text = 'PUCHO_OFFICE_EXCEL_CHAT')                 AS has_excel,
    COUNT(DISTINCT ch."chatType") FILTER
      (WHERE ch."chatType"::text IN ('PUCHO_OFFICE_WORD_CHAT','PUCHO_OFFICE_POWER_POINT_CHAT')) AS has_word_ppt
  FROM "ChatHistory" ch
  JOIN "OrganizationUser" ou ON ou.id = ch."organizationUserId"
  GROUP BY ou."organizationId"
),
sig AS (
  SELECT
    o.id AS org_id, o.name, o.industry, o."companySize",
    o."createdAt"                                                             AS org_created,
    o."channelPartnerId",
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0)                               AS used_total,
    (SELECT COUNT(DISTINCT f."userId") FROM "FreeCreditUsage" f
      WHERE f."organizationId"=o.id AND f."userId" IS NOT NULL)               AS credit_users,
    EXISTS (SELECT 1 FROM "FreeCreditUsage" f
            WHERE f."organizationId"=o.id AND f."flowId" IS NOT NULL)         AS has_workflow,
    COALESCE(x.office_chats,0)     AS office_chats,
    COALESCE(x.office_apps,0)      AS office_apps,
    COALESCE(x.office_days_14,0)   AS office_days_14,
    COALESCE(x.office_users,0)     AS office_users,
    x.last_office,
    COALESCE(x.office_7d,0)        AS office_7d,
    COALESCE(x.office_prior7,0)    AS office_prior7,
    COALESCE(x.non_office_chats,0) AS non_office_chats,
    COALESCE(x.uses_own_docs,false) AS uses_own_docs,
    COALESCE(x.has_excel,0) > 0    AS has_excel,
    COALESCE(x.has_word_ppt,0) > 0 AS has_word_ppt,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active')            AS converted
  FROM "Organization" o
  LEFT JOIN office x ON x.org_id = o.id
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
    AND ($2::text IS NULL OR o.id = $2::text)
),
scored AS (
  SELECT *,
    LEAST(20, ROUND(used_total / 35.0))                       AS pts_depth,
    LEAST(25, office_days_14 * 4)                             AS pts_office_habit,
    LEAST(12, office_apps * 4)                                AS pts_office_breadth,
    LEAST(10, ROUND(office_chats / 5.0))                      AS pts_office_volume,
    (CASE WHEN uses_own_docs THEN 6 ELSE 0 END
     + CASE WHEN office_users >= 2 THEN 6 ELSE 0 END
     + CASE WHEN has_workflow THEN 3 ELSE 0 END)              AS pts_embed,
    (CASE WHEN office_7d > 0 AND office_7d >= office_prior7 THEN 10
          WHEN office_7d > 0 THEN 4 ELSE 0 END)               AS pts_momentum,
    (CASE WHEN industry IN ('Chemicals','Textiles','Agri inputs','Pharma','Engineering')
               AND "companySize" IN ('51-200','201-500') THEN 8
          WHEN "companySize" IN ('11-50','51-200') THEN 4
          ELSE 0 END)                                         AS pts_firmo,
    (CASE WHEN last_office IS NULL THEN 0
          WHEN last_office < now()-interval '14 days' THEN -20
          WHEN last_office < now()-interval '7 days'  THEN -10
          ELSE 0 END)                                         AS pts_recency,
    (office_chats = 0 AND non_office_chats >= 10)             AS wrong_lane
  FROM sig
),
totals AS (
  SELECT *,
    GREATEST(0, LEAST(100,
      pts_depth + pts_office_habit + pts_office_breadth + pts_office_volume
      + pts_embed + pts_momentum + pts_firmo + pts_recency))  AS pps
  FROM scored
)
SELECT
  org_id, name, industry, "companySize", "channelPartnerId", org_created,
  used_total, credit_users, office_chats, office_apps, office_days_14, office_users,
  office_7d, office_prior7, non_office_chats, last_office, uses_own_docs,
  has_excel, has_word_ppt, has_workflow,
  pts_depth, pts_office_habit, pts_office_breadth, pts_office_volume,
  pts_embed, pts_momentum, pts_firmo, pts_recency,
  wrong_lane,
  pps,
  CASE
    WHEN wrong_lane   THEN 'W'
    WHEN pps >= 70    THEN 'A'
    WHEN pps >= 45    THEN 'B'
    WHEN pps >= 20    THEN 'C'
    ELSE                   'D'
  END AS band,
  converted
FROM totals
ORDER BY pps DESC`;

/** Office aha-finder: Office chat within 48h of signup vs conversion. $1 = grant scope. */
export const AHA_OFFICE_48H = `
WITH sig AS (
  SELECT o.id,
    EXISTS (SELECT 1 FROM "ChatHistory" ch
            JOIN "OrganizationUser" ou ON ou.id = ch."organizationUserId"
            WHERE ou."organizationId" = o.id
              AND ch."chatType"::text LIKE 'PUCHO_OFFICE%'
              AND ch."createdAt" <= o."createdAt" + interval '48 hours') AS office_48h,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT office_48h, COUNT(*) AS accounts,
  ROUND(100.0*COUNT(*) FILTER (WHERE converted)/NULLIF(COUNT(*),0),1) AS conversion_pct
FROM sig GROUP BY 1`;

/** Calibration check — conversion rate per usage quintile. $1 = grant scope. */
export const CALIBRATION_QUINTILES = `
WITH sig AS (
  SELECT o.id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0) AS used_total,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
)
SELECT
  width_bucket(used_total, 0, 1000, 5) AS usage_quintile,
  COUNT(*) AS accounts,
  ROUND(100.0*COUNT(*) FILTER (WHERE converted)/NULLIF(COUNT(*),0),1) AS conversion_pct
FROM sig GROUP BY 1 ORDER BY 1`;

/** Band-movement: climbs into A/B week over week, straight from PropensityLog. */
export const BAND_MOVEMENT = `
WITH snaps AS (
  SELECT "organizationId", "snapshotDate", band,
         LAG(band) OVER (PARTITION BY "organizationId" ORDER BY "snapshotDate") AS prev_band
  FROM "PropensityLog"
  WHERE "snapshotDate" >= current_date - ${win(1)}
)
SELECT "snapshotDate" AS day,
  COUNT(*) FILTER (WHERE band = 'A' AND prev_band IS DISTINCT FROM 'A') AS into_a,
  COUNT(*) FILTER (WHERE band = 'B' AND prev_band IS DISTINCT FROM 'B') AS into_b,
  COUNT(*) FILTER (WHERE band = 'W' AND prev_band IS DISTINCT FROM 'W') AS into_w,
  COUNT(*) FILTER (WHERE prev_band = 'A' AND band <> 'A')               AS out_of_a
FROM snaps
GROUP BY 1 ORDER BY 1`;

// ############ AUDIT ADDITIONS: burn-down, workshop detail, Today view ############

/**
 * BURNDOWN: average cumulative grant credits by day-since-signup, per signup
 * month cohort. The predictive utilization chart — is this month's cohort
 * landing faster than last month's? $1 = grant scope, $2 = max day offset.
 */
export const BURNDOWN = `
WITH grant_orgs AS (
  SELECT o.id, o."createdAt", to_char(date_trunc('month', o."createdAt"), 'Mon YYYY') AS cohort,
         date_trunc('month', o."createdAt") AS cohort_month
  FROM "Organization" o
  WHERE ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
),
days AS (SELECT generate_series(0, $2::int) AS day_offset),
burn AS (
  SELECT g.cohort, g.cohort_month, d.day_offset, g.id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = g.id
                AND f."createdAt" <= g."createdAt" + (d.day_offset || ' days')::interval), 0) AS cum
  FROM grant_orgs g
  CROSS JOIN days d
  WHERE g."createdAt" + (d.day_offset || ' days')::interval <= now()
)
SELECT cohort, day_offset,
  ROUND(AVG(cum), 0)        AS avg_credits,
  COUNT(DISTINCT id)        AS orgs
FROM burn
GROUP BY cohort, cohort_month, day_offset
ORDER BY cohort_month, day_offset`;

/** WORKSHOP_ONE: a single workshop with its funnel row. $1 = workshop id. */
export const WORKSHOP_ONE = `
SELECT w.*, cp."companyName" AS partner
FROM "Workshop" w
LEFT JOIN "ChannelPartner" cp ON cp.id = w."channelPartnerId"
WHERE w.id = $1`;

/**
 * WORKSHOP_ACCOUNTS: every account a workshop produced, with grant burn,
 * latest PPS band, and conversion state. $1 = workshop id.
 */
export const WORKSHOP_ACCOUNTS = `
SELECT
  o.id AS org_id,
  o.name,
  o."createdAt"::date AS joined,
  o.industry, o."companySize",
  COALESCE(f.used, 0) AS credits,
  f.last_active,
  EXISTS (SELECT 1 FROM "FreeCreditUsage" fc
          WHERE fc."organizationId" = o.id
            AND fc."createdAt" <= o."createdAt" + interval '7 days') AS activated_7d,
  (SELECT pl.band FROM "PropensityLog" pl
    WHERE pl."organizationId" = o.id ORDER BY pl."snapshotDate" DESC LIMIT 1) AS band,
  (SELECT pl.pps FROM "PropensityLog" pl
    WHERE pl."organizationId" = o.id ORDER BY pl."snapshotDate" DESC LIMIT 1) AS pps,
  EXISTS (SELECT 1 FROM "OrganizationPackage" op
          WHERE op."organizationId" = o.id AND op.status = 'Active') AS converted
FROM "Organization" o
LEFT JOIN LATERAL (
  SELECT SUM(fc.credits) AS used, MAX(fc."createdAt") AS last_active
  FROM "FreeCreditUsage" fc WHERE fc."organizationId" = o.id
) f ON true
WHERE o."workshopId" = $1
ORDER BY credits DESC`;

/**
 * EXPIRING_GRANTS: active grant wallets expiring inside $2 days with credits
 * still unused — the window where a partner can still act. $1 = grant scope.
 */
export const EXPIRING_GRANTS = `
SELECT o.id AS org_id, o.name, cp."companyName" AS partner,
  cw.allocated, cw.used, cw."expiryDate"::date AS expires,
  ROUND(100.0 * cw.used / NULLIF(cw.allocated, 0), 0) AS util_pct
FROM "CreditWallets" cw
JOIN "Organization" o ON o.id = cw."organizationId"
LEFT JOIN "ChannelPartner" cp ON cp.id = o."channelPartnerId"
WHERE cw."isActive" AND cw.type = 'BONUS' AND cw."expiryDate" IS NOT NULL
  AND cw."expiryDate" BETWEEN now() AND now() + (($2)::text || ' days')::interval
  AND cw.used < cw.allocated
  AND ($1::text IS NULL AND o."channelPartnerId" IS NOT NULL OR o."signupSource" = $1::text)
ORDER BY cw."expiryDate"`;

/** RECENT_WORKSHOPS: the last 72h of workshops with registration counts, for the day-after check. */
export const RECENT_WORKSHOPS = `
SELECT w.id, w."workshopDate", w."segmentName", w.status, w."attendedCount", w."invitedCount",
  cp."companyName" AS partner,
  (SELECT COUNT(*) FROM "Organization" o WHERE o."workshopId" = w.id) AS accounts_created
FROM "Workshop" w
LEFT JOIN "ChannelPartner" cp ON cp.id = w."channelPartnerId"
WHERE w."workshopDate" >= now() - interval '72 hours'
ORDER BY w."workshopDate" DESC`;

/** CONVERSION_BY_BAND: does the score rank-order reality? From the latest snapshot per org. */
export const CONVERSION_BY_BAND = `
WITH latest AS (
  SELECT DISTINCT ON ("organizationId") "organizationId", band
  FROM "PropensityLog" ORDER BY "organizationId", "snapshotDate" DESC)
SELECT l.band,
  COUNT(*) AS accounts,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM "OrganizationPackage" op
     WHERE op."organizationId" = l."organizationId" AND op.status = 'Active')) AS converted,
  ROUND(100.0 * COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM "OrganizationPackage" op
     WHERE op."organizationId" = l."organizationId" AND op.status = 'Active'))
    / NULLIF(COUNT(*), 0), 1) AS conversion_pct
FROM latest l GROUP BY 1 ORDER BY 1`;
