import { engagement } from '@/lib/metrics';
import { parseDays } from '@/lib/scope';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  const days = parseDays(new URL(req.url).searchParams.get('days'));
  try {
    return ok(await engagement(days));
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
