import { alerts } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GtmAlert list with SLA timers. ?status=open (default) | all. */
export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  const status = new URL(req.url).searchParams.get('status') === 'all' ? 'all' : 'open';
  try {
    return ok(await alerts(status));
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
