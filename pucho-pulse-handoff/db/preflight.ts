/**
 * Preflight compatibility check — RUN THIS BEFORE MIGRATING A REAL DATABASE.
 *
 *   npx tsx db/preflight.ts            # checks DATABASE_URL
 *   npx tsx db/preflight.ts --replica  # also checks REPLICA_URL is readable
 *
 * Read-only. It never writes. It verifies every assumption Pulse's SQL makes
 * about the target database and prints a pass/fail line per check, so a
 * mismatch is caught before a migration touches anything.
 */
import { Client } from 'pg';
import { loadEnv } from './env';

type Check = { name: string; ok: boolean; detail: string; fatal: boolean };
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail: string, fatal = true) =>
  checks.push({ name, ok, detail, fatal });

/** Tables Pulse reads, with the columns its canonical queries depend on. */
const REQUIRED: Record<string, string[]> = {
  Organization: ['id', 'name', 'email', 'industry', 'companySize', 'channelPartnerId', 'isOnboarded', 'status', 'createdAt', 'userId'],
  OrganizationUser: ['id', 'userId', 'organizationId', 'status'],
  User: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'status', 'isOnboarded', 'preferredLanguageId', 'createdAt', 'password'],
  ChannelPartner: ['id', 'companyName', 'email', 'phoneNumber', 'tier', 'status', 'userId'],
  FreeCreditUsage: ['id', 'organizationId', 'userId', 'credits', 'flowId', 'type', 'createdAt'],
  CreditTransaction: ['id', 'userId', 'organizationId', 'credits', 'transactionType', 'type', 'chatQueId', 'flowId', 'flowName', 'runId', 'agentName', 'createdAt'],
  CreditWallets: ['id', 'organizationId', 'type', 'allocated', 'used', 'isActive', 'isAddon', 'entityType', 'expiryDate', 'updatedAt'],
  OrganizationPackage: ['id', 'organizationId', 'packageId', 'status', 'startDate', 'endDate', 'PayFrequency', 'numberOfUser'],
  Package: ['id', 'title', 'price', 'yearlyPrice', 'credit', 'status'],
  Payment: ['id', 'organizationId', 'userId', 'amount', 'paymentStatus', 'paymentMethod', 'paymentDate'],
  ChatHistory: ['id', 'title', 'chatType', 'organizationUserId', 'createdBy', 'createdAt'],
  ChatQuestion: ['id', 'chatHistoryId', 'createdBy', 'isProSearch', 'isDeepResearch', 'isMobile', 'isFile', 'createdAt'],
  LoginHistory: ['id', 'userId', 'orgId', 'device', 'os', 'createdAt'],
  Calls: ['id', 'orgId', 'durationSec', 'callStatus', 'createdAt'],
  Language: ['id', 'name', 'code'],
  WaitlistUser: ['id', 'email'],
  ContactSales: ['id', 'companySize', 'createdAt'],
  CampaignLead: ['id', 'status', 'createdAt'],
  CreditUsageError: ['id', 'userId', 'createdAt'],
  SubscriptionUpgrade: ['id', 'upgradeStatus', 'createdAt'],
  UsageTracking: ['id', 'model', 'provider', 'totalPrice', 'createdAt'],
};

/** Enum values Pulse's queries and writes depend on existing. */
const REQUIRED_ENUM_VALUES: Record<string, string[]> = {
  chatType: ['PUCHO_OFFICE_EXCEL_CHAT', 'PUCHO_OFFICE_WORD_CHAT', 'PUCHO_OFFICE_POWER_POINT_CHAT', 'ORG_KNOWLEDGE', 'CHAT'],
  CreditType: ['BONUS'],                       // the grant wallet type
  TransactionType: ['USAGE', 'DEBIT'],
  PaymentStatus: ['COMPLETED', 'PAID', 'FAILED', 'PENDING', 'PROCESSING'],
  Status: ['Active', 'Deleted'],
  EntityType: ['ORGANIZATION'],
};

