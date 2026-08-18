-- ============================================================
-- 0001_pulse_m1 — Pucho Pulse core tables
--
-- VERIFIED against the production pg_dump (PostgreSQL 17.4, 17 Aug 2026):
--   · none of these table names exist in production (no collisions)
--   · "workshopId" / "signupSegment" / "signupSource" are free on Organization
--   · constraint and index names follow Prisma's own convention
--     (<Table>_<column>_fkey / _key / _idx) and the referential actions match
--     the existing schema's style, so adding the matching models to
--     schema.prisma produces NO drift and Prisma will not try to recreate them
--
-- ⚠ PRODUCTION IS PRISMA-MANAGED. Before running `prisma migrate` again,
--   copy prisma/pulse-models.prisma into your schema.prisma — otherwise
--   Prisma sees these tables as drift and generates a DROP.
--
-- Run db/preflight.ts against the target database first; it checks every
-- assumption above and refuses to proceed if any has changed.
-- Idempotent: safe to re-run.
-- ============================================================

-- ── Workshops (F2) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Workshop" (
    id text NOT NULL,
    "workshopDate" timestamp(3) NOT NULL,
    "segmentName" text NOT NULL,
    "campaignTag" text,                           -- e.g. 'SEP26-WEB-CA'
    "channelPartnerId" text,
    "deliveredBy" text,                           -- SA User.id
    "invitedCount" integer DEFAULT 0 NOT NULL,
    "attendedCount" integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'SCHEDULED' NOT NULL,     -- SCHEDULED | DELIVERED | CANCELLED
    "registrationToken" text,                     -- optional: only for the built-in QR flow
    "workbookUrl" text,
    "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "Workshop_pkey" PRIMARY KEY (id)
);

-- ── Nightly PPS snapshots (F5) — the future training data ──────────────────
CREATE TABLE IF NOT EXISTS "PropensityLog" (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "snapshotDate" date NOT NULL,
    pps integer NOT NULL,
    band text NOT NULL,                           -- A|B|C|D|W
    components jsonb NOT NULL,
    "createdAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "PropensityLog_pkey" PRIMARY KEY (id)
);

-- ── Alert / nudge ledger (F6) — dedupe + SLA + audit ───────────────────────
CREATE TABLE IF NOT EXISTS "GtmAlert" (
    id text NOT NULL,
    type text NOT NULL,
    "organizationId" text,
    "channelPartnerId" text,
    payload jsonb,
    "firedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ackAt" timestamp(3),
    "escalatedAt" timestamp(3),
    "slaHours" integer,
    CONSTRAINT "GtmAlert_pkey" PRIMARY KEY (id)
);

-- ── Job run log (TRD §5) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PulseJobRun" (
    id text NOT NULL,
    job text NOT NULL,
    "startedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "finishedAt" timestamp(3),
    status text NOT NULL,                         -- RUNNING | OK | FAILED
    detail jsonb,
    CONSTRAINT "PulseJobRun_pkey" PRIMARY KEY (id)
);

-- ── Attribution columns on Organization (the ONLY writes to an existing table)
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "workshopId" text;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "signupSegment" text;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "signupSource" text;   -- 'WORKSHOP' | 'DIRECT' | 'PARTNER'

-- ── Constraints ────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Workshop → ChannelPartner / User (optional relations: SET NULL, matching
  -- the convention every existing FK in this schema uses).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Workshop_channelPartnerId_fkey') THEN
    ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_channelPartnerId_fkey"
      FOREIGN KEY ("channelPartnerId") REFERENCES "ChannelPartner"(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Workshop_deliveredBy_fkey') THEN
    ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_deliveredBy_fkey"
      FOREIGN KEY ("deliveredBy") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  -- Snapshots are meaningless without their org, so they cascade away with it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropensityLog_organizationId_fkey') THEN
    ALTER TABLE "PropensityLog" ADD CONSTRAINT "PropensityLog_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;

  -- The alert ledger is an audit trail: it OUTLIVES the rows it points at.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GtmAlert_organizationId_fkey') THEN
    ALTER TABLE "GtmAlert" ADD CONSTRAINT "GtmAlert_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GtmAlert_channelPartnerId_fkey') THEN
    ALTER TABLE "GtmAlert" ADD CONSTRAINT "GtmAlert_channelPartnerId_fkey"
      FOREIGN KEY ("channelPartnerId") REFERENCES "ChannelPartner"(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;

  -- Organization → Workshop. Added NOT VALID on purpose: validating would take
  -- an ACCESS EXCLUSIVE lock and a full scan of a large live table. Existing
  -- rows all have NULL here anyway (the column was just created), so there is
  -- nothing to validate. Run the VALIDATE in a quiet window when convenient:
  --     ALTER TABLE "Organization" VALIDATE CONSTRAINT "Organization_workshopId_fkey";
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Organization_workshopId_fkey') THEN
    ALTER TABLE "Organization" ADD CONSTRAINT "Organization_workshopId_fkey"
      FOREIGN KEY ("workshopId") REFERENCES "Workshop"(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "Workshop_registrationToken_key" ON "Workshop" ("registrationToken");

-- Dedupe: one alert per (type, org) for threshold types. DIGEST and SCORECARD
-- recur, so they are excluded and keyed by partner + period inside payload.
CREATE UNIQUE INDEX IF NOT EXISTS "GtmAlert_type_organizationId_key"
    ON "GtmAlert" (type, "organizationId") WHERE type NOT IN ('DIGEST', 'SCORECARD');
CREATE INDEX IF NOT EXISTS "GtmAlert_open_idx" ON "GtmAlert" ("firedAt") WHERE "ackAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "PropensityLog_organizationId_snapshotDate_key"
    ON "PropensityLog" ("organizationId", "snapshotDate");

CREATE INDEX IF NOT EXISTS "PulseJobRun_job_startedAt_idx" ON "PulseJobRun" (job, "startedAt" DESC);

CREATE INDEX IF NOT EXISTS "Organization_workshopId_idx" ON "Organization" ("workshopId");
CREATE INDEX IF NOT EXISTS "Organization_channelPartnerId_idx" ON "Organization" ("channelPartnerId");

-- NOTE: DATA_MODEL.md §1 also asks for an index on "FreeCreditUsage"
-- ("organizationId"). It is deliberately NOT created here: production already
-- has "FreeCreditUsage_organizationId_userId_idx" on (organizationId, userId),
-- whose leftmost prefix serves every organizationId lookup Pulse makes. A
-- second index would add write cost on a hot table and buy nothing.
