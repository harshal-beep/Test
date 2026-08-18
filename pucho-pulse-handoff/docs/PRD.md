# PRD — Pucho Pulse: Analytics, GTM Tracking & Purchase Propensity Platform

**Version:** 1.0 · 17 Aug 2026
**Owner:** Harshal Gohil (Pucho.ai)
**Status:** Approved for build

---

## 1. Vision

One internal platform that answers, at any moment: **how much is Pucho being used, by whom, is the September Pucho Office GTM working, and which free-grant account will buy next.** It replaces spreadsheet guesswork with a single dashboard, automates the channel-partner nudge/close motion over WhatsApp, and scores every grant account for purchase propensity.

Secondary goal: the system itself demos Pucho — workshop entry forms, WhatsApp reports, and close kits are built as Pucho workflows wherever practical ("the report you just received IS the product").

## 2. Users & personas

| Persona | Access | Primary jobs |
|---|---|---|
| **Founders** (Harshal, Devansh, Kapil, Rakhee) | Full | Command Center daily; weekly segment kill/double decisions; monthly calibration |
| **Ops/Product** | Full | Drill-downs, feature adoption, error/health monitoring |
| **Pucho Sales** | Full minus admin | Band-A close support, SLA escalations, contact-sales pipeline |
| **Solution Architecture** | Workshop module | Create workshops, enter attendance, deliver sessions |
| **Channel Partners** | No dashboard login in v1 — WhatsApp only | Receive digests, hot-lead alerts, nudge instructions, close kits |

## 3. Problems being solved

