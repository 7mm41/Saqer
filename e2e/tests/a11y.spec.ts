/**
 * Accessibility (§14): axe-core on the key screens, Arabic (RTL) and English, light and dark.
 * Fails on serious or critical WCAG 2.1 A/AA violations.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { URLS } from './helpers';

const pages = [
  { name: 'home', url: () => `${URLS.WEB}/` },
  { name: 'book', url: () => `${URLS.WEB}/book` },
  { name: 'join', url: () => `${URLS.WEB}/join` },
  { name: 'protection', url: () => `${URLS.WEB}/protection` },
  { name: 'track', url: () => `${URLS.WEB}/track` },
  { name: 'technician link', url: () => `${URLS.WEB}/t/demo` },
  { name: 'tech app sign-in', url: () => `${URLS.TECH}/tech/` },
  { name: 'admin sign-in', url: () => URLS.ADMIN },
];

async function audit(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const lang of ['ar', 'en'] as const)
  for (const scheme of ['light', 'dark'] as const)
    test(`no serious accessibility violations — ${lang} ${scheme}`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 844 } });
      await ctx.addCookies([{ name: 'katf_lang', value: lang, url: URLS.WEB }]);
      await ctx.addInitScript((l) => {
        try {
          localStorage.setItem('katf.lang', l);
          localStorage.setItem('katf.admin.lang', l);
        } catch {
          /* ignore */
        }
      }, lang);
      const page = await ctx.newPage();
      const problems: string[] = [];
      for (const p of pages) {
        await page.goto(p.url(), { waitUntil: 'load' });
        await page.waitForTimeout(800);
        expect(await page.evaluate(() => document.documentElement.dir)).toBe(lang === 'ar' ? 'rtl' : 'ltr');
        for (const v of await audit(page)) problems.push(`${p.name}: ${v}`);
      }
      await ctx.close();
      expect(problems).toEqual([]);
    });
