# Pucho Pulse

Internal analytics + GTM platform for Pucho.ai. Seven-view dashboard, workshop
attribution chain, 1,000-credit grant benchmarking, purchase-propensity scoring
(PPS) and partner WhatsApp nudge/close automation.

The product spec lives in `docs/` and `CLAUDE.md`; **read those first** — this
file only covers how to run and how the code is arranged.

## Run it locally

```bash
cp .env.example .env.local          # defaults point at a local fixture DB
npm install
createdb pulse_fixture              # any local Postgres 16+
npm run db:fixture                  # fixture schema + Pulse migrations + seed
npm run dev                         # http://localhost:3100
npm test                            # 66 tests, incl. SQL parity
```

`db:fixture` rebuilds a **local stand-in** for the production database: the
tables Pulse reads, in production shape (quoted camelCase, real `chatType`
enum), plus deterministic seed rows covering every band and bucket edge —
0 / 99 / 100 / 299 / 300 / 699 / 700 / 999 / 1,000 credits, a wrong-lane account,
a stale account, a multi-user account, an expired wallet. It refuses to run
against anything that doesn't look like a local database, because step one drops
the public schema.

Against the real database you instead run `npm run db:migrate`, which applies
only `db/migrations/*.sql` — the new tables and the three `Organization`
attribution columns, nothing else.

Jobs: `npm run job pps-snapshot` (or `all`), or `npx tsx jobs/schedule.ts` for the
full TRD §5 cron table in `Asia/Kolkata`.

## What's here

| Milestone | State |
|---|---|
| **M1** attribution chain | **Complete** — workshop CRUD, registration token + QR, public `/r/:token` with OTP + honeypot + rate limit, idempotent-per-phone registration writing all four attribution fields and the 1,000-credit grant, attendance PATCH, 18:00 reminder job |
| **M2** dashboard reads | **Complete except matviews** — all seven views + workshop admin, every metric endpoint in TRD §4, RBAC-guarded, date filter, dark mode, 360px clean. Queries run live against the replica; the five materialized views in TRD §6 are not built yet (see below) |
| **M3** PPS engine | **Complete** — `config/scoring.ts`, canonical `PPS_OFFICE` query, nightly snapshot job, `/api/pps`, band-movement, leaderboard |
| **M4** notification engine | **Complete except live sending** — GtmAlert ledger, DB-enforced dedupe, all ten templates, quiet hours, per-trigger kill switches, SLA escalation, ack endpoint. The WhatsApp adapter posts to `WHATSAPP_API_URL`; with that unset it logs instead of sending |
| **M5** search & 360 + close kit | **Partial** — search, Partner/Org/User 360 panels and the close kit are built; the close kit is an HTML page, not yet a rendered PDF |
| **M6** calibration | **Partial** — `calibration-report` job computes band monotonicity, quintiles and the aha lift from PropensityLog; no UI for it yet |

### Known gaps, in priority order

1. **Materialized views** (TRD §6) — `mv_daily_burn`, `mv_org_360`, `mv_cohorts`,
   `mv_workshop_funnel`, `mv_pps_current` and their refresh jobs. The queries are
   fast enough on fixture-scale data; at production scale the correlated
   subqueries in the grant queries want them (TRD §7).
2. **Close-kit PDF** — `/kit/:orgId` renders the page; wiring
   Playwright HTML→PDF plus a 7-day signed URL is what remains.
3. **Keycloak** — RBAC is enforced on every endpoint, but the role currently
   comes from an `x-pulse-role` header the proxy sets (and `PULSE_DEV_ROLE`
   locally) rather than from a verified Keycloak token.
4. **OTP delivery** — the verification flow is real (single-use, 10-minute
   expiry, 5 attempts, rate-limited); it prints the code to the server log
   instead of calling the SMS provider. One function to swap in
   `src/lib/workshops.ts`.
5. **Registration provisioning** — creates the org, user, link row and grant
   wallet directly. In production this should call the existing provisioning
   path so grants are minted the same way everywhere.

## How the code is arranged

```
config/scoring.ts        every weight, threshold, SLA, quiet hour, ₹0.30, 1,000
docs/                    PRD, TRD, DATA_MODEL, SQL_LIBRARY, ALGORITHMS,
                         NOTIFICATIONS, UI_SPEC, ROLLOUT  (the spec bundle)
reference/               the working HTML prototype = the visual spec
db/migrations/           Pulse-owned DDL only (drops into Prisma unchanged)
db/fixture/              local production-shaped schema + deterministic seed
src/lib/sql/queries.ts   the app's port of SQL_LIBRARY.sql
src/lib/db.ts            replica/primary split + the read-only write guard
src/lib/metrics.ts       one function per TRD §4 endpoint
src/lib/pps.ts           PPS v0.1 in TypeScript (mirror of the SQL scorecard)
src/lib/whatsapp.ts      adapter + GtmAlert ledger + the ten templates
jobs/                    the TRD §5 cron table
tests/                   parity, PPS, attribution, notifications, snapshot
```

### Three rules the code enforces rather than documents

**Analytics never touches the primary.** `readQuery` can only reach the replica
pool, which opens every connection with `default_transaction_read_only = on`.
`writeQuery` only reaches the primary and rejects any statement whose target is
not one of the four tables Pulse owns — plus, on `Organization`, any column
other than the three attribution columns. `DELETE` is rejected outright.
`tests/attribution.test.ts` proves it.

**SQL_LIBRARY.sql is truth.** `src/lib/sql/queries.ts` is a port, not a rewrite.
The only change is the date window: where the dashboard offers a 7/30/90 filter,
`interval '30 days'` becomes a bound parameter. Windows that are part of a
metric's *definition* — activation within 7 days, the 14-day Office habit
window, the momentum 7d-vs-prior-7d split, the zero-use aging buckets — stay
hardcoded, because changing them changes what the number means.
`tests/parity.test.ts` extracts each query verbatim from the library, runs both
versions against the fixture, and requires identical result sets. 42 of them.

**Weights live in one file.** The PPS scorecard exists twice on purpose: as SQL
(what the dashboard and the nightly job read) and as TypeScript driven by
`config/scoring.ts`. `tests/pps.test.ts` scores every fixture account both ways
and requires agreement, so a weight changed in config without mirroring it in
the SQL fails the build instead of quietly producing two different scores.

## Environment

See `.env.example`. The two that matter: `DATABASE_URL` (primary — writes only)
and `REPLICA_URL` (every analytics read; required in production, where the app
refuses to start without it). `PULSE_GRANT_SCOPE` switches the grant-account
definition between the pre-M1 fallback (`channelPartnerId IS NOT NULL`) and
`WORKSHOP`, per the scope note in SQL_LIBRARY.sql.
