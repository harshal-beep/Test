# CLAUDE.md — Pucho Pulse

Internal analytics + GTM platform for Pucho.ai: 7-view dashboard, workshop attribution chain, 1,000-credit grant benchmarking, purchase-propensity scoring (PPS), and partner WhatsApp nudge/close automation.

## Read these first, in order

1. `docs/PRD.md` — what we're building and why
2. `docs/TRD.md` — architecture, stack, APIs, jobs
3. `docs/DATA_MODEL.md` — new DDL + map of the existing production schema
4. `docs/SQL_LIBRARY.sql` — **canonical queries; every dashboard number comes from here**
5. `docs/ALGORITHMS.md` — PPS v0.1 (Office edition), health score, benchmarks
6. `docs/NOTIFICATIONS.md` — WhatsApp triggers, templates, SLAs
7. `docs/UI_SPEC.md` + `reference/pucho-pulse-dashboard.html` — the working visual spec (open the HTML in a browser)
8. `docs/ROLLOUT.md` — build order M1→M6 with acceptance criteria per milestone

## Ground rules

- **Build in ROLLOUT.md order.** M1 (attribution chain) blocks everything — a dashboard without it renders NULLs.
- **SQL_LIBRARY.sql is truth.** Every query there was validated against the real production schema dump. Port queries verbatim (they're already correct); if you must modify one, re-validate against a Postgres loaded with the schema before using it. Dashboard-vs-SQL parity tests are required (TRD §9).
- **Existing tables are READ-ONLY** except the exact writes listed in DATA_MODEL.md §1 (Workshop, 3 Organization columns at registration, PropensityLog, GtmAlert). Never migrate or alter any other production table.
- The production schema is Prisma-managed with **quoted camelCase identifiers** (`"createdAt"`, `"organizationId"`). Raw SQL must quote them. New tables follow the same convention via Prisma migrations matching DATA_MODEL.md DDL exactly.
- **Reads → replica (`REPLICA_URL`), writes → primary (`DATABASE_URL`).** No analytics query ever touches the primary.
- All scoring weights, thresholds, credit value (₹0.30), grant size (1,000) live in `config/scoring.ts`. Never hardcode them elsewhere.
- Timezone `Asia/Kolkata` for every schedule and date bucket. Indian number formatting (K/L/Cr) in UI.
- WhatsApp sends only through the adapter + GtmAlert ledger (dedupe + SLA + audit). Respect quiet hours 21:00–08:00 IST and per-trigger kill switches.

## Schema gotchas (memorize these)

- Office signal = `ChatHistory."chatType"::text LIKE 'PUCHO_OFFICE%'`, joined to org via `OrganizationUser.id = ChatHistory."organizationUserId"` — NOT via userId directly.
- Status enums are Capitalized ('Active','Deleted'); payment success is 'COMPLETED' **or** 'PAID'; credit usage is `"transactionType" IN ('USAGE','DEBIT')`.
- `Calls."durationSec"` (int), never `callDuration` (text). `Organization."PayFrequency"` — capital P, sic.
- Grant-account scope: `"channelPartnerId" IS NOT NULL` until M1 ships, then `"signupSource" = 'WORKSHOP'`.

## Definition of done (any milestone)

Acceptance criteria in ROLLOUT.md pass · parity tests green on the fixture DB · mobile 360px no horizontal overflow · dark mode works · no analytics query on primary · lint/typecheck clean.

## What NOT to build (v1 non-goals)

Partner web portal (WhatsApp only) · customer-facing dashboards · ML training (v0.1 is the SQL scorecard; PropensityLog just accumulates) · streaming/real-time infra · any billing changes.
