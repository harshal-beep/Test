-- ============================================================
-- FIXTURE SCHEMA — local/CI stand-in for the production Pucho database.
--
-- This is NOT a migration and is NEVER applied to production. It recreates the
-- shape of the production tables Pulse reads (docs/DATA_MODEL.md §2) — quoted
-- camelCase identifiers, the same enum spellings, the same column types for
-- every column the canonical queries in docs/SQL_LIBRARY.sql touch — so that
-- those queries can be executed verbatim in tests (TRD §9 parity tests).
--
-- Columns not referenced by any canonical query are omitted on purpose: this
-- file must stay small enough to read, and anything it does contain is
-- load-bearing for a query.
-- ============================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- chatType is a real enum in production; the Office signal relies on
-- `"chatType"::text LIKE 'PUCHO_OFFICE%'`, so it must be an enum here too or
-- the cast in the canonical SQL would be silently trivial.
CREATE TYPE "chatType" AS ENUM (
  'PUCHO_OFFICE_EXCEL_CHAT',
  'PUCHO_OFFICE_WORD_CHAT',
  'PUCHO_OFFICE_POWER_POINT_CHAT',
  'ORG_KNOWLEDGE',
  'WHATSAPP',
  'NOTEBOOK',
  'PUCHO_CODE',
  'GENERAL'
);

CREATE TABLE "Language" (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE "ChannelPartner" (
  id            text PRIMARY KEY,
  "companyName" text NOT NULL,
  email         text,
  phone         text,
  tier          text,
  status        text NOT NULL DEFAULT 'Active',      -- Capitalized (DATA_MODEL §4)
  "preferredLanguage" text DEFAULT 'en',
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Organization" (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  email              text,
  industry           text,
  "companySize"      text,
  "channelPartnerId" text REFERENCES "ChannelPartner"(id),
  "isOnboarded"      boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'Active',
  "createdAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  -- "workshopId", "signupSegment", "signupSource" are added by
  -- db/migrations/0001_pulse_m1.sql, exactly as they will be in production.
);

CREATE TABLE "User" (
  id                    text PRIMARY KEY,
  "firstName"           text,
  "lastName"            text,
  email                 text,
  "phoneNumber"         text,
  status                text NOT NULL DEFAULT 'Active',
  "isOnboarded"         boolean NOT NULL DEFAULT false,
  "preferredLanguageId" text REFERENCES "Language"(id),
  "createdAt"           timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OrganizationUser" (
  id               text PRIMARY KEY,
  "userId"         text NOT NULL REFERENCES "User"(id),
  "organizationId" text NOT NULL REFERENCES "Organization"(id),
  status           text NOT NULL DEFAULT 'Active'
);

CREATE TABLE "Package" (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  price         numeric NOT NULL DEFAULT 0,
  "yearlyPrice" numeric,
  credit        integer NOT NULL DEFAULT 0
);

CREATE TABLE "OrganizationPackage" (
  id               text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "Organization"(id),
  "packageId"      text REFERENCES "Package"(id),
  status           text NOT NULL DEFAULT 'Active',
  "startDate"      timestamp(3),
  "endDate"        timestamp(3),
  "PayFrequency"   text,                              -- capital P (sic, DATA_MODEL §4)
  "numberOfUser"   integer
);

CREATE TABLE "Payment" (
  id               text PRIMARY KEY,
  "organizationId" text REFERENCES "Organization"(id),
  amount           numeric NOT NULL DEFAULT 0,
  "paymentStatus"  text NOT NULL,                     -- success = 'COMPLETED' or 'PAID'
  "paymentMethod"  text,
  "paymentDate"    timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CreditWallets" (
  id               text PRIMARY KEY,
  "organizationId" text REFERENCES "Organization"(id),
  type             text,
  allocated        numeric NOT NULL DEFAULT 0,
  used             numeric NOT NULL DEFAULT 0,
  "isActive"       boolean NOT NULL DEFAULT true,
  "isAddon"        boolean NOT NULL DEFAULT false,
  "entityType"     text,
  "expiryDate"     timestamp(3)
);

CREATE TABLE "CreditTransaction" (
  id                text PRIMARY KEY,
  "userId"          text REFERENCES "User"(id),
  "organizationId"  text REFERENCES "Organization"(id),
  credits           numeric NOT NULL DEFAULT 0,
  "transactionType" text NOT NULL,                    -- usage = 'USAGE' or 'DEBIT'
  type              text,
  "chatQueId"       text,
  "flowId"          text,
  "flowName"        text,
  "runId"           text,
  "agentName"       text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "FreeCreditUsage" (
  id               text PRIMARY KEY,
  "organizationId" text REFERENCES "Organization"(id),
  "userId"         text REFERENCES "User"(id),
  credits          numeric NOT NULL DEFAULT 0,
  "flowId"         text,
  type             text,
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ChatHistory" (
  id                   text PRIMARY KEY,
  "chatType"           "chatType" NOT NULL,
  "organizationUserId" text REFERENCES "OrganizationUser"(id),
  "createdBy"          text REFERENCES "User"(id),
  "createdAt"          timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ChatQuestion" (
  id               text PRIMARY KEY,
  "chatHistoryId"  text REFERENCES "ChatHistory"(id),
  "createdBy"      text REFERENCES "User"(id),
  "isProSearch"    boolean NOT NULL DEFAULT false,
  "isDeepResearch" boolean NOT NULL DEFAULT false,
  "isMobile"       boolean NOT NULL DEFAULT false,
  "isFile"         boolean NOT NULL DEFAULT false,
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "LoginHistory" (
  id          text PRIMARY KEY,
  "userId"    text REFERENCES "User"(id),
  "orgId"     text REFERENCES "Organization"(id),
  device      text,
  os          text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "UsageTracking" (
  id           text PRIMARY KEY,
  model        text,
  provider     text,
  "totalPrice" numeric,
  "createdAt"  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Calls" (
  id            text PRIMARY KEY,
  "orgId"       text REFERENCES "Organization"(id),
  "durationSec" integer,                              -- NOT callDuration (text)
  "callDuration" text,                                -- present so the wrong column stays wrong
  "callStatus"  text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "WaitlistUser" (
  id          text PRIMARY KEY,
  email       text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ContactSales" (
  id            text PRIMARY KEY,
  email         text,
  "companySize" text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CampaignLead" (
  id          text PRIMARY KEY,
  status      text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CreditUsageError" (
  id          text PRIMARY KEY,
  "userId"    text REFERENCES "User"(id),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SubscriptionUpgrade" (
  id              text PRIMARY KEY,
  "upgradeStatus" text,
  "createdAt"     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
