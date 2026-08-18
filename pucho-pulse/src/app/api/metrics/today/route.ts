import { today } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The action-queue view: open alerts + SLA, band movement, day-after workshops, expiring grants. */
export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  try {
    return ok(await today());
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
