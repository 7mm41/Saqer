// Visual check (§15): key screens in ar-RTL / en-LTR, light / dark, 390 px and 1280 px.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? 'shots';
const pages = (process.env.PAGES ?? '/,/book,/join,/protection').split(',');
const combos = [
  { locale: 'ar', scheme: 'light', width: 390 },
  { locale: 'ar', scheme: 'dark', width: 390 },
  { locale: 'en', scheme: 'light', width: 1280 },
  { locale: 'ar', scheme: 'light', width: 1280 },
];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const problems = [];
for (const c of combos) {
  const ctx = await browser.newContext({ viewport: { width: c.width, height: c.width < 500 ? 844 : 900 }, colorScheme: c.scheme, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: 'katf_lang', value: c.locale, url: BASE }]);
  const page = await ctx.newPage();
  for (const p of pages) {
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) problems.push(`${p} ${c.locale} ${c.width}px: horizontal scroll ${overflow}px`);
    const name = `${OUT}/${p.replace(/\//g, '_') || '_home'}-${c.locale}-${c.scheme}-${c.width}.png`;
    await page.screenshot({ path: name, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join('\n') : 'no horizontal scroll');
