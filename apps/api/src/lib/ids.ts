import { randomInt, randomUUID } from 'node:crypto';

export const newId = () => randomUUID();

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Booking code: prefix + 6 random Crockford base32 characters (D25), e.g. KT-7Q4M2X. */
export function bookingCode(prefix: string): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CROCKFORD[randomInt(32)];
  return `${prefix}-${s}`;
}

export function slugify(name: string): string {
  const latin = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .slice(0, 24);
  let s = '';
  for (let i = 0; i < 4; i++) s += CROCKFORD[randomInt(32)]!.toLowerCase();
  return latin ? `${latin}-${s}` : `t-${s}${randomInt(1000)}`;
}

export function otpCode(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += String(randomInt(10));
  return s;
}
