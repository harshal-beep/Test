# Pucho Pulse

Internal analytics + GTM platform for Pucho.ai: an action queue plus eight
analytics views over the production database, the workshop attribution chain,
1,000-credit grant benchmarking, purchase-propensity scoring (PPS), and the
partner nudge engine.

The product spec lives in `docs/` and `CLAUDE.md`. **This file is the developer
handoff** — how to run it, how to connect it to the real database, and where the
integration seams are.

---

## 1. Run it locally (about 2 minutes)

```bash
cp .env.example .env.local          # defaults point at a local fixture DB
npm install
createdb pulse_fixture              # any local Postgres 13+
npm run db:fixture                  # production-shaped schema + migrations + seed
npm run job all                     # populate the Today queue
npm run dev                         # → http://localhost:3100
npm test                            # 75 tests
```

`npm run db:fixture` builds a **local stand-in** for production: the tables Pulse
reads, extracted verbatim from your pg_dump, plus deterministic seed rows
covering every band and bucket edge (0 / 99 / 100 / 299 / 300 / 699 / 700 / 999 /
1,000 credits, a wrong-lane account, a stale account, a multi-user account, an
expired wallet, a partner with no phone number). It refuses to run against
anything that doesn't look like a local database, because step one drops the
public schema.

---

## 2. Connecting to the real database

**Run the preflight first. It is read-only and it will tell you if anything has
changed since this was built.**

```bash
export DATABASE_URL='postgres://…'      # primary — writes
export REPLICA_URL='postgres://…'       # replica — every analytics read
npx tsx db/preflight.ts --replica
```

It verifies every table, column and enum value Pulse depends on, reports whether
the objects it wants to create already exist, confirms the Office-signal join
resolves, tells you which grant scope to configure, and warns about Prisma
drift. It exits non-zero on any blocking mismatch.

When it reports **✓ Compatible**:

```bash
npm run db:migrate       # applies db/migrations/*.sql, tracked in "PulseMigration"
```

### What the migration actually does

| Object | Type |
|---|---|
| `Workshop`, `PropensityLog`, `GtmAlert`, `PulseJobRun`, `PulsePartnerSettings` | new tables |
| `Organization."workshopId"`, `."signupSegment"`, `."signupSource"` | new nullable columns |
| `Organization_workshopId_idx`, `Organization_channelPartnerId_idx` | new indexes |
| FKs on the new tables + `Organization_workshopId_fkey` (`NOT VALID`) | new constraints |

Nothing else is touched. No existing column is altered, no existing index is
dropped, no data is rewritten. `db/rollback.sql` removes exactly this set.

### ⚠ Three things to know before you migrate

1. **Your database is Prisma-managed.** Pulse creates tables outside Prisma's
   knowledge, so the next `prisma migrate dev` will see them as drift and
   generate a `DROP`. **Paste `prisma/pulse-models.prisma` into your
   `schema.prisma` first**, then `npx prisma migrate dev --create-only` should
   report no changes. If it wants to create or drop anything, stop and
   reconcile.

2. **`Organization_workshopId_fkey` is created `NOT VALID` on purpose.**
   Validating it would take an `ACCESS EXCLUSIVE` lock and a full scan of a
   large live table. The column is brand new so every row is NULL and there is
   nothing to validate. Run this in a quiet window when convenient:
   ```sql
   ALTER TABLE "Organization" VALIDATE CONSTRAINT "Organization_workshopId_fkey";
   ```

3. **`PULSE_GRANT_SCOPE` decides what counts as a grant account.** Use
   `PARTNER_FALLBACK` (meaning `channelPartnerId IS NOT NULL`) until enough
   accounts carry `signupSource='WORKSHOP'`, then switch to `WORKSHOP`. The
   preflight prints both counts so you can choose.

Reads go to `REPLICA_URL` and writes to `DATABASE_URL`, enforced in code —
`readQuery` cannot reach the primary, and `writeQuery` rejects any statement
targeting a table Pulse does not own.

---

## 3. How accounts get created

A workshop account can be created three ways. All three funnel through
`provisionAttendee()` in `src/lib/workshops.ts`, so the attribution and the
1,000-credit grant are identical whichever path is used.

### a. Manual entry — the primary path today
Open a workshop at `/workshops/:id` → **Add attendee** (one form) or **Paste a
list** (comma/tab separated, straight out of Excel). Each row is provisioned
independently, so one bad line reports its own error and the rest still land.

