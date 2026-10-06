import { z } from 'zod';

/** Normalise Arabic-Indic digits and strip spaces/dashes. */
export function normaliseDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\s\-()]/g, '');
}

/** Omani mobile: +968 and 8 digits starting with 7 or 9. Returns "+968XXXXXXXX" or null. */
export function normaliseOmanPhone(input: string): string | null {
  let s = normaliseDigits(input);
  if (s.startsWith('+968')) s = s.slice(4);
  else if (s.startsWith('00968')) s = s.slice(5);
  else if (s.startsWith('968') && s.length === 11) s = s.slice(3);
  if (!/^[79]\d{7}$/.test(s)) return null;
  return `+968${s}`;
}

export function maskPhone(phone: string): string {
  return phone.length > 4 ? `${'•'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}` : '••••';
}

/** IBAN mod-97 check (ISO 13616). */
export function ibanChecksumOk(iban: string): boolean {
  const s = iban.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of v) rem = (rem * 10 + Number(digit)) % 97;
  }
  return rem === 1;
}

/** Oman IBAN: starts with OM, 23 characters, valid checksum. */
export function normaliseOmanIban(input: string): string | null {
  const s = normaliseDigits(input).toUpperCase();
  if (!/^OM\d{2}[A-Z0-9]{19}$/.test(s)) return null;
  return ibanChecksumOk(s) ? s : null;
}

export function maskIban(iban: string): string {
  return `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}`;
}

/** Civil number: 8 digits (§6 step 2). */
export function normaliseCivilId(input: string): string | null {
  const s = normaliseDigits(input);
  return /^\d{8}$/.test(s) ? s : null;
}

export function ageOn(dateOfBirth: string, today: Date): number {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [number, number, number];
  let age = today.getUTCFullYear() - y;
  const md = (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
  if (md < m * 100 + d) age -= 1;
  return age;
}

export const zPhone = z.string().transform((v, ctx) => {
  const p = normaliseOmanPhone(v);
  if (!p) {
    ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
    return z.NEVER;
  }
  return p;
});

export const zIban = z.string().transform((v, ctx) => {
  const p = normaliseOmanIban(v);
  if (!p) {
    ctx.addIssue({ code: 'custom', message: 'invalid_iban' });
    return z.NEVER;
  }
  return p;
});

export const zCivilId = z.string().transform((v, ctx) => {
  const p = normaliseCivilId(v);
  if (!p) {
    ctx.addIssue({ code: 'custom', message: 'invalid_civil_id' });
    return z.NEVER;
  }
  return p;
});

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');
export const zBaisa = z.number().int().min(0).max(100_000_000);

/** Words and patterns that move people off the platform (§12). */
const OFF_PLATFORM = [
  /واتس?اب/i,
  /whats\s*app/i,
  /\bwa\.me\b/i,
  /خارج\s*التطبيق/,
  /outside\s+the\s+app/i,
  /https?:\/\/\S+/i,
  /www\.\S+/i,
  /(?:\+?968)?[\s-]*[79](?:[\s-]*\d){7}/,
  /[٠-٩]{8}/,
];

export function maskOffPlatform(text: string): { text: string; flagged: boolean } {
  let flagged = false;
  let out = text;
  for (const re of OFF_PLATFORM) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    out = out.replace(g, () => {
      flagged = true;
      return '•••';
    });
  }
  return { text: out, flagged };
}

/** Distance in metres between two points (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
