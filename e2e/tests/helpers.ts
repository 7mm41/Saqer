import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { URLS } from '../playwright.config';

export { URLS };

/** The OTP the mock SMS provider "sent" to this phone (dev endpoint; never available in production). */
export async function lastOtp(request: APIRequestContext, phone: string): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(async () => {
      const r = await request.get(`${URLS.API}/api/dev/last-sms?phone=${phone}`);
      code = r.ok() ? (await r.json()).code : null;
      return code;
    })
    .not.toBeNull();
  return code!;
}

/** A small real JPEG for photo inputs (the API checks magic bytes and re-encodes). */
export const JPEG = readFileSync(new URL('../fixtures/photo.jpg', import.meta.url));
export const photo = (name: string) => ({ name, mimeType: 'image/jpeg', buffer: JPEG });

export function totp(secret: string, t = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

export async function useEnglish(page: Page) {
  await page.context().addCookies([{ name: 'katf_lang', value: 'en', url: URLS.WEB }]);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('katf.lang', 'en');
      localStorage.setItem('katf.admin.lang', 'en');
    } catch {
      /* ignore */
    }
  });
}
