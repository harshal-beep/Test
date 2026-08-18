import { z } from 'zod';
import {
  getWorkshopByToken,
  issueOtp,
  register,
  registrationSchema,
  RegistrationError,
  verifyOtp,
} from '@/lib/workshops';
import { ok, problem, parseBody, rateLimit, clientIp } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public endpoints — the ONLY unguarded routes in Pulse (TRD §4).
 * Protected instead by: OTP on the phone, per-IP rate limit, and a honeypot
 * field that real users never fill.
 */

const otpRequestSchema = z.object({
  action: z.literal('otp'),
  phone: z.string().trim().min(10),
});

const submitSchema = registrationSchema.extend({
  action: z.literal('submit'),
  /** Honeypot: hidden in the form, so any value means a bot. */
  website: z.string().max(0).optional(),
});

const bodySchema = z.discriminatedUnion('action', [otpRequestSchema, submitSchema]);

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const ip = clientIp(req);
  if (!rateLimit(`register:${ip}`, 12, 60_000)) {
    return problem(429, 'Too many requests', 'Please wait a minute and try again');
  }

  const workshop = await getWorkshopByToken(params.token);
  if (!workshop) return problem(404, 'Unknown registration link');

  const parsed = await parseBody(req, bodySchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  if (body.action === 'otp') {
    if (!rateLimit(`otp:${body.phone}`, 3, 5 * 60_000)) {
      return problem(429, 'Too many OTP requests', 'Try again in a few minutes');
    }
    return ok(issueOtp(body.phone));
  }

  if (body.website) return problem(400, 'Registration rejected');

  if (!verifyOtp(body.phone, body.otp)) {
    return problem(401, 'Wrong or expired OTP', 'Request a new code and try again');
  }

  try {
    const result = await register(params.token, body);
    return ok(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    if (err instanceof RegistrationError) return problem(err.status, err.message);
    return problem(500, 'Registration failed', (err as Error).message);
  }
}
