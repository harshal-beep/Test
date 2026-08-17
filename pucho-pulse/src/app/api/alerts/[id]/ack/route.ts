import { ackAlert, alertById } from '@/lib/whatsapp';
import { ok, problem, callerRole } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Ack an alert. Two callers:
 *   - the WhatsApp webhook relaying a partner's ✅ quick-reply, authenticated by
 *     the shared secret in x-pulse-webhook-secret (partners have no login in v1);
 *   - an internal user with a Pulse role.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  const fromWebhook = Boolean(secret) && req.headers.get('x-pulse-webhook-secret') === secret;
  const role = callerRole(req);
  if (!fromWebhook && !role) return problem(401, 'Not authenticated');

  const alert = await alertById(params.id);
  if (!alert) return problem(404, 'Alert not found');

  const acked = await ackAlert(params.id, fromWebhook ? 'partner' : (role ?? 'internal'));
  if (!acked) return problem(409, 'Already acknowledged');
  return ok({ id: params.id, ackedBy: fromWebhook ? 'partner' : role });
}
