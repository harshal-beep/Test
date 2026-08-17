/**
 * Worker process: the cron table from TRD §5, in Asia/Kolkata.
 * Run with `npx tsx jobs/schedule.ts` alongside the Next.js app.
 */
import cron from 'node-cron';
import { JOBS, runJob, type JobName } from './index';

const TZ = 'Asia/Kolkata';

/** [cron expression, job] — mirrors the table in TRD §5 exactly. */
const SCHEDULE: [string, JobName][] = [
  ['0 2 * * *', 'pps-snapshot'],        // nightly 02:00 IST
  ['*/30 8-20 * * *', 'hot-scan'],      // every 30 min, 08:00–21:00
  ['0 * * * *', 'office-nudge'],        // hourly
  ['30 8 * * *', 'momentum-scan'],      // daily 08:30
  ['0 9 * * 1', 'partner-digest'],      // Monday 09:00
  ['15 * * * *', 'sla-escalation'],     // hourly
  ['0 18 * * *', 'attendance-reminder'],// daily 18:00
  ['0 3 1 * *', 'calibration-report'],  // 1st of the month, 03:00
];

for (const [expr, job] of SCHEDULE) {
  cron.schedule(
    expr,
    () => {
      runJob(job, JOBS[job]).catch((err) => console.error(`[pulse:job:${job}]`, err));
    },
    { timezone: TZ },
  );
  console.info(`[pulse:scheduler] ${job} → ${expr} (${TZ})`);
}
