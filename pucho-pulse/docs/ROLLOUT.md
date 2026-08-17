# ROLLOUT — build order, milestones, acceptance

Six milestones, each independently shippable and testable. Do them in order — M1 is the attribution chain everything else reads; skipping ahead produces dashboards of NULLs. Target: M1–M4 before the September workshop wave scales.

## M1 — Attribution chain & workshop module (2–3 dev-days) ⭐ blocks everything

Prisma migrations (Workshop, Organization columns, PropensityLog, GtmAlert, 3 indexes) · workshop CRUD + registration token + QR generation · public `/r/:token` registration page (OTP, required industry/companySize dropdowns, idempotent per phone+workshop) · registration creates Organization (all 4 attribution fields) + User + 1,000-credit grant via existing provisioning path · attendance PATCH + 18:00 reminder job.
**Accept:** register through a QR on staging → org row has workshopId/signupSegment/signupSource/channelPartnerId; grant wallet exists; G1 returns the row; double-submit same phone = one org.

## M2 — Dashboard read views (4–5 dev-days)

Next.js app shell + RBAC · `analytics` schema + 5 matviews + refresh jobs · API metric endpoints (TRD §4) · views `/`, `/credits`, `/engagement`, `/features`, `/partners`, `/grant`, `/workshops` list — visuals per UI_SPEC/prototype.
**Accept:** every widget number equals its SQL_LIBRARY query on the fixture DB (parity tests); mobile 360px no overflow; date filter re-scopes all widgets; loads <3s.

## M3 — PPS engine (2 dev-days)

`config/scoring.ts` (all weights/thresholds) · nightly `pps-snapshot` job → PropensityLog upsert + band-change computation · `/api/pps` + leaderboard on `/search` · band-movement widget.
**Accept:** snapshot idempotent (re-run = same rows); fixture accounts land in expected bands incl. W-override and recency penalties; components jsonb complete.

## M4 — Notification engine (3 dev-days)

GtmAlert ledger + dedupe · WhatsApp adapter · triggers T1–T8 scans per NOTIFICATIONS §1 · ack webhook · `sla-escalation` · quiet hours · per-trigger kill switches · T9 digest + T10 scorecard.
**Accept:** fixture crossing 700 → exactly one T1 with correct suggested plan; unacked T1 escalates at 72h; digest renders per partner; kill switch stops a trigger without deploy; Gujarati template path works.

## M5 — Search & 360 + close kit (2–3 dev-days)

`/api/search` (S1) + 360 endpoints + panels per prototype · close-kit HTML template → PDF (Playwright) → signed URL attached to T1 payload.
**Accept:** search returns mixed typed results <500ms; each 360 matches its SQL; close kit PDF shows usage story, computed plan, urgency line, offer.

## M6 — Calibration & polish (ongoing from week 3)

Monthly: band-monotonicity report (auto) · firmographic CASE → live P1 rates · aha-finder report on candidates · D-band autopsy view · grant A/B config (750/1,000/1,250 by segment) behind a flag · health-score-driven partner tier suggestions.
**Accept:** calibration report generates from PropensityLog alone; weight changes require only `config/scoring.ts` edit + snapshot re-run.

## Risks & mitigations

Attribution skipped at registration (the fatal one) → QR flow is the ONLY grant path for workshop accounts; no manual org creation for GTM. Alert fatigue → priority order + dedupe + quiet hours + kill switches; watch partner ack rates weekly. Matview staleness → refresh timestamps shown in UI footer. Replica lag → all "real-time" scans tolerate 30-min lag by design.