### b. Pucho's registration webhook — for when the QR system lands

```http
POST /api/webhooks/registration
x-pulse-webhook-secret: $PULSE_INBOUND_WEBHOOK_SECRET
Content-Type: application/json

{
  "workshopId": "cmsy...",         // OR "registrationToken": "ABC123"
  "attendee": {
    "companyName": "Acme Traders",
    "fullName":    "Ramesh Patel",
    "phone":       "9812345678",   // +91 accepted
    "email":       "ramesh@acme.in",
    "industry":    "Chemicals",    // must match the managed list
    "companySize": "51-200"        // must match the managed list
  }
}
```

`201 {created:true, organizationId}` on a new account, `200 {created:false,
organizationId}` if that phone already registered for that workshop. **Retries
are safe** — provisioning is idempotent per (phone, workshop), so a duplicate
delivery never mints a second grant. Managed lists are in
`src/lib/dropdowns.ts` and served by `GET /api/workshops/:id/attendees`.

### c. Built-in self-service page — optional fallback
`/r/:token` with OTP, honeypot and rate limiting. Fully working, kept as a
reference implementation. Once Pucho's own registration system posts to the
webhook above, this can be ignored.

---

## 4. How nudges get sent

Pulse decides **who** to message, **when**, in **which language**, and with
**which template and parameters**. Pucho owns delivery. So the integration is an
outbound webhook, not a WhatsApp API call:

```http
POST $PULSE_OUTBOUND_WEBHOOK_URL
x-pulse-webhook-secret: $PULSE_OUTBOUND_WEBHOOK_SECRET

{
  "to":       "9812300001",
  "template": "T1",                    // T1..T10, docs/NOTIFICATIONS.md §2
  "language": "gu",                    // en | gu | hi
  "params":   { "org_name": "...", "pps": 92, ... },
  "text":     "🔥 HOT LEAD — Seven Hundred Mills\n…",   // fully rendered
  "alertId":  "cmsy...",
  "ackUrl":   "https://pulse…/api/alerts/cmsy.../ack"
}
```

Respond `2xx`; optionally `{"id":"<message-id>"}` and Pulse stores it for
tracing. When the partner replies ✅, POST the `ackUrl` with the same secret
header to stop the SLA clock.

**With `PULSE_OUTBOUND_WEBHOOK_URL` unset every send is a dry run that logs the
exact payload** — dedupe, quiet hours, kill switches, the SLA clock and the
ledger all still exercise, so the engine is fully testable before Pucho's sender
exists.

Partner language and WhatsApp number are **not** in the production schema. They
live in `PulsePartnerSettings` and are edited at `/inputs`, which also lists
every other data gap alongside what breaks while it stays empty.

---

## 5. Jobs

```bash
npm run job <name>            # or: npm run job all
npx tsx jobs/schedule.ts      # the full TRD §5 cron table, Asia/Kolkata
```

| Job | Schedule | Does |
|---|---|---|
| `pps-snapshot` | 02:00 nightly | scores every grant account → `PropensityLog` |
| `hot-scan` | every 30 min, 08:00–21:00 | Band-A entries, ≥700 crossings, exhaustion |
| `office-nudge` | hourly | 72h post-workshop with zero Office use |
| `momentum-scan` | 08:30 daily | momentum break, wrong lane, Excel-only, single player, zero-use ladder |
| `partner-digest` | Mon 09:00 | weekly per-partner summary |
| `sla-escalation` | hourly | unacked past SLA → escalate |
| `attendance-reminder` | 18:00 daily | today's workshops with no attendance entered |
| `calibration-report` | 1st, 03:00 | band monotonicity, quintiles, aha lift |

Every run writes a `PulseJobRun` row with its outcome.

---

## 6. The views

| Route | What it answers |
|---|---|
| `/today` | **Run the GTM.** Alert queue with SLA countdowns, band movement, yesterday's workshops, expiring grants, "is the score working?" |
| `/` | Command Center — MRR, burn, activation, hot accounts, needs-attention |
| `/workshops` · `/workshops/:id` | Are workshops producing clients? Funnel with drop-off, attendee entry, every account produced |
| `/grant` | Is the 1,000-credit grant working? Money chart, burn-down by cohort, is-1000-right percentiles, zero-use aging |
| `/search` | Search + Partner/Org/User 360 + the PPS leaderboard |
| `/credits` `/engagement` `/features` `/partners` | The analytics drill-downs |
| `/inputs` | Partner settings + every data gap and its consequence |
| `/kit/:orgId` | Close kit for a hot account, generated from its own usage |

