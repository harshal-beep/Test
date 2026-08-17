-- ============================================================
-- PUCHO PULSE — CANONICAL SQL LIBRARY
-- Every query validated against the production schema dump
-- (Postgres 16, pg_dump of 17.4). Identifiers are quoted
-- camelCase exactly as in the Prisma schema.
--
-- Sections:
--   Q1–Q25 : Core dashboard (views 0–4)
--   DDL    : New tables/columns (also in DATA_MODEL.md)
--   G1–G5  : Workshop/GTM funnel      W1: partner weekly digest
--   B1–B6  : 1,000-credit grant benchmark
--   C1, Z1–Z2, P1–P2, A1–A2, S1–S2 : campaign, zero-use aging,
--            profiling, partner deep analytics, search & 360
--   PPS    : Purchase Propensity Score v0.1 (OFFICE EDITION —
--            canonical) + generic v0 (reference) + aha finders
--
-- Scope note: grant queries filter "channelPartnerId" IS NOT NULL.
-- After M1 ships, tighten to "signupSource"='WORKSHOP'.
-- ============================================================

-- ############ Q1–Q25: CORE DASHBOARD ############
-- ============================================================
-- PUCHO ANALYTICS: KPI SQL LIBRARY (validated against schema)
-- ============================================================

-- Q1: Daily credit burn (last 30 days) with 7-day moving average
SELECT
  date_trunc('day', ct."createdAt")::date AS day,
  SUM(ct.credits)                          AS credits_burned,
  COUNT(DISTINCT ct."userId")              AS active_burning_users,
  ROUND(AVG(SUM(ct.credits)) OVER (ORDER BY date_trunc('day', ct."createdAt")::date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS ma_7d
FROM "CreditTransaction" ct
WHERE ct."transactionType" IN ('USAGE','DEBIT')
  AND ct."createdAt" >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1;

-- Q2: Credit burn by feature (chat vs workflow vs agent vs other)
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
  AND ct."createdAt" >= now() - interval '30 days'
GROUP BY 1
ORDER BY credits_burned DESC;

-- Q3: Wallet utilization by organization (allocated vs used, expiry risk)
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
ORDER BY utilization_pct DESC NULLS LAST;

-- Q4: Top 20 credit-consuming users (30 days) with their org and plan
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
  AND ct."createdAt" >= now() - interval '30 days'
GROUP BY 1, 2, 3
ORDER BY credits_30d DESC
LIMIT 20;

-- Q5: MRR proxy — active org subscriptions x package price (normalized monthly)
SELECT
  p.title                                            AS plan,
  COUNT(*)                                           AS active_orgs,
  SUM(CASE op."PayFrequency"
        WHEN 'YEARLY'    THEN COALESCE(p."yearlyPrice", p.price*10)/12.0
        WHEN 'QUARTERLY' THEN p.price          -- adjust if quarterly price differs
        ELSE p.price
      END)                                           AS mrr_inr
FROM "OrganizationPackage" op
JOIN "Package" p ON p.id = op."packageId"
WHERE op.status = 'Active'
  AND (op."endDate" IS NULL OR op."endDate" > now())
GROUP BY p.title
ORDER BY mrr_inr DESC NULLS LAST;

-- Q6: Revenue collected by month (actual payments)
SELECT
  date_trunc('month', pay."paymentDate")::date AS month,
  SUM(pay.amount)                              AS revenue_inr,
  COUNT(*)                                     AS payments,
  COUNT(DISTINCT pay."organizationId")         AS paying_orgs
FROM "Payment" pay
WHERE pay."paymentStatus" IN ('COMPLETED','PAID')
GROUP BY 1
ORDER BY 1;

-- Q7: Free vs paid credit consumption (30 days)
SELECT 'Paid/Wallet credits' AS source, SUM(credits) AS credits
FROM "CreditTransaction"
WHERE "transactionType" IN ('USAGE','DEBIT') AND "createdAt" >= now() - interval '30 days'
UNION ALL
SELECT 'Free credits', SUM(credits)
FROM "FreeCreditUsage"
WHERE "createdAt" >= now() - interval '30 days';

-- Q8: Signups per week + activation (onboarded + asked >= 1 question in 7 days)
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
LIMIT 12;

-- Q9: DAU / WAU / MAU (activity = asked a question, ran a txn, or logged in)
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
FROM activity;

-- Q10: Monthly retention cohorts (signup month vs months active)
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
LIMIT 12;

-- Q11: Feature adoption by chat type (30 days)
SELECT
  ch."chatType",
  COUNT(DISTINCT ch.id)          AS chats,
  COUNT(cq.id)                   AS questions,
  COUNT(DISTINCT cq."createdBy") AS unique_users
FROM "ChatHistory" ch
LEFT JOIN "ChatQuestion" cq ON cq."chatHistoryId" = ch.id
WHERE ch."createdAt" >= now() - interval '30 days'
GROUP BY 1
ORDER BY questions DESC;

-- Q12: Pro Search / Deep Research / file-upload usage (30 days)
SELECT
  COUNT(*)                                        AS total_questions,
  COUNT(*) FILTER (WHERE "isProSearch")           AS pro_search,
  COUNT(*) FILTER (WHERE "isDeepResearch")        AS deep_research,
  COUNT(*) FILTER (WHERE "isFile")                AS with_files,
  COUNT(*) FILTER (WHERE "isMobile")              AS from_mobile
FROM "ChatQuestion"
WHERE "createdAt" >= now() - interval '30 days';

-- Q13: Voice agent usage by org (30 days)
SELECT
  o.name                                   AS organization,
  COUNT(*)                                 AS calls,
  SUM(c."durationSec")                     AS total_seconds,
  ROUND(SUM(c."durationSec")/60.0, 1)      AS total_minutes,
  COUNT(*) FILTER (WHERE c."callStatus" = 'completed') AS completed_calls
FROM "Calls" c
JOIN "Organization" o ON o.id = c."orgId"
WHERE c."createdAt" >= now() - interval '30 days'
GROUP BY 1
ORDER BY total_minutes DESC NULLS LAST;

-- Q14: Dormant risk — paying orgs with falling usage (this 30d vs prior 30d)
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
ORDER BY credits_prior_30d DESC;

-- Q15: Seat utilization per org (users active vs seats bought)
SELECT
  o.name,
  op."numberOfUser"                       AS seats_bought,
  COUNT(DISTINCT ou."userId")             AS seats_assigned,
  COUNT(DISTINCT lh."userId") FILTER (WHERE lh."createdAt" >= now() - interval '30 days') AS seats_active_30d,
  ROUND(100.0 * COUNT(DISTINCT lh."userId") FILTER (WHERE lh."createdAt" >= now() - interval '30 days')
       / NULLIF(op."numberOfUser",0), 1)  AS active_seat_pct
FROM "OrganizationPackage" op
JOIN "Organization" o ON o.id = op."organizationId"
LEFT JOIN "OrganizationUser" ou ON ou."organizationId" = o.id AND ou.status = 'Active'
LEFT JOIN "LoginHistory" lh ON lh."orgId" = o.id
WHERE op.status = 'Active'
GROUP BY o.name, op."numberOfUser"
ORDER BY active_seat_pct ASC NULLS FIRST;

-- Q16: Channel partner scorecard
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
      AND ct."createdAt" >= now() - interval '30 days'
WHERE cp.status = 'Active'
GROUP BY cp."companyName", cp.tier
ORDER BY credits_burned_30d DESC;

-- Q17: Waitlist -> signup conversion
SELECT
  COUNT(*)                                          AS waitlist_total,
  COUNT(u.id)                                       AS converted_to_user,
  ROUND(100.0 * COUNT(u.id) / NULLIF(COUNT(*),0),1) AS conversion_pct
FROM "WaitlistUser" w
LEFT JOIN "User" u ON lower(u.email) = lower(w.email);

-- Q18: SDR / campaign funnel (lead status distribution)
SELECT
  cl.status,
  COUNT(*) AS leads,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (),0), 1) AS pct
