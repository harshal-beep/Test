-- ============================================================
-- 0002_pulse_inputs — the missing-data inputs system.
--
-- Validating against the real production dump (17 Aug 2026) showed that data
-- the Pulse docs REQUIRE has no home in the production schema:
--   - NOTIFICATIONS.md needs a per-partner language ("Gujarati minimum for
--     Gujarat partners") — ChannelPartner has no language column.
--   - WhatsApp sends need a reliable number — ChannelPartner."phoneNumber"
--     is nullable and often the office landline, not the WhatsApp number.
--   - Digest opt-out has nowhere to live.
--
-- Existing tables are READ-ONLY to Pulse, so these live in a Pulse-owned
-- sidecar table keyed by partner id, edited from the /inputs page. Jobs read
-- COALESCE(settings, ChannelPartner) so a missing row degrades gracefully.
-- Idempotent, plain SQL — drops into the production Prisma repo unchanged.
-- ============================================================

CREATE TABLE IF NOT EXISTS "PulsePartnerSettings" (
    "channelPartnerId" text PRIMARY KEY REFERENCES "ChannelPartner"(id),
    "preferredLanguage" text NOT NULL DEFAULT 'en',   -- en | gu | hi
    "whatsappNumber" text,                            -- overrides ChannelPartner."phoneNumber"
    "digestEnabled" boolean NOT NULL DEFAULT true,
    notes text,
    "updatedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedBy" text
);
