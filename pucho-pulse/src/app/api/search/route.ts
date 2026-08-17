import { search } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** S1 — universal search across partners, orgs and end users. Top 20. */
export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  const params = new URL(req.url).searchParams;
  const type = (params.get('type') ?? 'all') as 'all' | 'partner' | 'org' | 'user';
  if (!['all', 'partner', 'org', 'user'].includes(type)) {
    return problem(422, 'Invalid type filter', "type must be all|partner|org|user");
  }
  try {
    return ok(await search(params.get('q') ?? '', type));
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