FROM "CampaignLead" cl
GROUP BY cl.status
ORDER BY leads DESC;

-- Q19: Contact-sales pipeline by month and company size
SELECT
  date_trunc('month', "createdAt")::date AS month,
  "companySize",
  COUNT(*) AS enquiries
FROM "ContactSales"
GROUP BY 1, 2
ORDER BY 1 DESC, enquiries DESC;

-- Q20: Credit usage errors per day (billing health)
SELECT
  date_trunc('day', "createdAt")::date AS day,
  COUNT(*) AS errors,
  COUNT(DISTINCT "userId") AS affected_users
FROM "CreditUsageError"
WHERE "createdAt" >= now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Q21: Failed / pending payments needing follow-up
SELECT
  o.name, pay.amount, pay."paymentMethod", pay."paymentStatus", pay."paymentDate"
FROM "Payment" pay
JOIN "Organization" o ON o.id = pay."organizationId"
WHERE pay."paymentStatus" IN ('FAILED','PENDING','PROCESSING')
ORDER BY pay."paymentDate" DESC
LIMIT 50;

-- Q22: Plan upgrades / downgrades trend
SELECT
  date_trunc('month', su."createdAt")::date AS month,
  su."upgradeStatus",
  COUNT(*) AS upgrades
FROM "SubscriptionUpgrade" su
GROUP BY 1, 2
ORDER BY 1 DESC;

-- Q23: Login patterns — device and OS split (30 days)
SELECT
  COALESCE(device, 'Unknown') AS device,
  COALESCE(os, 'Unknown')     AS os,
  COUNT(*)                    AS logins,
  COUNT(DISTINCT "userId")    AS users
FROM "LoginHistory"
WHERE "createdAt" >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY logins DESC
LIMIT 15;

-- Q24: Workflow (Studio) leaderboard — which flows burn most credits
SELECT
  ct."flowName",
  COUNT(DISTINCT ct."runId")   AS runs,
  SUM(ct.credits)              AS credits,
  COUNT(DISTINCT ct."userId")  AS users
