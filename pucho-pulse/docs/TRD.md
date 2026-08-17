# TRD — Pucho Pulse: Technical Requirements

**Version:** 1.0 · companion to PRD.md. Canonical SQL: `SQL_LIBRARY.sql` (every query validated on the production schema dump, Postgres 16/17).

---

## 1. Architecture

```
Production Postgres (OLTP, Prisma-managed)
   │  streaming/logical replication (read-only)
   ▼
Analytics replica ──► `analytics` schema: materialized views (nightly/hourly refresh)
   │                          │
   ▼                          ▼
Next.js app (Pulse) ◄── API layer (Next.js route handlers) ──► Jobs runner (cron)
   │                                                              │
   ▼                                                              ▼
Founders/Ops/Sales UI                                   WhatsApp sender (existing
                                                        Pucho integration) + PDF gen
```

**Hard rule:** analytics queries never run against the OLTP primary. Reads → replica. The ONLY writes to the primary are: Workshop rows, Organization attribution columns at registration, PropensityLog, GtmAlert — all through the app's API, all via Prisma migrations listed in `DATA_MODEL.md`.

## 2. Stack

- **App:** Next.js 14+ (App Router) + TypeScript. Tailwind for styling using the brand tokens in `UI_SPEC.md`. Charts: hand-rolled SVG per the reference prototype (no chart lib needed — port `reference/pucho-pulse-dashboard.html` renderers) or Recharts if faster; visual spec is the prototype.
- **DB access:** Prisma (matches existing codebase — `_prisma_migrations` present). New tables via Prisma migrations mirroring the DDL in `DATA_MODEL.md` exactly (column names/casing must match; the schema uses quoted camelCase identifiers).
- **Jobs:** node-cron in a worker process (or the existing CronJobDetail infra if the team prefers — either is acceptable; log every run with status).
- **Auth/RBAC:** existing Keycloak + Role/Permission tables. Roles: `pulse.admin` (founders/ops), `pulse.sales`, `pulse.workshop` (SA). Partners have NO login in v1.
- **PDF (close kit):** server-side render (Playwright/Chromium HTML→PDF) from a close-kit HTML template.
- **WhatsApp:** adapter interface `sendWhatsApp(to, template, params, lang)` wired to the existing Pucho WhatsApp integration; all sends recorded in GtmAlert.

## 3. Data model

All DDL in `DATA_MODEL.md`: new tables `Workshop`, `PropensityLog`, `GtmAlert`; new columns on `Organization` (`workshopId`, `signupSegment`, `signupSource`); `campaignTag` on Workshop; three indexes. Existing tables are **read-only** to this system (full map + join paths in `DATA_MODEL.md`).

## 4. API surface (Next.js route handlers, JSON)

### Metrics (all accept `?days=7|30|90`, all read replica)
```
GET /api/metrics/command-center      → tiles + burn series + signup series + feature split + attention list
GET /api/metrics/credits-revenue     → Q1,Q2,Q3,Q5,Q6,Q7,Q21,Q22,Q24
GET /api/metrics/engagement          → Q8,Q9,Q10,Q4,Q15,Q23
GET /api/metrics/features            → Q11,Q12,Q13,Q24
GET /api/metrics/partners-funnel     → Q16,Q17,Q18,Q19
GET /api/metrics/credit-grant        → B1..B6, Z1, Z2
GET /api/metrics/workshops           → G1 (+ ?campaignTag=&segment= filters), C1
```

### Search & 360
```
GET /api/search?q=&type=all|partner|org|user   → S1, top 20
GET /api/partners/:id/360                      → A1 slice, A2 components, Z1 slice, portfolio stats
GET /api/orgs/:id/360                          → Q25 slice + grant status + PPS row
GET /api/users/:id/360                         → S2
```

### Workshops
```
POST  /api/workshops                → create; server generates registrationToken; returns link + QR (PNG)
PATCH /api/workshops/:id            → attendedCount, status
GET   /api/workshops                → list + funnel columns (G1)
GET   /r/:registrationToken         → public registration page (rate-limited, OTP on phone)
POST  /r/:registrationToken         → creates Organization(+attribution)+User+grant; idempotent per phone+workshop
```

