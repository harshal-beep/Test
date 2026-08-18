-- ============================================================
-- 0002_pulse_inputs — the missing-data inputs system.
--
-- Validating against the production dump showed data the Pulse docs REQUIRE
-- that has no home in the production schema:
--   · NOTIFICATIONS.md needs a per-partner language ("Gujarati minimum for
--     Gujarat partners") — ChannelPartner has no language column.
--   · Nudges need a reliable WhatsApp number — ChannelPartner."phoneNumber"
--     is nullable and is often the office landline.
--   · Digest opt-out has nowhere to live.
--
-- Existing tables are READ-ONLY to Pulse, so these live in a Pulse-owned
-- sidecar keyed by partner id, edited from /inputs. Jobs read
-- COALESCE(settings, ChannelPartner) so a missing row degrades gracefully.
-- Naming and referential actions follow Prisma convention (see 0001 header).
-- Idempotent: safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS "PulsePartnerSettings" (
    "channelPartnerId" text NOT NULL,
    "preferredLanguage" text DEFAULT 'en' NOT NULL,   -- en | gu | hi
    "whatsappNumber" text,                            -- overrides ChannelPartner."phoneNumber"
    "digestEnabled" boolean DEFAULT true NOT NULL,
    notes text,
    "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedBy" text,
    CONSTRAINT "PulsePartnerSettings_pkey" PRIMARY KEY ("channelPartnerId")
);

DO $$
BEGIN
  -- Pure sidecar: the settings row has no meaning without its partner.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PulsePartnerSettings_channelPartnerId_fkey') THEN
    ALTER TABLE "PulsePartnerSettings" ADD CONSTRAINT "PulsePartnerSettings_channelPartnerId_fkey"
      FOREIGN KEY ("channelPartnerId") REFERENCES "ChannelPartner"(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;