FROM "CreditTransaction" ct
WHERE ct."flowId" IS NOT NULL
  AND ct."transactionType" IN ('USAGE','DEBIT')
  AND ct."createdAt" >= now() - interval '30 days'
GROUP BY ct."flowName"
ORDER BY credits DESC
LIMIT 20;

-- Q25: Org-level 360 (one row per org for the drill-down table)
SELECT
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
ORDER BY credits_used DESC NULLS LAST;

-- ############ GTM DDL + G1–G5, W1 ############
-- ============ GTM ADDITIONS: DDL ============
CREATE TABLE IF NOT EXISTS "Workshop" (
    id text PRIMARY KEY,
    "workshopDate" timestamp(3) NOT NULL,
    "segmentName" text NOT NULL,
    "channelPartnerId" text REFERENCES "ChannelPartner"(id),
    "deliveredBy" text,
    "invitedCount" integer DEFAULT 0,
    "attendedCount" integer DEFAULT 0,
    status text DEFAULT 'SCHEDULED',
    "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "workshopId" text;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "signupSegment" text;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "signupSource" text;

-- ============ G1: Workshop funnel (one row per workshop) ============
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
  w."workshopDate"::date                                    AS date,
  w."segmentName"                                           AS segment,
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
GROUP BY w.id, w."workshopDate", w."segmentName", cp."companyName",
         w."invitedCount", w."attendedCount"
ORDER BY w."workshopDate" DESC;

-- ============ G2: Segment scoreboard (kill/double-down decisions) ============
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
ORDER BY conversion_pct DESC NULLS LAST, engaged_pct DESC;

-- ============ G3: Hot accounts for next-day partner follow-up ============
SELECT
  o.name                                        AS organization,
  cp."companyName"                              AS partner,
  o."signupSegment"                             AS segment,
  SUM(f.credits)                                AS free_credits_used,
  ROUND(100.0 * SUM(f.credits) / 1000, 0)       AS pct_of_free_quota,
  MAX(f."createdAt")                            AS last_active
FROM "Organization" o
JOIN "FreeCreditUsage" f ON f."organizationId" = o.id
LEFT JOIN "ChannelPartner" cp ON cp.id = o."channelPartnerId"
WHERE o."signupSource" = 'WORKSHOP'
  AND NOT EXISTS (SELECT 1 FROM "OrganizationPackage" op
                  WHERE op."organizationId" = o.id AND op.status = 'Active')
GROUP BY o.id, o.name, cp."companyName", o."signupSegment"
HAVING SUM(f.credits) >= 700
ORDER BY free_credits_used DESC;

-- ============ G4: Stalled accounts (created but not landing) ============
SELECT
  o.name, cp."companyName" AS partner, o."signupSegment" AS segment,
  o."createdAt"::date AS created,
  COALESCE(SUM(f.credits),0) AS free_credits_used
FROM "Organization" o
LEFT JOIN "FreeCreditUsage" f ON f."organizationId" = o.id
LEFT JOIN "ChannelPartner" cp ON cp.id = o."channelPartnerId"
WHERE o."signupSource" = 'WORKSHOP'
  AND o."createdAt" <= now() - interval '14 days'
GROUP BY o.id, o.name, cp."companyName", o."signupSegment", o."createdAt"
HAVING COALESCE(SUM(f.credits),0) < 100
ORDER BY o."createdAt";

-- ============ G5: September GTM economics rollup ============
WITH gtm AS (
  SELECT o.id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f WHERE f."organizationId"=o.id),0) AS free_used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op WHERE op."organizationId"=o.id AND op.status='Active') AS converted,
    (SELECT COALESCE(SUM(p.amount),0) FROM "Payment" p
      WHERE p."organizationId"=o.id AND p."paymentStatus" IN ('COMPLETED','PAID')) AS revenue
  FROM "Organization" o WHERE o."signupSource"='WORKSHOP'
)
SELECT
  COUNT(*)                                   AS accounts,
  SUM(free_used)                             AS free_credits_consumed,
  ROUND(SUM(free_used) * 0.30, 0)            AS credit_cost_inr,
  COUNT(*) FILTER (WHERE converted)          AS conversions,
  SUM(revenue)                               AS revenue_collected_inr,
  ROUND(SUM(revenue) / NULLIF(SUM(free_used)*0.30, 0), 2) AS revenue_per_credit_rupee
FROM gtm;

-- ============ W1: Weekly partner WhatsApp report (one row per partner) ============
WITH accts AS (
  SELECT o.id, o."channelPartnerId", o.name,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f WHERE f."organizationId"=o.id),0) AS used,
    o."createdAt" >= now() - interval '7 days' AS is_new,
    EXISTS (SELECT 1 FROM "FreeCreditUsage" f WHERE f."organizationId"=o.id
            AND f."createdAt" >= now() - interval '7 days') AS active_this_week,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op WHERE op."organizationId"=o.id
            AND op.status='Active') AS converted
  FROM "Organization" o
  WHERE o."signupSource"='WORKSHOP' AND o."channelPartnerId" IS NOT NULL
)
SELECT
  cp."companyName"                                    AS partner,
  COUNT(*) FILTER (WHERE is_new)                      AS new_accounts_7d,
  COUNT(*) FILTER (WHERE active_this_week)            AS active_this_week,
  COUNT(*) FILTER (WHERE used >= 700 AND NOT converted) AS hot_leads,
  COUNT(*) FILTER (WHERE used < 100)                  AS stalled,
  COUNT(*) FILTER (WHERE converted)                   AS total_converted
