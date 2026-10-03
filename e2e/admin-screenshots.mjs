// Visual check of the admin panel (§15). Signs in with email, password and TOTP (enrolling on first run),
// then captures each page in ar/light, ar/dark and en/light at desktop and phone widths.
// Env: ADMIN_URL (…/<admin-path>/), ADMIN_EMAIL, ADMIN_PW, TOTP_FILE (where the enrolled secret is kept, outside the repo).
import { chromium } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.ADMIN_URL ?? 'http://localhost:4000/dev-admin-path-1234567890ab/';
const OUT = process.env.OUT ?? 'shots-admin';
const { ADMIN_EMAIL, ADMIN_PW, TOTP_FILE } = process.env;
const pages = (process.env.PAGES ?? 'overview,applications,technicians,customers,bookings,dispatch,disputes,support,reviews,payments,payouts,reports,catalog,areas,legal,messaging,settings,staff,security').split(',');
mkdirSync(OUT, { recursive: true });

function totp(secret, t = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const problems = [];

// sign in once and reuse the cookies
const login = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p = await login.newPage();
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/signin.png` });
await p.locator('input[type="email"]').fill(ADMIN_EMAIL);
await p.locator('input[type="password"]').fill(ADMIN_PW);
await p.locator('form button[type="submit"]').click();
await p.waitForTimeout(1500);
const codeInput = p.locator('input[autocomplete="one-time-code"]');
if (existsSync(TOTP_FILE)) {
  await codeInput.fill(totp(readFileSync(TOTP_FILE, 'utf8').trim()));
  await p.locator('form button[type="submit"]').click();
} else {
  const secret = (await p.locator('code.k-ltr').first().textContent()).trim();
  writeFileSync(TOTP_FILE, secret, { mode: 0o600 });
  await p.screenshot({ path: `${OUT}/enroll.png` });
  await codeInput.fill(totp(secret));
  await p.locator('form button[type="submit"]').click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/recovery-codes.png` });
  await p.getByRole('button').last().click();
}
await p.waitForURL(/overview/, { timeout: 15000 });
const state = await login.storageState();
await login.close();

for (const c of [
  { locale: 'ar', scheme: 'light', w: 1280 },
  { locale: 'ar', scheme: 'dark', w: 1280 },
  { locale: 'en', scheme: 'light', w: 1280 },
  { locale: 'ar', scheme: 'light', w: 390 },
]) {
  const ctx = await browser.newContext({ storageState: state, viewport: { width: c.w, height: c.w < 500 ? 844 : 900 }, colorScheme: c.scheme });
  await ctx.addInitScript((l) => localStorage.setItem('katf.admin.lang', l), c.locale);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${c.locale}/${c.scheme}/${c.w}: page error ${e.message}`));
  page.on('response', (r) => r.status() >= 500 && problems.push(`${r.status()} ${r.url()}`));
  for (const name of c.w < 500 ? ['overview', 'bookings', 'settings'] : pages) {
    await page.goto(`${BASE}${name}`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`${name} ${c.locale}/${c.w}: horizontal scroll ${overflow}px`);
    await page.screenshot({ path: `${OUT}/${name}-${c.locale}-${c.scheme}-${c.w}.png`, fullPage: c.w > 500 });
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'admin pages OK: no horizontal scroll, no page errors, no 5xx');
