import { partner360 } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  try {
    const data = await partner360(params.id);
    if (!data.health) return problem(404, 'Partner not found or has no grant accounts');
    return ok(data);
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
