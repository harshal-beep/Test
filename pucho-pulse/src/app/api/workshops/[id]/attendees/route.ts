import { z } from 'zod';
import { attendeeSchema, registerToWorkshop, RegistrationError } from '@/lib/workshops';
import { INDUSTRIES, COMPANY_SIZES } from '@/lib/dropdowns';
import { ok, problem, requireRole, isProblem, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Manual attendee entry — the primary way accounts are created today.
 *
 * Accepts either one attendee or a pasted list, because a 25-person workshop
 * typed one form at a time is a form nobody fills in. Every row is provisioned
 * independently: one bad line reports its own error and the rest still land.
 */
// Both keys optional + a refine, rather than z.union: a union reports its
// failure at the root as a bare "Invalid input", which tells whoever is
// pasting a list nothing. This shape surfaces the real path, e.g.
// "attendee.industry: Invalid option" or "attendees.3.phone: …".
const bodySchema = z
  .object({
    attendee: attendeeSchema.optional(),
    attendees: z.array(attendeeSchema).min(1).max(200).optional(),
  })
  .refine((b) => Boolean(b.attendee) !== Boolean(b.attendees), {
    message: 'Provide exactly one of "attendee" or "attendees"',
  });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales', 'pulse.workshop']);
  if (isProblem(guard)) return guard;

  const parsed = await parseBody(req, bodySchema);
  if ('error' in parsed) return parsed.error;
  const rows = parsed.data.attendee ? [parsed.data.attendee] : parsed.data.attendees!;

  const results: { row: number; company: string; status: 'created' | 'existing' | 'error'; detail?: string; organizationId?: string }[] = [];
  for (const [i, attendee] of rows.entries()) {
    try {
      const r = await registerToWorkshop(params.id, attendee);
      results.push({
        row: i + 1,
        company: attendee.companyName,
        status: r.created ? 'created' : 'existing',
        organizationId: r.organizationId,
      });
    } catch (err) {
      if (err instanceof RegistrationError && err.status === 404) {
        return problem(404, 'Unknown workshop');
      }
      results.push({ row: i + 1, company: attendee.companyName, status: 'error', detail: (err as Error).message });
    }
  }

  const created = results.filter((r) => r.status === 'created').length;
  const failed = results.filter((r) => r.status === 'error').length;
  return ok(
    { created, existing: results.filter((r) => r.status === 'existing').length, failed, results },
    { status: failed && !created ? 422 : 201 },
  );
}

/** The dropdown vocabularies, so a bulk paste can be validated client-side. */
export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales', 'pulse.workshop']);
  if (isProblem(guard)) return guard;
  return ok({ industries: INDUSTRIES, companySizes: COMPANY_SIZES });
}