FROM accts a
JOIN "ChannelPartner" cp ON cp.id = a."channelPartnerId"
GROUP BY cp."companyName"
ORDER BY hot_leads DESC;

-- ############ B1–B6: CREDIT GRANT BENCHMARK ############
-- ============================================================
-- 1,000-CREDIT GRANT BENCHMARK QUERIES
-- Scope: orgs that received the free grant via channel partners
-- (signupSource='WORKSHOP' or channelPartnerId set + free credits issued)
-- ============================================================

-- B1: THE MONEY CHART — conversion rate by credit-usage band
WITH grant_orgs AS (
  SELECT o.id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = o.id), 0) AS used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId" = o.id AND op.status = 'Active') AS converted
  FROM "Organization" o
  WHERE o."channelPartnerId" IS NOT NULL
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
ORDER BY 1;

-- B2: BURN CURVE — median days to reach each milestone
WITH daily_cum AS (
  SELECT
    f."organizationId" AS org_id,
    o."createdAt"      AS org_created,
    f."createdAt",
    SUM(f.credits) OVER (PARTITION BY f."organizationId"
                         ORDER BY f."createdAt") AS cum_credits
  FROM "FreeCreditUsage" f
  JOIN "Organization" o ON o.id = f."organizationId"
  WHERE o."channelPartnerId" IS NOT NULL
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
FROM milestones;

-- B3: WHAT THE FREE CREDITS BUY — feature mix + conversion by dominant feature
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
  WHERE o."channelPartnerId" IS NOT NULL
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
ORDER BY conversion_pct DESC;

-- B4: PARTNER BENCHMARK — same grant, different outcomes
WITH grant_orgs AS (
  SELECT o.id, o."channelPartnerId",
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = o.id), 0) AS used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId" = o.id AND op.status = 'Active') AS converted
  FROM "Organization" o
  WHERE o."channelPartnerId" IS NOT NULL
)
SELECT
  cp."companyName"                                       AS partner,
  COUNT(*)                                               AS accounts,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY g.used)::numeric, 0) AS median_credits_used,
  ROUND(100.0 * COUNT(*) FILTER (WHERE g.used >= 300) / NULLIF(COUNT(*),0), 1) AS engaged_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE g.used >= 1000) / NULLIF(COUNT(*),0), 1) AS exhausted_pct,
  COUNT(*) FILTER (WHERE g.converted)                    AS conversions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE g.converted) / NULLIF(COUNT(*),0), 1) AS conversion_pct,
  ROUND(SUM(g.used) * 0.30 / NULLIF(COUNT(*) FILTER (WHERE g.converted), 0), 0) AS credit_cost_per_conversion_inr
FROM grant_orgs g
JOIN "ChannelPartner" cp ON cp.id = g."channelPartnerId"
GROUP BY cp."companyName"
ORDER BY conversion_pct DESC;

-- B5: IS 1,000 THE RIGHT NUMBER? — credits consumed at moment of conversion
WITH conv AS (
  SELECT o.id AS org_id, MIN(op."startDate") AS converted_at
  FROM "Organization" o
  JOIN "OrganizationPackage" op ON op."organizationId" = o.id
  WHERE o."channelPartnerId" IS NOT NULL AND op."startDate" IS NOT NULL
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
) x;

-- B6: GRANT WASTE — credits issued vs consumed (the leak)
SELECT
  COUNT(*)                                        AS grant_accounts,
  COUNT(*) * 1000                                 AS credits_issued,
  SUM(used)                                       AS credits_consumed,
  ROUND(100.0 * SUM(used) / NULLIF(COUNT(*)*1000, 0), 1) AS utilization_pct,
  ROUND((COUNT(*)*1000 - SUM(used)) * 0.30, 0)    AS unused_value_inr