/** Objects migration 0001/0002 will create — must NOT already exist. */
const PULSE_TABLES = ['Workshop', 'PropensityLog', 'GtmAlert', 'PulseJobRun', 'PulsePartnerSettings'];
const PULSE_ORG_COLUMNS = ['workshopId', 'signupSegment', 'signupSource'];

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: url });
  await client.connect();

  const target = new URL(url);
  console.info(`\nPucho Pulse preflight — ${target.pathname.replace('/', '')} on ${target.hostname}\n`);

  // SHOW ignores column aliases, so read the GUC as a normal expression.
  const version = (await client.query<{ v: string }>(`SELECT current_setting('server_version') AS v`)).rows[0].v;
  add('PostgreSQL ≥ 13', parseInt(version, 10) >= 13, `server_version = ${version}`);

  // ── existing tables + columns ────────────────────────────────────────────
  const cols = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const byTable = new Map<string, Set<string>>();
  for (const r of cols.rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, new Set());
    byTable.get(r.table_name)!.add(r.column_name);
  }
  for (const [table, needed] of Object.entries(REQUIRED)) {
    const have = byTable.get(table);
    if (!have) {
      add(`table "${table}"`, false, 'MISSING — Pulse queries this table');
      continue;
    }
    const missing = needed.filter((c) => !have.has(c));
    add(`table "${table}"`, missing.length === 0, missing.length ? `missing columns: ${missing.join(', ')}` : `${needed.length} required columns present`);
  }

  // ── enum values ──────────────────────────────────────────────────────────
  const enums = await client.query<{ typname: string; label: string }>(
    `SELECT t.typname, e.enumlabel AS label
       FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'`,
  );
  const enumValues = new Map<string, Set<string>>();
  for (const r of enums.rows) {
    if (!enumValues.has(r.typname)) enumValues.set(r.typname, new Set());
    enumValues.get(r.typname)!.add(r.label);
  }
  for (const [name, needed] of Object.entries(REQUIRED_ENUM_VALUES)) {
    const have = enumValues.get(name);
    if (!have) {
      add(`enum "${name}"`, false, 'MISSING');
      continue;
    }
    const missing = needed.filter((v) => !have.has(v));
    add(`enum "${name}"`, missing.length === 0, missing.length ? `missing values: ${missing.join(', ')}` : `has ${needed.join(', ')}`);
  }

  // ── collision check for what we're about to create ───────────────────────
  const migrated: string[] = [];
  for (const t of PULSE_TABLES) {
    const exists = byTable.has(t);
    if (exists) migrated.push(t);
    add(`create "${t}"`, true, exists ? 'already exists (migration already applied — re-run is a no-op)' : 'free to create', false);
  }
  const orgCols = byTable.get('Organization') ?? new Set();
  for (const c of PULSE_ORG_COLUMNS) {
    add(`Organization."${c}"`, true, orgCols.has(c) ? 'already added' : 'free to add', false);
  }

  // ── the Office signal must actually resolve on this data ─────────────────
  if (byTable.has('ChatHistory') && byTable.has('OrganizationUser')) {
    const office = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM "ChatHistory" ch
        JOIN "OrganizationUser" ou ON ou.id = ch."organizationUserId"
       WHERE ch."chatType"::text LIKE 'PUCHO_OFFICE%'`,
    );
    add('Office signal join resolves', true,
      `${office.rows[0].n} Office chats joinable to an organization` +
      (Number(office.rows[0].n) === 0 ? ' — PPS will score every account 0 until Office usage exists' : ''), false);
  }

  // ── grant scope sanity ───────────────────────────────────────────────────
  if (byTable.has('Organization')) {
    const scope = await client.query<{ partner: string; workshop: string }>(
      `SELECT count(*) FILTER (WHERE "channelPartnerId" IS NOT NULL) AS partner,
              ${orgCols.has('signupSource') ? `count(*) FILTER (WHERE "signupSource" = 'WORKSHOP')` : '0'} AS workshop
         FROM "Organization"`,
    );
    add('grant-account scope', true,
      `channelPartnerId IS NOT NULL → ${scope.rows[0].partner} orgs · signupSource='WORKSHOP' → ${scope.rows[0].workshop} orgs ` +
      `(set PULSE_GRANT_SCOPE accordingly)`, false);
  }

  // ── Prisma drift warning ─────────────────────────────────────────────────
  const prisma = byTable.has('_prisma_migrations');
  add('Prisma drift', true,
    prisma
      ? '⚠ database IS Prisma-managed — copy prisma/pulse-models.prisma into schema.prisma before the next `prisma migrate`, or Prisma will generate a DROP for these tables'
      : 'not Prisma-managed', false);

  // ── replica ──────────────────────────────────────────────────────────────
  if (process.argv.includes('--replica')) {
    const rurl = process.env.REPLICA_URL;
    if (!rurl) add('REPLICA_URL', false, 'not set — every analytics read would hit the primary');
    else {
      const r = new Client({ connectionString: rurl });
      try {
        await r.connect();
        const ro = await r.query<{ ro: string }>(`SELECT pg_is_in_recovery()::text AS ro`);
        add('REPLICA_URL reachable', true, ro.rows[0].ro === 'true' ? 'is a standby (correct)' : 'reachable but NOT a standby — confirm this is intentional', false);
        await r.end();
      } catch (e) {
        add('REPLICA_URL reachable', false, (e as Error).message);
      }
    }
  }

  await client.end();

  // ── report ───────────────────────────────────────────────────────────────
  const pad = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) {
    const mark = c.ok ? '  ok  ' : c.fatal ? ' FAIL ' : ' warn ';
    console.info(`[${mark}] ${c.name.padEnd(pad)}  ${c.detail}`);
  }
  const failures = checks.filter((c) => !c.ok && c.fatal);
  console.info(
    failures.length
      ? `\n✗ ${failures.length} blocking problem(s). Do NOT migrate until these are resolved.\n`
      : `\n✓ Compatible. ${migrated.length ? `(${migrated.length} Pulse table(s) already present.) ` : ''}Safe to run: npm run db:migrate\n`,
  );
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\npreflight could not complete: ${err.message}\n`);
  process.exit(2);
});
