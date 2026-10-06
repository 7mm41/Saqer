/**
 * Offline demo (D72): the technician app's demo account and the admin panel's demo run with no server, from
 * responses recorded from the real API. Every read must have a recording (no "missing" answers), the demo
 * job must go through every step, and the public PWA must not offer the demo at all.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { photo, URLS } from './helpers';

const misses = (p: Page) => p.evaluate(() => (window as unknown as { __katfDemo?: { misses: string[] } }).__katfDemo?.misses ?? ['no demo loaded']);

test('technician demo: sign in without a server and finish the recorded job', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => localStorage.setItem('katf.lang', 'en'));
  const p = await ctx.newPage();
  await p.goto(`${URLS.TECH_DEMO}/tech/`);
  await p.getByRole('button', { name: 'Open the demo account' }).click();
  await p.waitForURL(/\/tech\/home/);
  await expect(p.getByText('Offline demo — not real data')).toBeVisible();

  // every tab reads only recorded answers
  for (const path of ['jobs', 'earnings', 'account', 'notifications', 'link', 'account/reviews', 'account/documents', 'account/schedule', 'account/profile']) {
    await p.goto(`${URLS.TECH_DEMO}/tech/${path}`);
    await expect(p.locator('main')).toBeVisible();
    await p.waitForLoadState('networkidle');
    expect(await misses(p), path).toEqual([]);
  }

  // the open request, step by step; the customer's side follows a few seconds after each of ours
  await p.goto(`${URLS.TECH_DEMO}/tech/home`);
  await p.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await p.waitForURL(/\/tech\/jobs\//);
  await p.getByRole('button', { name: /on my way/ }).click();
  await p.getByRole('button', { name: '20 min' }).click();
  const chooser = p.waitForEvent('filechooser');
  await p.getByRole('button', { name: /arrived/ }).click();
  await (await chooser).setFiles(photo('door.jpg'));
  await p.getByRole('button', { name: 'Start diagnosis' }).click();
  await p.locator('button.k-chip').first().click();
  await p.locator('input[type="file"]').first().setInputFiles([photo('d1.jpg'), photo('d2.jpg')]);
  await p.getByLabel('Description').first().fill('Gas refill and cleaning');
  await p.getByLabel('Price (OMR)').first().fill('12');
  await p.getByRole('button', { name: 'Send quote to the customer' }).click();
  await expect(p.getByText(/Waiting for the customer/).first()).toBeVisible();
  await expect(p.getByRole('button', { name: 'Work finished' })).toBeVisible({ timeout: 20_000 });
  const inputs = p.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(photo('before.jpg'));
  await inputs.nth(1).setInputFiles(photo('after.jpg'));
  await p.getByRole('button', { name: 'Work finished' }).click();
  await expect(p.getByText(/Confirmed — scheduled for payout/)).toBeVisible({ timeout: 20_000 });

  // anything that was not recorded is refused, and says so
  await p.goto(`${URLS.TECH_DEMO}/tech/home`);
  await p.locator('.k-switch, [role="switch"]').first().click();
  await expect(p.getByText('This is an offline demo: this change is not saved or sent.')).toBeVisible();
  expect(await misses(p)).toEqual([]);

  // leaving the demo goes back to the real sign-in
  await p.getByRole('button', { name: 'Leave demo' }).click();
  await expect(p.getByRole('button', { name: 'Open the demo account' })).toBeVisible();
  await ctx.close();
});

test('admin demo: every page and every recorded detail opens without a server', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => localStorage.setItem('katf.admin.lang', 'en'));
  const p = await ctx.newPage();
  const fx = JSON.parse(readFileSync(new URL('../../../packages/demo/fixtures/admin.json', import.meta.url), 'utf8')) as { responses: Record<string, unknown> };
  const details = Object.keys(fx.responses)
    .map((k) => k.slice(4))
    .filter((path) => /^\/(technicians|bookings|disputes)\/[0-9a-f-]{36}$/.test(path));
  expect(details.length).toBeGreaterThan(5);
  const pages = ['overview', 'applications', 'technicians', 'customers', 'bookings', 'dispatch', 'disputes', 'support', 'reviews', 'payments', 'payouts', 'reports', 'catalog', 'areas', 'legal', 'messaging', 'settings', 'staff', 'security'];
  for (const path of [...pages.map((x) => `/${x}`), ...details]) {
    await p.goto(`${URLS.ADMIN_DEMO}${path}`);
    await expect(p.getByText('Offline demo panel — not real data, nothing is saved')).toBeVisible();
    await p.waitForLoadState('networkidle');
    await expect(p.getByText("Couldn't load."), path).toHaveCount(0);
    expect(await misses(p), path).toEqual([]);
  }
  await ctx.close();
});

test('the public technician app has no demo entry', async ({ page }) => {
  await page.goto(`${URLS.TECH}/tech/`);
  await expect(page.locator('input[type="tel"]')).toBeVisible();
  await expect(page.getByText(/demo account|الحساب التجريبي/)).toHaveCount(0);
  expect(await page.request.get(`${URLS.TECH}/tech/demo/tech.json`).then((r) => r.headers()['content-type'] ?? '')).not.toContain('json');
});