FROM (
  SELECT o.id,
    LEAST(1000, COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId" = o.id), 0)) AS used
  FROM "Organization" o
  WHERE o."channelPartnerId" IS NOT NULL
) g;

-- ############ C1, Z1–Z2, P1–P2, A1–A2, S1–S2 ############
-- ============================================================
-- ADVANCED: campaign tagging, zero-use aging, user profiling,
-- partner deep analytics. Validated on Pucho schema + GTM DDL.
-- ============================================================

-- DDL: campaign tag for web-workshop campaigns
ALTER TABLE "Workshop" ADD COLUMN IF NOT EXISTS "campaignTag" text;
CREATE INDEX IF NOT EXISTS idx_org_workshop ON "Organization"("workshopId");
CREATE INDEX IF NOT EXISTS idx_org_partner  ON "Organization"("channelPartnerId");
CREATE INDEX IF NOT EXISTS idx_fcu_org      ON "FreeCreditUsage"("organizationId");

-- C1: Campaign performance (all workshops under one campaign tag)
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
GROUP BY 1 ORDER BY conversion_pct DESC NULLS LAST;

-- Z1: ZERO-UTILIZATION AGING — signed up via partner, never used a credit
WITH grant_orgs AS (
  SELECT o.id, o.name, o."createdAt", o."channelPartnerId",
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0) AS used
  FROM "Organization" o
  WHERE o."channelPartnerId" IS NOT NULL
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
ORDER BY zero_use_pct DESC;

-- Z2: Time to first credit use (activation latency) per signup week
WITH firstuse AS (
  SELECT o.id, o."createdAt" AS signup,
    (SELECT MIN(f."createdAt") FROM "FreeCreditUsage" f
     WHERE f."organizationId"=o.id) AS first_use
  FROM "Organization" o
  WHERE o."channelPartnerId" IS NOT NULL
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
GROUP BY 1 ORDER BY 1 DESC;

-- P1: END-USER PROFILE vs BEHAVIOR — org industry & size
WITH grant_orgs AS (
  SELECT o.id, o.industry, o."companySize",
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0) AS used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Organization" o WHERE o."channelPartnerId" IS NOT NULL
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
ORDER BY conversion_pct DESC;

-- P2: End-user behavioral profile (device, language, mobile share) vs engagement
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
  WHERE o."channelPartnerId" IS NOT NULL
)
SELECT
  COALESCE(last_device,'Never logged in')  AS device,
  COALESCE(language,'?')                   AS language,
  COUNT(*)                                 AS users,
  ROUND(AVG(user_credits),0)               AS avg_credits,
  COUNT(*) FILTER (WHERE user_credits=0)   AS zero_use
FROM grant_users
GROUP BY 1,2
ORDER BY users DESC;

-- A1: PARTNER MONTHLY TREND — accounts, engagement, conversions by month
WITH accts AS (
  SELECT o."channelPartnerId", date_trunc('month', o."createdAt") AS m,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0) AS used,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Organization" o WHERE o."channelPartnerId" IS NOT NULL
)
SELECT
  cp."companyName" AS partner,
  m::date          AS month,
  COUNT(*)         AS accounts,
  COUNT(*) FILTER (WHERE used>=300)   AS engaged,
  COUNT(*) FILTER (WHERE converted)   AS converted
FROM accts a JOIN "ChannelPartner" cp ON cp.id=a."channelPartnerId"
GROUP BY 1,2 ORDER BY 1,2 DESC;

-- A2: PARTNER HEALTH SCORE (0-100 composite)
-- 30 pts engagement quality + 30 pts conversion + 20 pts zero-use control + 20 pts velocity
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
  WHERE o."channelPartnerId" IS NOT NULL
  GROUP BY 1
)
SELECT
  cp."companyName" AS partner,
  b.accounts,
  ROUND(30.0 * b.engaged   / NULLIF(b.accounts,0) / 0.50, 1) AS engagement_pts,   -- full marks at 50% engaged
  ROUND(30.0 * b.conv      / NULLIF(b.accounts,0) / 0.05, 1) AS conversion_pts,   -- full marks at 5% conversion
  ROUND(20.0 * (1 - b.zero_use::numeric / NULLIF(b.accounts,0)) / 0.80, 1) AS zero_use_pts, -- full marks at <=20% zero-use
  ROUND(20.0 * b.fast_start/ NULLIF(b.accounts,0) / 0.40, 1) AS velocity_pts,     -- full marks at 40% using within 48h
  LEAST(100, ROUND(
      30.0 * b.engaged / NULLIF(b.accounts,0) / 0.50
    + 30.0 * b.conv    / NULLIF(b.accounts,0) / 0.05
    + 20.0 * (1 - b.zero_use::numeric / NULLIF(b.accounts,0)) / 0.80
    + 20.0 * b.fast_start / NULLIF(b.accounts,0) / 0.40, 0)) AS health_score
FROM base b JOIN "ChannelPartner" cp ON cp.id = b.cp_id
ORDER BY health_score DESC;

-- S1: UNIVERSAL SEARCH — partners + end users + orgs in one query (backs the search UI)
SELECT 'PARTNER' AS type, cp.id, cp."companyName" AS name, cp.email, cp.tier AS detail
FROM "ChannelPartner" cp
WHERE cp."companyName" ILIKE '%' || 'search_term' || '%'
   OR cp.email ILIKE '%' || 'search_term' || '%'
UNION ALL
SELECT 'ORG', o.id, o.name, o.email, o.industry
FROM "Organization" o
WHERE o.name ILIKE '%' || 'search_term' || '%'
   OR o.email ILIKE '%' || 'search_term' || '%'