### PPS & alerts
```
GET  /api/pps                       → leaderboard (PPS_OFFICE query), ?band= filter
GET  /api/pps/:orgId/history        → PropensityLog series
GET  /api/alerts?status=open        → GtmAlert list with SLA timers
POST /api/alerts/:id/ack            → partner ack (via WhatsApp button webhook) or internal ack
```

Errors: RFC7807 problem+json. All endpoints RBAC-guarded except `/r/:token`.

## 5. Scheduled jobs

| Job | Schedule | Action |
|---|---|---|
| `pps-snapshot` | nightly 02:00 IST | run PPS_OFFICE → upsert today's PropensityLog rows; compute band changes |
| `hot-scan` | every 30 min, 08:00–21:00 | G3 threshold crossings + Band-A entries + exhaustion → GtmAlert + WhatsApp (dedupe: unique (orgId, type)) |
| `office-nudge` | hourly | orgs 72h post-workshop with 0 office chats → trigger-4 alert |
| `momentum-scan` | daily 08:30 | office-active accounts silent 5d; Excel-only day-14; single-player day-14; wrong-lane |
| `partner-digest` | Mon 09:00 | W1 per partner → weekly digest WhatsApp |
| `sla-escalation` | hourly | GtmAlert past SLA without ack → escalate to Pucho Sales, CC partner |
| `attendance-reminder` | daily 18:00 | workshops today with status SCHEDULED → WhatsApp deliverer |
| `matview-refresh` | nightly 01:30 (cohorts/org360), hourly (burn) | REFRESH MATERIALIZED VIEW CONCURRENTLY |

Every job writes a run log row (reuse CronExecution pattern or own table). Failures alert ops Slack/WhatsApp.

## 6. Materialized views (analytics schema)

`mv_daily_burn` (Q1 base) · `mv_org_360` (Q25) · `mv_cohorts` (Q10) · `mv_workshop_funnel` (G1) · `mv_pps_current` (PPS_OFFICE). Each ≤ a few thousand rows; CONCURRENTLY refresh; unique index required per view.

## 7. Performance & data notes

- Grant-account population is ~10³–10⁴ rows; the validated queries use correlated subqueries — acceptable at this scale on a replica, but the three indexes in DATA_MODEL.md are mandatory before jobs go live.
- `Calls.callDuration` is text — always use `durationSec`. `ChatHistory.chatType` is an enum — cast `::text` for LIKE 'PUCHO_OFFICE%'.
- Scope note: grant queries filter `channelPartnerId IS NOT NULL` today; switch to `signupSource='WORKSHOP'` once M1 ships (both forms present in SQL_LIBRARY comments).
- Credit value ₹0.30 and all scorecard weights live in a single `config/scoring.ts` — never hardcoded in queries embedded in app code.

## 8. Security & privacy

RBAC per §2; partner data isolation (a future partner portal must scope by channelPartnerId — design APIs with that filter now). Registration endpoint: OTP phone verification, rate limit, honeypot. PII (phone/email) never sent to WhatsApp except the partner's own leads. Close-kit PDFs stored with 7-day signed URLs. Audit: SystemAuditLog pattern for admin actions.

## 9. Testing & acceptance

- **SQL parity tests:** every dashboard number must equal its SQL_LIBRARY query result on a seeded fixture DB (seed script = schema dump + synthetic rows covering every band/bucket edge: 0 credits, 99/100/299/300/699/700/999/1000, W-band, multi-user, expired wallet).
- **Attribution test:** register via QR → org row carries all four attribution fields; grant wallet created; FreeCreditUsage rows join back to workshop in G1.
- **Dedupe test:** same account crossing 700 twice (rollback edge) fires exactly one alert.
- **SLA test:** unacked Band-A alert escalates at 72h ± job interval.
- **Snapshot test:** PropensityLog has exactly one row per grant org per day; band changes computed correctly.
- Visual: mobile 360/390px no horizontal overflow; dark mode; PDF close kit renders with all fields.

## 10. Environment & config

`DATABASE_URL` (primary, writes), `REPLICA_URL` (reads), `WHATSAPP_*` (existing integration), `KEYCLOAK_*`, `PULSE_BASE_URL`, `CREDIT_VALUE_INR=0.30`, `GRANT_CREDITS=1000`, tz `Asia/Kolkata` for all schedules and date bucketing.
