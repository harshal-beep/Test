import { creditGrant } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** B1..B6 + Z1, Z2. Grant benchmarks are lifetime measures — no date filter. */
export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  try {
    return ok(await creditGrant());
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
