import { createHash, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I look-alikes

function block(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** `SRN-7KQ4-M2XP` */
export const bookingCode = () => `SRN-${block(4)}-${block(4)}`;

/** `SRN-204851` */
export const memberNumber = () => `SRN-${randomInt(100_000, 1_000_000)}`;

/** 6-digit SMS code. */
export const otpCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export const hashOtp = (phone: string, code: string, pepper: string) =>
  createHash('sha256').update(`${pepper}:${phone}:${code}`).digest('hex');

/** Keeps digits only (Arabic-Indic digits converted) and drops a leading +968 / 00968. */
export function normalizePhone(input: string): string {
  let digits = '';
  for (const char of input) {
    const arabicIndic = '٠١٢٣٤٥٦٧٨٩'.indexOf(char);
    if (arabicIndic >= 0) digits += String(arabicIndic);
    else if (char >= '0' && char <= '9') digits += char;
  }
  for (const prefix of ['00968', '968']) {
    if (digits.startsWith(prefix) && digits.length > 8) return digits.slice(prefix.length);
  }
  return digits;
}

export const isOmaniMobile = (digits: string) => /^[79]\d{7}$/.test(digits);
