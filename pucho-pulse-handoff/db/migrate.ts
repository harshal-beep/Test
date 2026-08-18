/**
 * Applies db/migrations/*.sql to DATABASE_URL in filename order, once each,
 * tracked in "PulseMigration". Migrations are plain SQL so the same files drop
 * into the production Prisma repo unchanged (see 0001_pulse_m1.sql header).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnv } from './env';

const DIR = join(process.cwd(), 'db', 'migrations');

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS "PulseMigration" (
      name text PRIMARY KEY,
      "appliedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

  const applied = new Set(
    (await client.query<{ name: string }>(`SELECT name FROM "PulseMigration"`)).rows.map((r) => r.name),
  );
  const files = (await readdir(DIR))
    // ONLY numbered migrations run — db/rollback.sql lives outside this
    // directory precisely so it can never be applied as one.
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.info(`= ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(DIR, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(`INSERT INTO "PulseMigration" (name) VALUES ($1)`, [file]);
      await client.query('COMMIT');
      console.info(`+ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    }
  }
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