UNION ALL
SELECT 'USER', u.id, u."firstName"||' '||COALESCE(u."lastName",''), u.email, u.status::text
FROM "User" u
WHERE u."firstName" ILIKE '%' || 'search_term' || '%'
   OR u.email ILIKE '%' || 'search_term' || '%'
LIMIT 20;

-- S2: END-USER 360 (one user id -> full behavior profile)
SELECT
  u."firstName"||' '||COALESCE(u."lastName",'') AS name,
  u.email, u."phoneNumber",
  u."createdAt"::date                            AS signed_up,
  u."isOnboarded",
  o.name                                         AS organization,
  o.industry, o."companySize",
  cp."companyName"                               AS partner,
  (SELECT COUNT(*) FROM "LoginHistory" lh WHERE lh."userId"=u.id)             AS total_logins,
  (SELECT MAX(lh."createdAt") FROM "LoginHistory" lh WHERE lh."userId"=u.id)  AS last_login,
  (SELECT COUNT(*) FROM "ChatQuestion" cq WHERE cq."createdBy"=u.id)          AS questions_asked,
  COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f WHERE f."userId"=u.id),0) AS free_credits_used,
  COALESCE((SELECT SUM(ct.credits) FROM "CreditTransaction" ct
            WHERE ct."userId"=u.id AND ct."transactionType" IN ('USAGE','DEBIT')),0) AS paid_credits_used
FROM "User" u
LEFT JOIN "OrganizationUser" ou ON ou."userId"=u.id
LEFT JOIN "Organization" o ON o.id=ou."organizationId"
LEFT JOIN "ChannelPartner" cp ON cp.id=o."channelPartnerId"
WHERE u.id = 'some_user_id';

-- ############ PPS v0.1 — OFFICE EDITION (CANONICAL) ############
-- ============================================================
-- PPS v0.1 — PUCHO OFFICE EDITION
-- The September workshops sell Pucho Office, so Office behavior
-- IS the score. Generic chat usage without Office = wrong lane.
-- ============================================================

