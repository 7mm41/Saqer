import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { customType } from 'drizzle-orm/pg-core';

/**
 * Personal data (names, emails, phone numbers, sign-in addresses and devices) is
 * stored encrypted with AES-256-GCM: a copy of the database alone shows nothing
 * readable. Lookups (sign-in by email, SMS by number) use a keyed hash of the
 * value instead (`lookupIndex`). The key comes from DATA_KEY, or from JWT_SECRET
 * when that isn't set; changing it makes the stored data unreadable.
 */
let keys: { encrypt: Buffer; index: Buffer } | null = null;

const PREFIX = 'enc1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function setDataKey(secret: string) {
  const master = Buffer.from(secret, 'utf8');
  keys = {
    encrypt: Buffer.from(hkdfSync('sha256', master, 'sarena', 'personal-data-encryption', 32)),
    index: Buffer.from(hkdfSync('sha256', master, 'sarena', 'personal-data-lookup', 32)),
  };
}

function current() {
  if (!keys) throw new Error('The data key is not set (setDataKey) before using the database.');
  return keys;
}

export const isSealed = (value: string) => value.startsWith(PREFIX);

export function seal(value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', current().encrypt, iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

/** The value, decrypted. Text saved before encryption was switched on is returned as is (and encrypted on the next start). */
export function unseal(value: string): string {
  if (!isSealed(value)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', current().encrypt, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}

/** A keyed hash to find a row by an encrypted value (emails lower-cased, phones as 8 digits). */
export const lookupIndex = (value: string) => createHmac('sha256', current().index).update(value).digest('base64url');

/** A text column stored encrypted; reads and writes see the plain text. */
export const encryptedText = customType<{ data: string; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => seal(value),
  fromDriver: (value) => unseal(value),
});
