import { ppsHistory } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { orgId: string } }) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  try {
    return ok(await ppsHistory(params.orgId));
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