---

## 7. Code map

```
config/scoring.ts        every weight, threshold, SLA, quiet hour, ₹0.30, 1,000
docs/                    PRD, TRD, DATA_MODEL, SQL_LIBRARY, ALGORITHMS,
                         NOTIFICATIONS, UI_SPEC, ROLLOUT
prisma/pulse-models.prisma  ← paste into your schema.prisma BEFORE migrating
db/preflight.ts          read-only compatibility check for a target database
db/migrations/           Pulse-owned DDL only, numbered, idempotent
db/rollback.sql          removes exactly what Pulse created
db/fixture/              local production-shaped schema (generated) + seed
scripts/extract-fixture-schema.py   regenerate the fixture from a fresh dump
src/lib/sql/queries.ts   the app's port of SQL_LIBRARY.sql
src/lib/db.ts            replica/primary split + the read-only write guard
src/lib/metrics.ts       one function per API endpoint
src/lib/pps.ts           PPS v0.1 in TypeScript (mirror of the SQL scorecard)
src/lib/health.ts        partner health per ALGORITHMS §3
src/lib/whatsapp.ts      outbound webhook + GtmAlert ledger + the ten templates
src/lib/workshops.ts     provisionAttendee — the one path all entry modes take
jobs/                    the cron table
tests/                   parity · pps · partner-health · attribution ·
                         entry-paths · notifications · inputs · snapshot
```

### Four rules the code enforces rather than documents

**Analytics never touches the primary.** `readQuery` only reaches the replica
pool, whose connections open with `default_transaction_read_only = on`.
`writeQuery` only reaches the primary and rejects any statement whose target is
not a table Pulse owns — plus, on `Organization`, any column other than the
three attribution columns. `DELETE` is rejected outright.

**SQL_LIBRARY.sql is truth.** `src/lib/sql/queries.ts` is a port, not a rewrite.
The only change is the date window: where the dashboard offers a 7/30/90 filter,
`interval '30 days'` becomes a bound parameter. Windows that are part of a
metric's *definition* stay hardcoded, because changing them changes what the
number means. `tests/parity.test.ts` extracts each query verbatim from the
library, runs both versions, and requires identical result sets — 41 of them.

**Weights live in one file.** The PPS scorecard exists twice on purpose: as SQL
(what the dashboard and the nightly job read) and as TypeScript driven by
`config/scoring.ts`. `tests/pps.test.ts` scores every fixture account both ways
and requires agreement, so a weight changed in config without mirroring it in
the SQL fails the build. Partner health works the same way via
`src/lib/health.ts`.

**Every entry path provisions identically.** Manual, webhook and self-service
all call `provisionAttendee`; `tests/entry-paths.test.ts` asserts their outputs
match field for field.

---

## 8. Known gaps

1. **Materialized views** (TRD §6) — `mv_daily_burn`, `mv_org_360`, `mv_cohorts`,
   `mv_workshop_funnel`, `mv_pps_current`. Queries are fast at fixture scale; at
   production scale the correlated subqueries in the grant queries want them.
2. **Close-kit PDF** — `/kit/:orgId` renders the page; the Playwright HTML→PDF
   step and a signed URL are what remain.
3. **Keycloak** — RBAC is enforced on every endpoint, but the role comes from an
   `x-pulse-role` header your proxy sets (and `PULSE_DEV_ROLE` locally) rather
   than a verified token. One function in `src/lib/api.ts`.
4. **OTP delivery** — only used by the optional self-service page. The flow is
   real (single-use, 10-minute expiry, 5 attempts, rate-limited) but prints the
   code to the server log instead of calling an SMS provider.
5. **Grant provisioning** — `provisionAttendee` writes the org, user, link row
   and grant wallet directly. If you have an existing provisioning service,
   point it there so grants are minted the same way everywhere.

---

## 9. Deploying

Node 20+. `npm ci && npm run build && npm start` (port 3100), plus one worker
running `npx tsx jobs/schedule.ts`. Set `DATABASE_URL`, `REPLICA_URL`,
`PULSE_BASE_URL`, `PULSE_GRANT_SCOPE`, the two webhook secrets, and
`PULSE_SALES_PHONE`. In production the app refuses to start without
`REPLICA_URL`, so analytics can never silently fall back to the primary.
