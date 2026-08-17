-- ============================================================
-- 0001_pulse_m1 — Pucho Pulse M1 DDL
--
-- Matches docs/DATA_MODEL.md §1 exactly. When Pulse is folded into the
-- production Prisma repo this file becomes the body of
-- prisma/migrations/<timestamp>_pulse_m1/migration.sql — Prisma migrations
-- ARE plain SQL files, so no rewrite is needed. It is kept standalone here
-- because Pulse must never own (and therefore must never introspect or
-- re-generate) the production schema: existing tables are READ-ONLY except
-- the three Organization attribution columns added below.
--
-- Idempotent so it can be applied to the fixture DB repeatedly.
-- ============================================================

-- Workshops (F2)
CREATE TABLE IF NOT EXISTS "Workshop" (
    id text PRIMARY KEY,                          -- cuid, like the rest of the schema
    "workshopDate" timestamp(3) NOT NULL,
    "segmentName" text NOT NULL,
    "campaignTag" text,                           -- e.g. 'SEP26-WEB-CA'; managed list
    "channelPartnerId" text REFERENCES "ChannelPartner"(id),
    "deliveredBy" text,                           -- SA user id
    "invitedCount" integer DEFAULT 0,
    "attendedCount" integer DEFAULT 0,
    status text DEFAULT 'SCHEDULED',              -- SCHEDULED | DELIVERED | CANCELLED
    "registrationToken" text UNIQUE,              -- for /r/:token link + QR
    "workbookUrl" text,
    "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Attribution columns (write ONLY at registration time)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "workshopId" text;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "signupSegment" text;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "signupSource" text;   -- 'WORKSHOP' | 'DIRECT' | 'PARTNER'

-- Nightly PPS snapshots (F5) — the future ML training data
CREATE TABLE IF NOT EXISTS "PropensityLog" (
    id text PRIMARY KEY,
    "organizationId" text NOT NULL,
    "snapshotDate" date NOT NULL,
    pps integer NOT NULL,
    band text NOT NULL,                           -- A|B|C|D|W
    components jsonb NOT NULL,                    -- {depth, officeHabit, officeBreadth, officeVolume, embed, momentum, firmo, recency}
    "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE ("organizationId", "snapshotDate")
);

-- Alert/nudge ledger (F6) — dedupe + SLA + audit
CREATE TABLE IF NOT EXISTS "GtmAlert" (
    id text PRIMARY KEY,
    type text NOT NULL,          -- BAND_A | EXHAUSTED | OFFICE_NOUSE_72H | MOMENTUM_BREAK | EXCEL_ONLY | WRONG_LANE | SINGLE_PLAYER | ZERO_USE_7D | ZERO_USE_14D | DIGEST | SCORECARD
    "organizationId" text,
    "channelPartnerId" text,
    payload jsonb,                                -- rendered message params, close-kit URL
    "firedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ackAt" timestamp(3),
    "escalatedAt" timestamp(3),
    "slaHours" integer                            -- 72 for BAND_A, 24 for EXHAUSTED, null for digests
);

-- Dedupe: one alert per type per org for threshold types.
-- DATA_MODEL.md §1 note: digests recur, so instead of a plain UNIQUE (type,
-- organizationId) we use a PARTIAL unique index that excludes the recurring
-- types. DIGEST/SCORECARD rows carry organizationId = NULL and are keyed by
-- partner + period inside payload (see jobs/partner-digest.ts).
CREATE UNIQUE INDEX IF NOT EXISTS uq_gtmalert_type_org
    ON "GtmAlert" (type, "organizationId")
    WHERE type NOT IN ('DIGEST', 'SCORECARD');

CREATE INDEX IF NOT EXISTS idx_gtmalert_open
    ON "GtmAlert" ("firedAt") WHERE "ackAt" IS NULL;

-- Mandatory indexes before jobs go live
CREATE INDEX IF NOT EXISTS idx_org_workshop ON "Organization"("workshopId");
CREATE INDEX IF NOT EXISTS idx_org_partner  ON "Organization"("channelPartnerId");
CREATE INDEX IF NOT EXISTS idx_fcu_org      ON "FreeCreditUsage"("organizationId");

-- Job run log (TRD §5: "Every job writes a run log row"). Pulse-owned, so it
-- lives here rather than reusing the production CronExecution table.
CREATE TABLE IF NOT EXISTS "PulseJobRun" (
    id text PRIMARY KEY,
    job text NOT NULL,
    "startedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3),
    status text NOT NULL,                         -- RUNNING | OK | FAILED
    detail jsonb
);
CREATE INDEX IF NOT EXISTS idx_pulsejobrun_job ON "PulseJobRun" (job, "startedAt" DESC);
