// Visual check of the technician app (§15): sign in as the DEMO technician, then capture key screens
// in ar-RTL light/dark and en-LTR at phone width. Needs the API in DEMO_MODE with the console SMS provider
// writing to API_LOG, and the tech dev server on TECH_URL.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.TECH_URL ?? 'http://127.0.0.1:5173/tech';
const OUT = process.env.OUT ?? 'shots-tech';
const API_LOG = process.env.API_LOG;
const PHONE = process.env.DEMO_PHONE ?? '90000001';
const screens = (process.env.SCREENS ?? '/home,/jobs,/earnings,/link,/account,/account/schedule,/account/documents,/notifications').split(',');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const problems = [];
const otpFromLog = () => {
  const lines = readFileSync(API_LOG, 'utf8').split('\n').reverse();
  for (const l of lines) {
    const m = /:\s*(\d{6})\./.exec(l);
    if (m && l.includes('sms')) return m[1];
  }
  throw new Error('no OTP in log');
};

// sign in once (OTP resend is rate-limited per phone), then reuse the session cookies
let state;
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.locator('input[type="tel"]').first().fill(PHONE);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1200);
  await page.locator('input[autocomplete="one-time-code"]').first().fill(otpFromLog());
  await page.waitForURL(/\/(home|terms)/, { timeout: 10000 });
  // the demo account must accept the current technician terms before it can see the app
  await page.evaluate(async () => {
    const h = { 'content-type': 'application/json', 'x-requested-with': 'katf' };
    const pending = await (await fetch('/api/terms/pending', { headers: h })).json();
    if (pending.length) await fetch('/api/terms/accept', { method: 'POST', headers: h, body: JSON.stringify({ docIds: pending.map((p) => p.id), locale: 'ar' }) });
  });
  state = await ctx.storageState();
  await ctx.close();
}

for (const c of [
  { locale: 'ar', scheme: 'light' },
  { locale: 'ar', scheme: 'dark' },
  { locale: 'en', scheme: 'light' },
]) {
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: c.scheme });
  await anon.addInitScript((l) => localStorage.setItem('katf.lang', l), c.locale);
  const p0 = await anon.newPage();
  await p0.goto(`${BASE}/`, { waitUntil: 'load' });
  await p0.waitForTimeout(1200);
  await p0.screenshot({ path: `${OUT}/welcome-${c.locale}-${c.scheme}.png`, fullPage: true });
  await anon.close();

  const ctx = await browser.newContext({ storageState: state, viewport: { width: 390, height: 844 }, colorScheme: c.scheme, deviceScaleFactor: 1, geolocation: { latitude: 23.67, longitude: 58.19 }, permissions: ['geolocation'] });
  await ctx.addInitScript((l) => localStorage.setItem('katf.lang', l), c.locale);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${c.locale}/${c.scheme}: page error ${e.message}`));
  for (const s of screens) {
    await page.goto(`${BASE}${s}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`${s} ${c.locale}/${c.scheme}: horizontal scroll ${overflow}px`);
    await page.screenshot({ path: `${OUT}/${s.replace(/\//g, '_')}-${c.locale}-${c.scheme}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'tech screens OK: no horizontal scroll, no page errors');
