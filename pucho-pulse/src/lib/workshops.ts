/**
 * M1 — workshop module + attribution chain.
 *
 * ROLLOUT.md M1 acceptance: "register through a QR on staging → org row has
 * workshopId/signupSegment/signupSource/channelPartnerId; grant wallet exists;
 * G1 returns the row; double-submit same phone = one org."
 */
import { z } from 'zod';
import QRCode from 'qrcode';
import { readOne, readQuery, withTransaction } from './db';
import { cuid, registrationToken } from './ids';
import { GRANT_CREDITS } from '../../config/scoring';
import { COMPANY_SIZES, INDUSTRIES, WORKSHOP_STATUSES } from './dropdowns';

// Dropdown lists live in a server-free module so client components can import
// them without pulling the pg driver into the browser bundle.
export { SEGMENTS, INDUSTRIES, COMPANY_SIZES, WORKSHOP_STATUSES } from './dropdowns';

export const createWorkshopSchema = z.object({
  workshopDate: z.string().min(1),
  segmentName: z.string().min(1),
  campaignTag: z.string().trim().min(1).nullable().optional(),
  channelPartnerId: z.string().trim().min(1).nullable().optional(),
  deliveredBy: z.string().trim().min(1).nullable().optional(),
  invitedCount: z.coerce.number().int().min(0).default(0),
  workbookUrl: z.string().url().nullable().optional(),
});
export type CreateWorkshopInput = z.infer<typeof createWorkshopSchema>;

export const patchWorkshopSchema = z.object({
  attendedCount: z.coerce.number().int().min(0).optional(),
  status: z.enum(WORKSHOP_STATUSES).optional(),
});

export function registrationUrl(token: string): string {
  const base = process.env.PULSE_BASE_URL ?? 'http://localhost:3100';
  return `${base.replace(/\/$/, '')}/r/${token}`;
}

export async function qrDataUrl(token: string): Promise<string> {
  return QRCode.toDataURL(registrationUrl(token), {
    width: 512,
    margin: 1,
    color: { dark: '#17131f', light: '#ffffff' },
  });
}

export async function createWorkshop(input: CreateWorkshopInput) {
  const id = cuid();
  const token = registrationToken();
  const rows = await withTransaction((q) =>
    q(
      `INSERT INTO "Workshop"
         (id, "workshopDate", "segmentName", "campaignTag", "channelPartnerId",
          "deliveredBy", "invitedCount", "attendedCount", status, "registrationToken", "workbookUrl")
       VALUES ($1, $2::timestamp, $3, $4, $5, $6, $7, 0, 'SCHEDULED', $8, $9)
       RETURNING *`,
      [
        id,
        input.workshopDate,
        input.segmentName,
        input.campaignTag ?? null,
        input.channelPartnerId ?? null,
        input.deliveredBy ?? null,
        input.invitedCount ?? 0,
        token,
        input.workbookUrl ?? null,
      ],
    ),
  );
  const workshop = rows[0];
  return {
    workshop,
    registrationUrl: registrationUrl(token),
    qr: await qrDataUrl(token),
  };
}

