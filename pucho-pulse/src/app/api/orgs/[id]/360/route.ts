import { org360 } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  try {
    const data = await org360(params.id);
    if (!data.org && !data.pps) return problem(404, 'Organization not found');
    return ok(data);
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
