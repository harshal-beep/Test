import { ppsLeaderboard, bandMovement } from '@/lib/metrics';
import { parseDays } from '@/lib/scope';
import { ok, problem, requireRole, isProblem } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** PPS leaderboard (?band=A|B|C|D|W) + band movement from PropensityLog. */
export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  const params = new URL(req.url).searchParams;
  const band = params.get('band');
  if (band && !['A', 'B', 'C', 'D', 'W'].includes(band)) {
    return problem(422, 'Invalid band', 'band must be A, B, C, D or W');
  }
  try {
    const [rows, movement] = await Promise.all([
      ppsLeaderboard(band),
      bandMovement(parseDays(params.get('days'))),
    ]);
    return ok({ rows, movement });
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}
