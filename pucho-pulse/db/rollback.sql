-- ============================================================
-- ROLLBACK — removes every object Pulse created, and nothing else.
--
-- Run with psql -f db/migrations/rollback.sql. Verify with db/preflight.ts
-- afterwards (it reports a clean, un-migrated database).
--
-- ⚠ This DROPs the three attribution columns on Organization along with the
--   attribution data in them. Export first if you may want it back:
--     \copy (SELECT id, "workshopId", "signupSegment", "signupSource"
--            FROM "Organization" WHERE "workshopId" IS NOT NULL)
--       TO 'attribution-backup.csv' CSV HEADER
-- ============================================================

ALTER TABLE IF EXISTS "Organization" DROP CONSTRAINT IF EXISTS "Organization_workshopId_fkey";
DROP INDEX IF EXISTS "Organization_workshopId_idx";
DROP INDEX IF EXISTS "Organization_channelPartnerId_idx";

DROP TABLE IF EXISTS "PulsePartnerSettings";
DROP TABLE IF EXISTS "PropensityLog";
DROP TABLE IF EXISTS "GtmAlert";
DROP TABLE IF EXISTS "PulseJobRun";
DROP TABLE IF EXISTS "Workshop";      -- after Organization's FK is gone

ALTER TABLE IF EXISTS "Organization" DROP COLUMN IF EXISTS "workshopId";
ALTER TABLE IF EXISTS "Organization" DROP COLUMN IF EXISTS "signupSegment";
ALTER TABLE IF EXISTS "Organization" DROP COLUMN IF EXISTS "signupSource";

DROP TABLE IF EXISTS "PulseMigration";
