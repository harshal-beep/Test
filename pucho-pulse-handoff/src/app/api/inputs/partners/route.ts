import { z } from 'zod';
import { partnerInputs } from '@/lib/metrics';
import { writeQuery } from '@/lib/db';
import { ok, problem, requireRole, isProblem, parseBody, callerRole } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The missing-data inputs API: partner language / WhatsApp / digest settings. */
export async function GET(req: Request) {
  const guard = requireRole(req, ['pulse.admin', 'pulse.sales']);
  if (isProblem(guard)) return guard;
  try {
    return ok(await partnerInputs());
  } catch (err) {
    return problem(500, 'Query failed', (err as Error).message);
  }
}

const putSchema = z.object({
  channelPartnerId: z.string().min(1),
  preferredLanguage: z.enum(['en', 'gu', 'hi']),
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number')
    .nullable()
    .or(z.literal('').transform(() => null)),
  digestEnabled: z.boolean(),
  notes: z.string().max(500).nullable().optional(),
});

export async function PUT(req: Request) {
  const guard = requireRole(req, ['pulse.admin']);
  if (isProblem(guard)) return guard;
  const parsed = await parseBody(req, putSchema);
  if ('error' in parsed) return parsed.error;
  const d = parsed.data;
  try {
    const rows = await writeQuery(
      `INSERT INTO "PulsePartnerSettings"
         ("channelPartnerId", "preferredLanguage", "whatsappNumber", "digestEnabled", notes, "updatedAt", "updatedBy")
       VALUES ($1, $2, $3, $4, $5, now(), $6)
       ON CONFLICT ("channelPartnerId")
       DO UPDATE SET "preferredLanguage" = EXCLUDED."preferredLanguage",
                     "whatsappNumber" = EXCLUDED."whatsappNumber",
                     "digestEnabled" = EXCLUDED."digestEnabled",
                     notes = EXCLUDED.notes,
                     "updatedAt" = now(),
                     "updatedBy" = EXCLUDED."updatedBy"
       RETURNING *`,
      [d.channelPartnerId, d.preferredLanguage, d.whatsappNumber, d.digestEnabled, d.notes ?? null, callerRole(req)],
    );
    return ok(rows[0]);
  } catch (err) {
    return problem(500, 'Could not save partner settings', (err as Error).message);
  }
}
