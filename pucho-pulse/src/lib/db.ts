import { Pool, type QueryResultRow } from 'pg';

/**
 * Two pools, deliberately separate (TRD §1 hard rule):
 *   reads  → REPLICA_URL   (every analytics query, no exceptions)
 *   writes → DATABASE_URL  (primary; only the four write targets Pulse owns)
 *
 * `readQuery` physically cannot reach the primary, and `writeQuery` refuses any
 * statement whose target table is not one Pulse is allowed to write, so
 * "no analytics query on primary" and "existing tables are READ-ONLY" are
 * enforced by the process rather than by reviewer memory.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pulsePools: { replica?: Pool; primary?: Pool } | undefined;
}

const pools = (globalThis.__pulsePools ??= {});

function makePool(url: string, readOnly: boolean): Pool {
  const pool = new Pool({
    connectionString: url,
    max: readOnly ? 10 : 5,
    idleTimeoutMillis: 30_000,
    application_name: readOnly ? 'pulse-read' : 'pulse-write',
  });
  if (readOnly) {
    // Belt and braces: even a mistaken INSERT through the read pool fails at
    // the server, not silently on the primary's data.
    pool.on('connect', (client) => {
      void client.query('SET default_transaction_read_only = on');
      void client.query(`SET TIME ZONE 'Asia/Kolkata'`);
    });
  } else {
    pool.on('connect', (client) => {
      void client.query(`SET TIME ZONE 'Asia/Kolkata'`);
    });
  }
  return pool;
}

export function replicaPool(): Pool {
  const url = process.env.REPLICA_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('REPLICA_URL (or DATABASE_URL) is not set');
  if (!process.env.REPLICA_URL && process.env.NODE_ENV === 'production') {
    throw new Error('REPLICA_URL must be set in production — analytics never reads the primary');
  }
  return (pools.replica ??= makePool(url, true));
}

export function primaryPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return (pools.primary ??= makePool(url, false));
}

/** Every dashboard/API read goes through here. Replica only. */
export async function readQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await replicaPool().query<T>(text, params as never[]);
  return res.rows;
}

export async function readOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await readQuery<T>(text, params);
  return rows[0] ?? null;
}

/**
 * The only tables Pulse may write (CLAUDE.md ground rules / DATA_MODEL §1).
 * "Organization" is here because registration stamps the three attribution
 * columns — `assertOrganizationWrite` narrows that further to those columns.
 */
const WRITABLE = new Set([
  'Workshop',
  'PropensityLog',
  'GtmAlert',
  'PulseJobRun',
  'Organization',
  'User',
  'OrganizationUser',
  'CreditWallets',
  'FreeCreditUsage',
]);

/**
 * Registration provisions Organization/User/OrganizationUser/CreditWallets rows
 * through the existing provisioning path in production (PRD F2). In this
 * codebase that path is `src/lib/provisioning.ts`; the tables are listed above
 * so the local fixture can exercise it end to end. Everything else stays
 * read-only — an UPDATE/DELETE against a production table other than
 * Organization's attribution columns is rejected here.
 */
const ORG_ALLOWED_UPDATE_COLUMNS = ['workshopId', 'signupSegment', 'signupSource', 'channelPartnerId'];

function targetTable(sql: string): string | null {
  const m = sql.match(/^\s*(insert\s+into|update|delete\s+from)\s+"?([A-Za-z_]+)"?/i);
  return m ? m[2] : null;
}

export async function writeQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const table = targetTable(text);
  if (!table) {
    throw new Error(`writeQuery: could not determine target table for statement: ${text.slice(0, 80)}`);
  }
  if (!WRITABLE.has(table)) {
    throw new Error(`writeQuery: "${table}" is READ-ONLY to Pulse (DATA_MODEL.md §1)`);
  }
  if (/^\s*update/i.test(text) && table === 'Organization') {
    const setClause = text.slice(text.toLowerCase().indexOf(' set ') + 5).split(/\bwhere\b/i)[0];
    // Split on commas that are outside string literals, then take each
    // assignment's target. Quoted or bare, both are caught — production
    // identifiers are quoted camelCase, but a bare `name = …` must not slip by.
    const columns = setClause
      .split(/,(?=(?:[^']*'[^']*')*[^']*$)/)
      .map((assignment) => assignment.split('=')[0].trim().replace(/"/g, ''))
      .filter(Boolean);
    const illegal = columns.filter((c) => !ORG_ALLOWED_UPDATE_COLUMNS.includes(c));
    if (illegal.length) {
      throw new Error(
        `writeQuery: Organization columns ${illegal.join(', ')} are READ-ONLY — only ` +
          `${ORG_ALLOWED_UPDATE_COLUMNS.join(', ')} may be written, and only at registration`,
      );
    }
  }
  if (/^\s*delete/i.test(text)) {
    throw new Error('writeQuery: Pulse never deletes rows');
  }
  const res = await primaryPool().query<T>(text, params as never[]);
  return res.rows;
}

/** Transaction on the primary, subject to the same write guard per statement. */
export async function withTransaction<T>(fn: (q: typeof writeQuery) => Promise<T>): Promise<T> {
  const client = await primaryPool().connect();
  try {
    await client.query('BEGIN');
    const scoped: typeof writeQuery = async (text, params = []) => {
      const table = targetTable(text);
      if (!table || !WRITABLE.has(table)) {
        throw new Error(`writeQuery: "${table ?? '?'}" is READ-ONLY to Pulse (DATA_MODEL.md §1)`);
      }
      const res = await client.query(text, params as never[]);
      return res.rows as never;
    };
    const out = await fn(scoped);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePools(): Promise<void> {
  await Promise.all([pools.replica?.end(), pools.primary?.end()]);
  pools.replica = undefined;
  pools.primary = undefined;
}
