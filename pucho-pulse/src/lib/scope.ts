/**
 * Grant-account scope switch.
 *
 * CLAUDE.md schema gotcha: "Grant-account scope: `channelPartnerId IS NOT NULL`
 * until M1 ships, then `signupSource = 'WORKSHOP'`."
 *
 * Every grant/benchmark/PPS query takes this as its $1 parameter, so the switch
 * is one env var rather than an edit across twenty queries. `null` means the
 * pre-M1 fallback (`channelPartnerId IS NOT NULL`).
 */
export function grantScope(): string | null {
  const v = process.env.PULSE_GRANT_SCOPE?.trim();
  if (!v || v === 'PARTNER_FALLBACK') return null;
  return v; // 'WORKSHOP' once the attribution chain is live
}

/** Date-range filter shared by every view (UI_SPEC §2: presets 7/30/90). */
export const ALLOWED_DAYS = [7, 30, 90] as const;
export type Days = (typeof ALLOWED_DAYS)[number];

export function parseDays(input: string | null | undefined, fallback: Days = 30): Days {
  const n = Number(input);
  return (ALLOWED_DAYS as readonly number[]).includes(n) ? (n as Days) : fallback;
}