WITH office AS (
  -- per-org office activity, from ChatHistory joined through OrganizationUser
  SELECT
    ou."organizationId" AS org_id,
    COUNT(*) FILTER (WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%')          AS office_chats,
    COUNT(DISTINCT ch."chatType") FILTER
      (WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%')                        AS office_apps,       -- Excel/Word/PPT breadth
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
    BOOL_OR(ch."chatType"::text = 'ORG_KNOWLEDGE')                            AS uses_own_docs
  FROM "ChatHistory" ch
  JOIN "OrganizationUser" ou ON ou.id = ch."organizationUserId"
  GROUP BY ou."organizationId"
),
sig AS (
  SELECT
    o.id AS org_id, o.name, o.industry, o."companySize",
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0)                               AS used_total,
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
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active')            AS converted
  FROM "Organization" o
  LEFT JOIN office x ON x.org_id = o.id
  WHERE o."channelPartnerId" IS NOT NULL
),
scored AS (
  SELECT *,
    LEAST(20, ROUND(used_total / 35.0))                       AS pts_depth,        -- 0-20, full at 700
    LEAST(25, office_days_14 * 4)                             AS pts_office_habit, -- 0-25, full at ~6 days: THE signal
    LEAST(12, office_apps * 4)                                AS pts_office_breadth, -- Excel+Word+PPT
    LEAST(10, ROUND(office_chats / 5.0))                      AS pts_office_volume,  -- full at 50 office chats
    (CASE WHEN uses_own_docs THEN 6 ELSE 0 END
     + CASE WHEN office_users >= 2 THEN 6 ELSE 0 END
     + CASE WHEN has_workflow THEN 3 ELSE 0 END)              AS pts_embed,          -- 0-15
    (CASE WHEN office_7d > 0 AND office_7d >= office_prior7 THEN 10
          WHEN office_7d > 0 THEN 4 ELSE 0 END)               AS pts_momentum,       -- 0-10
    (CASE WHEN industry IN ('Chemicals','Textiles','Agri inputs','Pharma','Engineering')
               AND "companySize" IN ('51-200','201-500') THEN 8
          WHEN "companySize" IN ('11-50','51-200') THEN 4
          ELSE 0 END)                                         AS pts_firmo,          -- 0-8
    (CASE WHEN last_office IS NULL THEN 0
          WHEN last_office < now()-interval '14 days' THEN -20
          WHEN last_office < now()-interval '7 days'  THEN -10
          ELSE 0 END)                                         AS pts_recency,
    -- WRONG-LANE FLAG: busy in chat, absent in Office = workshop goal missed
    (office_chats = 0 AND non_office_chats >= 10)             AS wrong_lane
  FROM sig
)
SELECT
  name, industry, "companySize",
  used_total, office_chats, office_apps, office_days_14, office_users,
  pts_depth, pts_office_habit, pts_office_breadth, pts_office_volume,
  pts_embed, pts_momentum, pts_firmo, pts_recency,
  wrong_lane,
  GREATEST(0, LEAST(100,
    pts_depth + pts_office_habit + pts_office_breadth + pts_office_volume
    + pts_embed + pts_momentum + pts_firmo + pts_recency))    AS pps,
  CASE
    WHEN wrong_lane THEN 'W — wrong lane (re-demo Office)'
    WHEN GREATEST(0, LEAST(100, pts_depth+pts_office_habit+pts_office_breadth+pts_office_volume+pts_embed+pts_momentum+pts_firmo+pts_recency)) >= 70 THEN 'A — close now'
    WHEN GREATEST(0, LEAST(100, pts_depth+pts_office_habit+pts_office_breadth+pts_office_volume+pts_embed+pts_momentum+pts_firmo+pts_recency)) >= 45 THEN 'B — push to aha'
    WHEN GREATEST(0, LEAST(100, pts_depth+pts_office_habit+pts_office_breadth+pts_office_volume+pts_embed+pts_momentum+pts_firmo+pts_recency)) >= 20 THEN 'C — re-onboard'
    ELSE 'D — recycle'
  END AS band,
  converted
FROM scored
ORDER BY pps DESC;

-- OFFICE AHA-FINDER: office chat on own file within 48h of signup
WITH sig AS (
  SELECT o.id,
    EXISTS (SELECT 1 FROM "ChatHistory" ch
            JOIN "OrganizationUser" ou ON ou.id = ch."organizationUserId"
            WHERE ou."organizationId" = o.id
              AND ch."chatType"::text LIKE 'PUCHO_OFFICE%'
              AND ch."createdAt" <= o."createdAt" + interval '48 hours') AS office_48h,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Organization" o WHERE o."channelPartnerId" IS NOT NULL
)
SELECT office_48h, COUNT(*) AS accounts,
  ROUND(100.0*COUNT(*) FILTER (WHERE converted)/NULLIF(COUNT(*),0),1) AS conversion_pct
FROM sig GROUP BY 1;

-- ############ PPS v0 — GENERIC (REFERENCE ONLY) + CALIBRATION + AHA FINDER ############
-- ============================================================
-- PPS v0: PUCHO PURCHASE PROPENSITY SCORE (0–100), pure SQL
-- One row per grant account, scored live from usage patterns.
-- ============================================================

WITH sig AS (
  SELECT
    o.id            AS org_id,
    o.name,
    o.industry,
    o."companySize",
    o."createdAt",
    o."channelPartnerId",
    -- DEPTH: total grant credits consumed
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0)                          AS used_total,
    -- MOMENTUM: last 7d vs the 7d before
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id
                AND f."createdAt" >= now()-interval '7 days'),0)         AS used_7d,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id
                AND f."createdAt" >= now()-interval '14 days'
                AND f."createdAt" <  now()-interval '7 days'),0)         AS used_prior7,
    -- RECENCY
    (SELECT MAX(f."createdAt") FROM "FreeCreditUsage" f
     WHERE f."organizationId"=o.id)                                      AS last_activity,
    -- HABIT: distinct active days in last 14
    (SELECT COUNT(DISTINCT f."createdAt"::date) FROM "FreeCreditUsage" f
     WHERE f."organizationId"=o.id
       AND f."createdAt" >= now()-interval '14 days')                    AS active_days_14,
    -- TEAM ADOPTION: distinct users consuming credits
    (SELECT COUNT(DISTINCT f."userId") FROM "FreeCreditUsage" f
     WHERE f."organizationId"=o.id AND f."userId" IS NOT NULL)           AS distinct_users,
    -- BREADTH: distinct feature families touched
    (SELECT COUNT(DISTINCT CASE
        WHEN f."flowId" IS NOT NULL THEN 'workflow'
        WHEN f.type ILIKE '%voice%' OR f.type ILIKE '%call%' THEN 'voice'
        WHEN f.type ILIKE '%agent%' THEN 'agent'
        ELSE 'chat' END)
     FROM "FreeCreditUsage" f WHERE f."organizationId"=o.id)             AS feature_breadth,
    -- EMBEDDING: ran a workflow at all (highest-intent single signal)
    EXISTS (SELECT 1 FROM "FreeCreditUsage" f
            WHERE f."organizationId"=o.id AND f."flowId" IS NOT NULL)    AS has_workflow,
    -- EMBEDDING: used Pucho Office (Excel/Word/PPT chats)
    EXISTS (SELECT 1 FROM "ChatHistory" ch
            JOIN "OrganizationUser" ou ON ou.id = ch."organizationUserId"
            WHERE ou."organizationId" = o.id
              AND ch."chatType"::text LIKE 'PUCHO_OFFICE%')              AS uses_office,
    -- EMBEDDING: gave Pucho their own documents (RAG = trust + setup effort)
    EXISTS (SELECT 1 FROM "ChatHistory" ch
            JOIN "OrganizationUser" ou ON ou.id = ch."organizationUserId"
            WHERE ou."organizationId" = o.id
              AND ch."chatType"::text = 'ORG_KNOWLEDGE')                 AS uses_own_docs,
    -- OUTCOME (for calibration; excluded from the live call list)
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active')       AS converted
  FROM "Organization" o
  WHERE o."channelPartnerId" IS NOT NULL
),
scored AS (
  SELECT *,
    -- DEPTH: 0–25 pts, full marks at 700 credits
    LEAST(25, ROUND(used_total / 28.0))                                   AS pts_depth,
    -- HABIT: 0–12 pts, 2 per active day, full at 6 days of 14
    LEAST(12, active_days_14 * 2)                                         AS pts_habit,
    -- BREADTH: 0–12 pts, 4 per feature family
    LEAST(12, feature_breadth * 4)                                        AS pts_breadth,
    -- EMBEDDING: workflow 8 + own docs 5 + office 3 + multi-user 5 = 0–21
    (CASE WHEN has_workflow THEN 8 ELSE 0 END
     + CASE WHEN uses_own_docs THEN 5 ELSE 0 END
     + CASE WHEN uses_office THEN 3 ELSE 0 END
     + CASE WHEN distinct_users >= 2 THEN 5 ELSE 0 END)                   AS pts_embed,
    -- MOMENTUM: 0–10
    (CASE
       WHEN used_7d > 0 AND used_7d >= used_prior7 THEN 10   -- rising or steady
       WHEN used_7d > 0                            THEN 4    -- active but decaying
       ELSE 0 END)                                                        AS pts_momentum,
    -- FIRMOGRAPHIC PRIOR: 0–8 (replace with empirical P1 rates monthly)
    (CASE
       WHEN industry IN ('Chemicals','Textiles','Agri inputs','Pharma','Engineering')
            AND "companySize" IN ('51-200','201-500') THEN 8
       WHEN "companySize" IN ('11-50','51-200')       THEN 4
       ELSE 0 END)                                                        AS pts_firmo,
    -- RECENCY PENALTY
    (CASE
       WHEN last_activity IS NULL                          THEN 0
       WHEN last_activity < now() - interval '14 days'     THEN -20
       WHEN last_activity < now() - interval '7 days'      THEN -10
       ELSE 0 END)                                                        AS pts_recency
  FROM sig
)
SELECT
  name, industry, "companySize",
  used_total, active_days_14, feature_breadth, distinct_users,
  has_workflow, uses_office, uses_own_docs,
  pts_depth, pts_habit, pts_breadth, pts_embed, pts_momentum, pts_firmo, pts_recency,
  GREATEST(0, LEAST(100,
    pts_depth + pts_habit + pts_breadth + pts_embed
    + pts_momentum + pts_firmo + pts_recency))                            AS pps,
  CASE
    WHEN GREATEST(0, LEAST(100, pts_depth+pts_habit+pts_breadth+pts_embed+pts_momentum+pts_firmo+pts_recency)) >= 70 THEN 'A — close now'
    WHEN GREATEST(0, LEAST(100, pts_depth+pts_habit+pts_breadth+pts_embed+pts_momentum+pts_firmo+pts_recency)) >= 45 THEN 'B — push to aha'
    WHEN GREATEST(0, LEAST(100, pts_depth+pts_habit+pts_breadth+pts_embed+pts_momentum+pts_firmo+pts_recency)) >= 20 THEN 'C — re-onboard'
    ELSE 'D — recycle'
  END                                                                     AS band,
  converted
