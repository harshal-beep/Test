/**
 * Rebuilds the local fixture database from scratch:
 *   fixture schema (production shape) → Pulse migrations → deterministic seed.
 *
 * Safe by construction: it refuses to run against anything that isn't obviously
 * a local/test database, because step one drops the public schema.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnv } from '../env';
import { seed } from './seed';

const SAFE_HOSTS = ['localhost', '127.0.0.1', 'db', 'postgres'];

function assertLocal(url: string) {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const dbName = parsed.pathname.replace('/', '');
  const looksLocal = SAFE_HOSTS.includes(host);
  const looksLikeFixture = /(test|fixture|local|dev)/i.test(dbName);
  if (!looksLocal && !looksLikeFixture) {
    throw new Error(
      `Refusing to rebuild "${dbName}" on ${host}: this script DROPS the public schema. ` +
        `Point DATABASE_URL at a local database whose name contains test/fixture/local/dev.`,
    );
  }
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (copy .env.example to .env.local)');
  assertLocal(url);

  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`SET TIME ZONE 'Asia/Kolkata'`);

  const schema = await readFile(join(process.cwd(), 'db', 'fixture', 'schema.sql'), 'utf8');
  await client.query(schema);
  console.info('+ fixture schema (production shape)');

  const dir = join(process.cwd(), 'db', 'migrations');
  for (const file of (await readdir(dir))
    // ONLY numbered migrations run — db/rollback.sql lives outside this
    // directory precisely so it can never be applied as one.
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()) {
    await client.query(await readFile(join(dir, file), 'utf8'));
    console.info(`+ ${file}`);
  }
  await client.query(`CREATE TABLE IF NOT EXISTS "PulseMigration" (
      name text PRIMARY KEY, "appliedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  for (const file of (await readdir(dir))
    // ONLY numbered migrations run — db/rollback.sql lives outside this
    // directory precisely so it can never be applied as one.
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort()) {
    await client.query(`INSERT INTO "PulseMigration" (name) VALUES ($1) ON CONFLICT DO NOTHING`, [file]);
  }

  await client.query('BEGIN');
  await seed(client);
  await client.query('COMMIT');
  console.info('+ seed data');

  const counts = await client.query<{ orgs: string; workshops: string; fcu: string; chats: string }>(
    `SELECT (SELECT count(*) FROM "Organization")   AS orgs,
            (SELECT count(*) FROM "Workshop")       AS workshops,
            (SELECT count(*) FROM "FreeCreditUsage") AS fcu,
            (SELECT count(*) FROM "ChatHistory")    AS chats`,
  );
  console.info('  ', counts.rows[0]);
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
