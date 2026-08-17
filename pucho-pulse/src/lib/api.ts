import { NextResponse } from 'next/server';
import { z } from 'zod';

/** RFC7807 problem+json — TRD §4: "Errors: RFC7807 problem+json." */
export function problem(status: number, title: string, detail?: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { type: 'about:blank', title, status, ...(detail ? { detail } : {}), ...extra },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/**
 * RBAC (TRD §2). Roles come from the existing Keycloak token; until the
 * Keycloak client is wired in this environment, the role is read from the
 * `x-pulse-role` header that the reverse proxy sets, and PULSE_DEV_ROLE lets a
 * developer run the app locally. Every endpoint except /r/:token is guarded —
 * an unknown caller gets 403 rather than data.
 */
export type Role = 'pulse.admin' | 'pulse.sales' | 'pulse.workshop';

export function callerRole(req: Request): Role | null {
  const header = req.headers.get('x-pulse-role');
  const dev = process.env.NODE_ENV !== 'production' ? process.env.PULSE_DEV_ROLE ?? 'pulse.admin' : null;
  const role = header ?? dev;
  return role === 'pulse.admin' || role === 'pulse.sales' || role === 'pulse.workshop' ? role : null;
}

export function requireRole(req: Request, allowed: Role[]): Role | ReturnType<typeof problem> {
  const role = callerRole(req);
  if (!role) return problem(401, 'Not authenticated', 'No Pulse role on the request');
  if (!allowed.includes(role)) {
    return problem(403, 'Forbidden', `Role ${role} may not access this resource`);
  }
  return role;
}

export function isProblem(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: problem(400, 'Invalid JSON body') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: problem(422, 'Validation failed', 'One or more fields are invalid', {
        errors: parsed.error.flatten().fieldErrors,
      }),
    };
  }
  return { data: parsed.data };
}

/**
 * Naive per-process rate limiter for the public registration endpoints
 * (TRD §8: "Registration endpoint: OTP phone verification, rate limit,
 * honeypot"). Behind more than one instance this needs a shared store; the
 * interface stays the same.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}
