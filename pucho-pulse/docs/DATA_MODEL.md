# DATA_MODEL — Pucho Pulse

Existing production schema is Prisma-managed with **quoted camelCase identifiers** (e.g. `"createdAt"`, `"organizationId"`). All new objects follow the same convention. Existing tables are READ-ONLY to Pulse except where stated.

## 1. New DDL (implement as Prisma migrations, matching exactly)

```sql
-- Workshops (F2)
CREATE TABLE "Workshop" (
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
ALTER TABLE "Organization" ADD COLUMN "workshopId" text;
ALTER TABLE "Organization" ADD COLUMN "signupSegment" text;
ALTER TABLE "Organization" ADD COLUMN "signupSource" text;   -- 'WORKSHOP' | 'DIRECT' | 'PARTNER'

-- Nightly PPS snapshots (F5) — the future ML training data
CREATE TABLE "PropensityLog" (
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
CREATE TABLE "GtmAlert" (
    id text PRIMARY KEY,
    type text NOT NULL,          -- BAND_A | EXHAUSTED | OFFICE_NOUSE_72H | MOMENTUM_BREAK | EXCEL_ONLY | WRONG_LANE | SINGLE_PLAYER | ZERO_USE_7D | ZERO_USE_14D | DIGEST | SCORECARD
    "organizationId" text,
    "channelPartnerId" text,
    payload jsonb,                                -- rendered message params, close-kit URL
    "firedAt" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ackAt" timestamp(3),
    "escalatedAt" timestamp(3),
    "slaHours" integer,                           -- 72 for BAND_A, 24 for EXHAUSTED, null for digests
    UNIQUE (type, "organizationId")               -- dedupe: one alert per type per org (digests use org NULL)
);

-- Mandatory indexes before jobs go live
CREATE INDEX idx_org_workshop ON "Organization"("workshopId");
CREATE INDEX idx_org_partner  ON "Organization"("channelPartnerId");
CREATE INDEX idx_fcu_org      ON "FreeCreditUsage"("organizationId");
```

Note: digest-type alerts recur — model them with `organizationId = NULL` and partner+week in payload, or relax the unique constraint to a partial unique index excluding digest types. Choose one and test the dedupe case.

## 2. Existing tables Pulse reads (the map)

| Table | Used for | Key columns / notes |
|---|---|---|
| `Organization` | account master, attribution, firmographics | `industry`, `companySize`, `channelPartnerId`, `createdAt`, `status` ('Active'…) |
| `OrganizationUser` | org↔user link; ChatHistory joins through its **id** | `id`, `userId`, `organizationId`, `status` |
| `User` | end-user profile | `preferredLanguageId`→`Language`, `status`, `isOnboarded`, `createdAt` |
| `ChannelPartner` | partner master | `companyName`, `tier`, `status` |
| `FreeCreditUsage` | grant consumption (THE grant signal) | `organizationId`, `userId`, `credits` numeric, `flowId`, `type`, `createdAt` |
| `CreditTransaction` | paid usage | filter `"transactionType" IN ('USAGE','DEBIT')`; attribution cols `chatQueId`/`flowId`/`agentName` |
| `CreditWallets` | allocations | `allocated`, `used`, `isActive`, `expiryDate`, `isAddon`, `entityType` |
| `OrganizationPackage` | subscription state (conversion event) | `status='Active'`, `startDate`, `endDate`, `PayFrequency`, Zoho fields |
| `Package` | plan catalog | `price`, `yearlyPrice`, `credit`, `title` |
| `Payment` | collected revenue | `paymentStatus IN ('COMPLETED','PAID')` |
| `ChatHistory` | **Office signal** | `chatType` enum — Office values: `PUCHO_OFFICE_EXCEL_CHAT`, `PUCHO_OFFICE_WORD_CHAT`, `PUCHO_OFFICE_POWER_POINT_CHAT`; also `ORG_KNOWLEDGE` (own docs), `WHATSAPP`, `NOTEBOOK`, `PUCHO_CODE`. Join to org via `organizationUserId`→`OrganizationUser.id`. Cast `::text` for LIKE. |
| `ChatQuestion` | engagement events | `createdBy` = user id, `isProSearch`, `isDeepResearch`, `isMobile`, `isFile` |
| `LoginHistory` | sessions, device/OS | `userId`, `orgId`, `device`, `os` |
| `UsageTracking` | token/model mix (Feature view) | `model`, `provider`, `totalPrice` |
| `Calls`/`CallDetails` | voice usage | use `durationSec` int (NOT `callDuration` text) |
| `WaitlistUser`, `ContactSales`, `Campaign*` | funnel view | email match to `User` for waitlist conversion |
| `CreditUsageError`, `apiLogger`, `CronExecution`, `IncidentLog` | health view | `apiLogger.latency` int ms |
| `Language` | user language (nudge locale) | join from `User.preferredLanguageId` |

## 3. Canonical join paths

```
Workshop.id ──< Organization.workshopId
ChannelPartner.id ──< Organization.channelPartnerId
Organization.id ──< FreeCreditUsage.organizationId        (grant burn)
Organization.id ──< OrganizationUser.organizationId
OrganizationUser.id ──< ChatHistory.organizationUserId    (Office signal — NOT userId direct)
User.id ──< ChatQuestion.createdBy                        (engagement)
Organization.id ──< OrganizationPackage.organizationId    (conversion = status 'Active')
Organization.id ──< Payment.organizationId                (revenue)
```

## 4. Enum gotchas

`Status`/`UserStatus` values are Capitalized ('Active','Deleted'); `TransactionType` usage = 'USAGE' or 'DEBIT'; `PaymentStatus` success = 'COMPLETED' **or** 'PAID' (both occur); `chatType` is lowercase-named enum type `"chatType"`. `Organization.PayFrequency` column is capitalized "PayFrequency" (sic).
