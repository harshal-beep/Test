import { patchWorkshop, patchWorkshopSchema } from '@/lib/workshops';
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
