import { workshopFunnel } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** G1 (+ ?campaignTag= & ?segment= filters), C1, G2. */
export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales', 'pulse.workshop']);
  if (isProblem(guard)) return guard;
  const params = new URL(req.url).searchParams;
  try {
    return ok(
      await workshopFunnel({
        campaignTag: params.get('campaignTag'),
        segment: params.get('segment'),
      }),
    );
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
