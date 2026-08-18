import { patchWorkshop, patchWorkshopSchema } from '@/lib/workshops';
import { workshopDetail } from '@/lib/metrics';
import { ok, problem, requireRole, isProblem, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** PATCH /api/workshops/:id → attendedCount, status (same-day attendance entry). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.workshop']);
  if (isProblem(guard)) return guard;
  const parsed = await parseBody(req, patchWorkshopSchema);
  if ('error' in parsed) return parsed.error;
  try {
    const row = await patchWorkshop(params.id, parsed.data);
    if (!row) return problem(404, 'Workshop not found or nothing to update');
    return ok(row);
  } catch (err) {
    return problem(500, 'Could not update workshop', (err as Error).message);
  }
}

/** GET /api/workshops/:id → workshop + its accounts + funnel row. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales', 'pulse.workshop']);
  if (isProblem(guard)) return guard;
  try {
    const data = await workshopDetail(params.id);
    if (!data.workshop) return problem(404, 'Workshop not found');
    return ok(data);
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