FROM scored
ORDER BY pps DESC;

-- ============================================================
-- CALIBRATION CHECK (run monthly once conversions accrue):
-- does the score rank-order reality? Conversion rate per band.
-- ============================================================
WITH sig AS (
  SELECT o.id,
    COALESCE((SELECT SUM(f.credits) FROM "FreeCreditUsage" f
              WHERE f."organizationId"=o.id),0) AS used_total,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Organization" o WHERE o."channelPartnerId" IS NOT NULL
)
SELECT
  width_bucket(used_total, 0, 1000, 5) AS usage_quintile,
  COUNT(*) AS accounts,
  ROUND(100.0*COUNT(*) FILTER (WHERE converted)/NULLIF(COUNT(*),0),1) AS conversion_pct
FROM sig GROUP BY 1 ORDER BY 1;

-- ============================================================
-- AHA-MOMENT FINDER: which single event best separates buyers?
-- Run for each candidate event; highest lift wins.
-- ============================================================
WITH sig AS (
  SELECT o.id,
    EXISTS (SELECT 1 FROM "FreeCreditUsage" f
            WHERE f."organizationId"=o.id AND f."flowId" IS NOT NULL
              AND f."createdAt" <= o."createdAt" + interval '7 days') AS event_wf_week1,
    EXISTS (SELECT 1 FROM "OrganizationPackage" op
            WHERE op."organizationId"=o.id AND op.status='Active') AS converted
  FROM "Organization" o WHERE o."channelPartnerId" IS NOT NULL
)
SELECT
  event_wf_week1                                     AS did_event,
  COUNT(*)                                           AS accounts,
  ROUND(100.0*COUNT(*) FILTER (WHERE converted)/NULLIF(COUNT(*),0),1) AS conversion_pct
FROM sig GROUP BY 1;
