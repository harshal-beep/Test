import { user360 } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  try {
    const row = await user360(params.id);
    if (!row) return problem(404, 'User not found');
    return ok(row);
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