export async function patchWorkshop(id: string, patch: z.infer<typeof patchWorkshopSchema>) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.attendedCount !== undefined) {
    params.push(patch.attendedCount);
    sets.push(`"attendedCount" = $${params.length}`);
  }
  if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (!sets.length) return null;
  params.push(id);
  const rows = await withTransaction((q) =>
    q(`UPDATE "Workshop" SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params),
  );
  return rows[0] ?? null;
}

export async function getWorkshopByToken(token: string) {
  return readOne(
    `SELECT w.*, cp."companyName" AS partner
       FROM "Workshop" w
       LEFT JOIN "ChannelPartner" cp ON cp.id = w."channelPartnerId"
      WHERE w."registrationToken" = $1`,
    [token],
  );
}

export async function listWorkshops() {
  return readQuery(
    `SELECT w.*, cp."companyName" AS partner
       FROM "Workshop" w
       LEFT JOIN "ChannelPartner" cp ON cp.id = w."channelPartnerId"
      ORDER BY w."workshopDate" DESC`,
  );
}

// ── Registration (the ONLY grant path for workshop accounts) ────────────────

export const registrationSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+91)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number'),
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit OTP'),
  email: z.string().trim().email(),
  industry: z.enum(INDUSTRIES),          // required dropdown (PRD F2 / M1 acceptance)
  companySize: z.enum(COMPANY_SIZES),    // required dropdown
});
export type RegistrationInput = z.infer<typeof registrationSchema>;

export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export interface RegistrationResult {
  organizationId: string;
  userId: string;
  created: boolean; // false when the same phone re-submits for the same workshop
}

/**
 * Creates Organization (with all four attribution fields) + User +
 * OrganizationUser + the 1,000-credit grant wallet, in one transaction.
 *
 * Idempotent per (phone, workshop): a double submit — the common case when an
 * attendee taps twice on a bad conference connection — returns the existing org
 * rather than minting a second one and a second grant.
 */
export async function register(token: string, input: RegistrationInput): Promise<RegistrationResult> {
  const workshop = await getWorkshopByToken(token);
  if (!workshop) throw new RegistrationError('This registration link is not valid', 404);
  if (workshop.status === 'CANCELLED') throw new RegistrationError('This workshop was cancelled', 410);

  const phone = normalisePhone(input.phone);

  const existing = await readOne<{ org_id: string; user_id: string }>(
    `SELECT o.id AS org_id, u.id AS user_id
       FROM "User" u
       JOIN "OrganizationUser" ou ON ou."userId" = u.id
       JOIN "Organization" o ON o.id = ou."organizationId"
      WHERE right(regexp_replace(u."phoneNumber", '\\D', '', 'g'), 10) = $1
        AND o."workshopId" = $2
      LIMIT 1`,
    [phone, workshop.id],
  );
  if (existing) {
    return { organizationId: existing.org_id, userId: existing.user_id, created: false };
  }

  const orgId = cuid();
  const userId = cuid();
  const orgUserId = cuid();
  const walletId = cuid();
  const [firstName, ...rest] = input.fullName.split(/\s+/);

  await withTransaction(async (q) => {
    await q(
      `INSERT INTO "Organization"
         (id, name, email, industry, "companySize", "channelPartnerId", "isOnboarded", status,
          "workshopId", "signupSegment", "signupSource", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, false, 'Active', $7, $8, 'WORKSHOP', CURRENT_TIMESTAMP)`,
      [
        orgId,
        input.companyName,
        input.email,
        input.industry,
        input.companySize,
        workshop.channelPartnerId ?? null,
        workshop.id,
        workshop.segmentName,
      ],
    );
    await q(
      `INSERT INTO "User" (id, "firstName", "lastName", email, "phoneNumber", status, "isOnboarded", "createdAt")
       VALUES ($1, $2, $3, $4, $5, 'Active', false, CURRENT_TIMESTAMP)`,
      [userId, firstName, rest.join(' ') || null, input.email, phone],
    );
    await q(
      `INSERT INTO "OrganizationUser" (id, "userId", "organizationId", status)
       VALUES ($1, $2, $3, 'Active')`,
      [orgUserId, userId, orgId],
    );
    // The 1,000-credit grant. In production this call is the existing
    // provisioning path (PRD F2) rather than a direct insert; the wallet shape
    // is identical either way.
    await q(
      `INSERT INTO "CreditWallets"
         (id, "organizationId", type, allocated, used, "isActive", "isAddon", "entityType", "expiryDate")
       VALUES ($1, $2, 'FREE', $3, 0, true, false, 'ORGANIZATION', now() + interval '90 days')`,
      [walletId, orgId, GRANT_CREDITS],
    );
  });

  return { organizationId: orgId, userId, created: true };
}

export class RegistrationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// ── OTP (M1 stub with the real interface) ───────────────────────────────────
/**
 * Phone OTP for the public registration form (TRD §8). The production build
 * wires these two functions to the same SMS provider the main app uses; the
 * dev implementation prints the code to the server log so the flow is testable
 * without an SMS bill. Codes are single-use and expire in 10 minutes.
 */
const otpStore = new Map<string, { code: string; expires: number; attempts: number }>();

export function issueOtp(phone: string): { sent: true; devCode?: string } {
  const key = normalisePhone(phone);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(key, { code, expires: Date.now() + 10 * 60_000, attempts: 0 });
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[pulse:otp] ${key} → ${code}`);
    return { sent: true, devCode: code };
  }
  // TODO(M1-integration): call the existing Pucho SMS sender here.
  return { sent: true };
}

export function verifyOtp(phone: string, code: string): boolean {
  const key = normalisePhone(phone);
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expires || entry.attempts >= 5) {
    otpStore.delete(key);
    return false;
  }
  entry.attempts += 1;
  if (entry.code !== code) return false;
  otpStore.delete(key);
  return true;
}
