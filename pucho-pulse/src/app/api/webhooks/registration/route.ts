import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { attendeeSchema, registerToWorkshop, RegistrationError } from '@/lib/workshops';
import { readOne } from '@/lib/db';
import { ok, problem, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * INBOUND WEBHOOK — Pucho → Pulse.
 *
 * When Pucho's own QR / web-workshop registration system goes live, it POSTs
 * each completed registration here and Pulse provisions the account with full
 * attribution. Pulse does not need to host the form for this to work.
 *
 * Contract
 * --------
 *   POST /api/webhooks/registration
 *   Header: x-pulse-webhook-secret: <PULSE_INBOUND_WEBHOOK_SECRET>
 *   Body:
 *   {
 *     "workshopId":  "cuid",            // OR "campaignTag" + "workshopDate"
 *     "registrationToken": "ABC123",    // OR this, if Pucho holds the token
 *     "attendee": {
 *       "companyName": "Acme Traders",
 *       "fullName":    "Ramesh Patel",
 *       "phone":       "9812345678",    // +91 accepted
 *       "email":       "ramesh@acme.in",
 *       "industry":    "Chemicals",     // must match the managed list
 *       "companySize": "51-200"         // must match the managed list
 *     }
 *   }
 *
 * Responses
 *   201 { created: true,  organizationId }   — new account provisioned
 *   200 { created: false, organizationId }   — same phone already registered
 *                                              for this workshop (safe retry)
 *   401 / 404 / 422 as problem+json
 *
 * Retries are safe: provisioning is idempotent per (phone, workshop), so a
 * duplicate delivery returns 200 with the original organizationId rather than
 * minting a second grant.
 */
const bodySchema = z
  .object({
    workshopId: z.string().min(1).optional(),
    registrationToken: z.string().min(1).optional(),
    attendee: attendeeSchema,
  })
  .refine((b) => b.workshopId || b.registrationToken, {
    message: 'Provide either workshopId or registrationToken',
  });

/** Constant-time compare so the secret cannot be probed byte by byte. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const expected = process.env.PULSE_INBOUND_WEBHOOK_SECRET;
  if (!expected) {
    return problem(503, 'Webhook not configured', 'PULSE_INBOUND_WEBHOOK_SECRET is not set on this deployment');
  }
  if (!secretMatches(req.headers.get('x-pulse-webhook-secret'), expected)) {
    return problem(401, 'Bad webhook secret');
  }

  const parsed = await parseBody(req, bodySchema);
  if ('error' in parsed) return parsed.error;
  const { workshopId, registrationToken, attendee } = parsed.data;

  let id = workshopId;
  if (!id) {
    const w = await readOne<{ id: string }>(`SELECT id FROM "Workshop" WHERE "registrationToken" = $1`, [
      registrationToken,
    ]);
    if (!w) return problem(404, 'Unknown registrationToken');
    id = w.id;
  }

  try {
    const r = await registerToWorkshop(id, attendee);
    return ok(
      { created: r.created, organizationId: r.organizationId, userId: r.userId, workshopId: id },
      { status: r.created ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof RegistrationError) return problem(err.status, err.message);
    return problem(500, 'Provisioning failed', (err as Error).message);
  }
}