1. No single view of credit utilization, user behavior, revenue, and partner performance (data exists across 100+ tables; no decision layer).
2. September GTM (60 Pucho Office web workshops, ~1,200 free accounts × 1,000 credits ≈ ₹3.6L/month credit investment) has no attribution chain — cannot tell which workshop/segment/partner produced which signup, usage, or conversion.
3. No systematic way to know which grant accounts are worth partner follow-up time (who will buy) and which are dead (who won't).
4. Partners get no usage visibility, so follow-up is late or random; hot accounts (≥700 credits) go uncalled; zero-use accounts age silently.

## 4. Modules & features

### F1 — Analytics dashboard (7 views)
Single app, views: **Command Center** (exec), **Credits & Revenue**, **Users & Engagement**, **Feature Usage**, **Partners & Funnel**, **Credit Grant Benchmark**, **Search & 360 + Propensity**. Global date-range filter (7/30/90d), light/dark theme, mobile-responsive. Every widget maps 1:1 to a query in `SQL_LIBRARY.sql`. Full widget inventory in `UI_SPEC.md`; working reference implementation in `reference/pucho-pulse-dashboard.html`.

### F2 — Workshop management & attribution chain
- **Manual workshop entry** (Sales/SA, ≤2 min): date/time, campaignTag (managed dropdown list), segment, channel partner, deliveredBy, invitedCount, workbook link. On save → status SCHEDULED and an auto-generated **registration link + QR** embedding workshopId/partnerId/campaignTag/segment.
- **Registration form** (attendee, ≤60s): company, name, phone (OTP), email, industry (dropdown, required), companySize (dropdown, required). Submit → creates Organization (with full attribution columns) + User + 1,000-credit grant.
- **Same-day attendance entry**: attendedCount + status DELIVERED; 6 PM WhatsApp reminder to deliverer; unfilled attendance = red row on dashboard next morning.
- Workshop funnel view: per workshop → invited → attended → accounts → activated 7d → engaged ≥300 → converted (+% at each step); roll-up by campaignTag and segment.

### F3 — Credit grant benchmark
Measures the 1,000-credit grant on four dimensions: depth (usage bands, utilization %, exhaustion %), velocity (median days to 100/300/700/1,000), direction (feature mix vs conversion), yield (conversion by usage band = "money chart", credit cost per conversion, credits-at-conversion percentiles for grant right-sizing). Zero-utilization aging table (0–7/7–14/14–30/30+ days) with per-bucket owner + action.

### F4 — Search & 360
One search box across channel partners, organizations, end users (name/company/email, type filter chips, top-20 results). Click → 360 panel: **Partner 360** (health score + components, portfolio stats, 3-month trend), **End-user 360** (profile: org/industry/size/partner/language/device/signup + behavior: logins, questions, free & paid credits, status band, inline action rule for zero-use), **Org 360** (plan, partner, allocation vs usage, signal).

### F5 — PPS engine (Purchase Propensity Score, Office edition)
Nightly scoring of every grant account 0–100 per `ALGORITHMS.md`: office habit 25 · depth 20 · office app breadth 12 · office volume 10 · embedding 15 · momentum 10 · firmographic 8 · recency penalty. Bands: A ≥70 (close 72h), B 45–69 (push to aha), C 20–44 (re-onboard), D <20 (drip only), **W** wrong-lane override (0 office chats AND ≥10 general chats → Office re-demo, never a close attempt). Nightly snapshot to PropensityLog (the future training data). Band-movement view (climbs into A/B per week). Aha-moment finder report (conversion lift per candidate event).

### F6 — Notification & nudge engine (WhatsApp, partner-facing)
Triggers (priority order): Band-A entry / ≥700 credits (real-time, close kit, 72h SLA) · grant exhausted (real-time, 7-day bonus-carry offer, 24h SLA) · **Office non-use at 72h post-workshop** (specific workbook exercise, not generic) · momentum break (Office-active account silent 5d) · Excel-only expansion nudge day 14 · wrong-lane alert (immediate) · single-player warning day 14 · zero-use aging ladder (72h/7d/14d) · weekly Monday 9 AM partner digest · monthly partner scorecard. Message templates in `NOTIFICATIONS.md`. Dedupe (once per account per threshold), ack tracking, SLA breach → escalation to Pucho Sales with partner CC'd. Language: partner's preferred (Gujarati minimum for Gujarat partners).

### F7 — Partner health & advanced analytics
Health score 0–100: engagement 30 (full at 50% ≥300cr) + conversion 30 (at 5%) + zero-use control 20 (at ≤20%) + velocity 20 (at 40% first-use within 48h); grades A/B/C/D. Monthly trend per partner (accounts→engaged→converted). Credit cost per conversion. League table. Feeds tier decisions and October slot allocation.

### F8 — Close kit generator
Auto-generated one-page PDF per Band-A account from its own usage: usage story (n days, x office chats, y sheets/docs), conservative hours-saved estimate, computed right plan from burn rate vs plan quotas, credits-remaining urgency line, 7-day bonus-carry offer. Attached to the Band-A WhatsApp alert.

## 5. User stories with acceptance criteria (selection — full set implied by modules)

1. *As a founder*, I open Command Center on my phone and within 10 seconds see MRR, burn 7-day MA, activation %, failed payments, and the needs-attention list. **AC:** loads <3s on 4G; every tile links to its drill-down; mobile no horizontal scroll.
2. *As SA*, I create a workshop in under 2 minutes and get a QR to paste into my last slide. **AC:** registration via that QR stamps workshopId/partnerId/campaignTag/segment on the created org, 100% of the time; industry & companySize are required dropdowns.
3. *As ops*, I see per workshop how many signed up, activated, engaged, converted. **AC:** G1 numbers match raw SQL; roll-ups by campaignTag and segment.
4. *As a partner (WhatsApp)*, when my account crosses 700 credits I get an alert + close kit within 30 minutes. **AC:** dedupe = exactly one alert per account per threshold; ack button; no ack in 72h → escalation fires.
5. *As Pucho Sales*, I see today's Band-A list with next actions and SLA timers. **AC:** PPS recomputed nightly; band change history queryable; W-band accounts excluded from close lists and routed to re-demo list.
6. *As a founder*, on Monday I open the segment scoreboard and kill/double segments. **AC:** segments ranked by conversion then engaged %; red kill-line marker at <1% after 4 workshops.

## 6. Product KPIs (is Pulse itself working?)

Partner follow-up SLA compliance ≥90% · Band-A conversion within 14 days ≥25% · zero-use at 14d trending down month-over-month · % of conversions predicted in top PPS quintile ≥60% · founder daily active use of Command Center.

## 7. Non-goals (v1)

Partner-facing web portal (WhatsApp only) · customer-facing usage dashboard · ML-trained scoring (v2 after ~150 conversions; v1 is the SQL scorecard) · real-time streaming (hourly/nightly batch is sufficient) · third-party product-analytics SDKs · billing/payment changes of any kind.

## 8. Dependencies & assumptions

Read replica of production Postgres available · WhatsApp send capability via existing Pucho integration · Zoho subscription webhooks already populate OrganizationPackage/Payment (read-only here) · credit value ₹0.30 constant in config · existing Role/Permission tables usable for RBAC.

## 9. Release phases

See `ROLLOUT.md` (M1 attribution chain → M2 dashboard reads → M3 PPS engine → M4 notifications → M5 Search & 360 → M6 calibration & polish).
