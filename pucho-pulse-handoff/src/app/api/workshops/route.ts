import { createWorkshop, createWorkshopSchema, listWorkshops } from '@/lib/workshops';
import { workshopFunnel } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/workshops → list + funnel columns (G1). */
export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales', 'pulse.workshop']);
  if (isProblem(guard)) return guard;
  try {
    const [list, funnel] = await Promise.all([listWorkshops(), workshopFunnel()]);
    return ok({ workshops: list, funnel: funnel.funnel });
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}

/** POST /api/workshops → create; server generates registrationToken; returns link + QR. */
export async function POST(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.workshop']);
  if (isProblem(guard)) return guard;
  const parsed = await parseBody(req, createWorkshopSchema);
  if ('error' in parsed) return parsed.error;
  try {
    return ok(await createWorkshop(parsed.data), { status: 201 });
  } catch (err) {
    return problem(500, 'Could not create workshop', (err as Error).message);
  }
}
