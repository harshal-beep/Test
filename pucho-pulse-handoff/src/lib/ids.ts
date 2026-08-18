import { randomBytes } from 'node:crypto';

/**
 * cuid-shaped ids ("like the rest of the schema" — DATA_MODEL §1). Production
 * rows are cuid v1: 'c' + timestamp + counter + fingerprint + randomness, all
 * base36, 25 chars. We generate the same shape so new rows are indistinguishable
 * from Prisma-generated ones and sort roughly by creation time.
 */
let counter = Math.floor(Math.random() * 2176782336);

const pad = (s: string, len: number) => s.padStart(len, '0').slice(-len);
const fingerprint = pad(randomBytes(2).toString('hex'), 4);

export function cuid(): string {
  const timestamp = Date.now().toString(36);
  counter = (counter + 1) % 2176782336;
  const count = pad(counter.toString(36), 4);
  const random = pad(randomBytes(4).readUInt32BE(0).toString(36), 8);
  return `c${timestamp}${count}${fingerprint}${random}`;
}

/** Registration tokens go in URLs and on QR codes — short, unambiguous, unguessable. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
export function registrationToken(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
