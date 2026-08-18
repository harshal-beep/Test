/**
 * CLI runner: `npm run job <name>` (or `npm run job all`).
 * Loads .env.local so the same invocation works locally and from cron.
 */
import { loadEnv } from '../db/env';
loadEnv();

import { JOBS, runJob, type JobName } from './index';
import { closePools } from '../src/lib/db';

async function main() {
  const name = process.argv[2] as JobName | 'all' | undefined;
  if (!name || (name !== 'all' && !(name in JOBS))) {
    console.error(`usage: npm run job <${Object.keys(JOBS).join('|')}|all>`);
    process.exit(1);
  }
  const names: JobName[] = name === 'all' ? (Object.keys(JOBS) as JobName[]) : [name];
  for (const n of names) {
    const started = Date.now();
    const detail = await runJob(n, JOBS[n]);
    console.info(`[pulse:job:${n}] ok in ${Date.now() - started}ms`, JSON.stringify(detail));
  }
  await closePools();
}

main().catch(async (err) => {
  console.error(err);
  await closePools();
  process.exit(1);
});
