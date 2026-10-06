/**
 * The whole marketplace in real browsers (§15, examples A and B):
 * a customer books the demo technician's link and pays the visit fee; the technician accepts, travels,
 * checks in at the address, diagnoses and quotes; the customer approves and pays the rest; the technician
 * finishes with before/after photos; the customer confirms; the owner sees it all in the admin panel.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { lastOtp, photo, totp, URLS, useEnglish } from './helpers';

test.describe.configure({ mode: 'serial' });

const CUSTOMER_PHONE = `9${String(Date.now()).slice(-7)}`;
const TECH_PHONE = '90000001'; // the labelled demo technician (DEMO_MODE only)
const PIN = { latitude: 23.5869, longitude: 58.1543 }; // Al Khoudh, Seeb (an active launch neighbourhood)

let customer: BrowserContext;
let technician: BrowserContext;
let cPage: Page;
let tPage: Page;
let trackUrl = '';
let code = '';

test.beforeAll(async ({ browser }) => {
  customer = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: PIN, permissions: ['geolocation'] });
  technician = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: PIN, permissions: ['geolocation'] });
  cPage = await customer.newPage();
  tPage = await technician.newPage();
  await useEnglish(cPage);
  await useEnglish(tPage);
});
test.afterAll(async () => {
  await customer.close();
  await technician.close();
});

const next = (p: Page) => p.getByRole('button', { name: /^Next/ }).click();

test('customer books the technician link and pays the visit fee', async ({ request }) => {
  const p = cPage;
  await p.goto(`${URLS.WEB}/t/demo`);
  await expect(p.getByText('Demo data — not real').first()).toBeVisible();
  await p.goto(`${URLS.WEB}/book?t=demo`);

  // 1 service
  await p.locator('label.k-radio-card:has(input[name="problem"])').first().click();
  await p.locator('label.k-radio-card:has(input[name="type"])').first().click();
  await next(p);
  // 2 details
  await p.locator('textarea').first().fill('The AC is not cooling (end-to-end test)');
  await next(p);
  // 3 location
  await p.locator('select').nth(0).selectOption('seeb');
  await p.locator('select').nth(1).selectOption('khoud');
  await next(p);
  // 4 time
  await p.locator('label.k-radio-card:has(input[name="slot"])').first().click();
  await next(p);
  // 5 name + phone OTP
  await p.getByLabel('Your name').fill('Salim');
  await p.locator('input[type="tel"]').fill(CUSTOMER_PHONE);
  await p.getByRole('button', { name: /send the code|send code/i }).click();
  await p.locator('input[autocomplete="one-time-code"]').fill(await lastOtp(request, CUSTOMER_PHONE));
  await expect(p.getByText('Your number is verified')).toBeVisible();
  await next(p);
  // 6 review, consent, pay
  await p.locator('label.k-check input[type="checkbox"]').check({ force: true });
  await p.getByRole('button', { name: /^Pay / }).click();

  // the mock provider's hosted page (clearly a test page; no card details)
  await p.waitForURL(/\/api\/mock-pay\//);
  await p.getByRole('button', { name: 'ادفع (تجريبي)' }).click();
  await p.waitForURL(/\/book\/return/);
  const track = p.getByRole('link', { name: 'Track the booking' }).first();
  await expect(track).toBeVisible({ timeout: 30_000 });
  trackUrl = (await track.getAttribute('href'))!;
  code = /\/b\/([^/?]+)/.exec(trackUrl)![1]!;
  expect(code).toMatch(/^KT-/);
});

test('technician signs in, accepts, travels and checks in at the address', async ({ request }) => {
  const p = tPage;
  await p.goto(`${URLS.TECH}/tech/`);
  await p.locator('input[type="tel"]').fill(TECH_PHONE);
  await p.locator('form button[type="submit"]').click();
  await p.locator('input[autocomplete="one-time-code"]').fill(await lastOtp(request, TECH_PHONE));
  // new technician terms must be accepted before any request is shown (§11): read each one to the end, tick, accept
  await p.waitForURL(/\/tech\/terms/);
  const cards = p.locator('section.k-card').filter({ has: p.getByRole('button', { name: 'Read the full text' }) });
  await expect(cards.first()).toBeVisible();
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    await cards.nth(i).getByRole('button', { name: 'Read the full text' }).click();
    await expect(p.locator('dialog[open] .k-legal-text')).toBeVisible();
    await p.locator('dialog[open] .k-modal-body').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event('scroll'));
    });
    await p.keyboard.press('Escape');
    await cards.nth(i).locator('input[type="checkbox"]').check({ force: true });
  }
  await p.getByRole('button', { name: 'I accept' }).last().click();
  await p.waitForURL(/\/tech\/home/);
  await p.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await p.waitForURL(/\/tech\/jobs\//);
  await expect(p.getByText(code)).toBeVisible();

  await p.getByRole('button', { name: /on my way/ }).click();
  await p.getByRole('button', { name: '20 min' }).click();

  // check-in: camera (file chooser on the web) + GPS inside the geofence
  const chooser = p.waitForEvent('filechooser');
  await p.getByRole('button', { name: /arrived/ }).click();
  await (await chooser).setFiles(photo('door.jpg'));
  await expect(p.getByRole('button', { name: 'Start diagnosis' })).toBeVisible({ timeout: 30_000 });
});

test('technician diagnoses and sends a quote; customer approves and pays the rest', async () => {
  const p = tPage;
  await p.getByRole('button', { name: 'Start diagnosis' }).click();
  await p.locator('button.k-chip').first().click();
  await p.locator('input[type="file"]').first().setInputFiles([photo('d1.jpg'), photo('d2.jpg')]);
  await expect(p.getByText('(2/8)')).toBeVisible({ timeout: 30_000 }); // both uploads finished
  await p.getByLabel('Description').first().fill('Gas refill and cleaning');
  await p.getByLabel('Price (OMR)').first().fill('12');
  await p.getByRole('button', { name: 'Send quote to the customer' }).click();
  await expect(p.getByText(/Waiting for the customer|waiting/i).first()).toBeVisible({ timeout: 30_000 });

  const c = cPage;
  await c.goto(trackUrl.startsWith('http') ? trackUrl : `${URLS.WEB}${trackUrl}`);
  await c.getByRole('button', { name: 'Approve and pay the rest' }).click();
  await c.waitForURL(/\/api\/mock-pay\//);
  await c.getByRole('button', { name: 'ادفع (تجريبي)' }).click();
  await c.waitForURL(new RegExp(`/b/${code}`));
});

test('technician finishes with photos; customer confirms', async () => {
  const p = tPage;
  await p.reload();
  await expect(p.getByRole('button', { name: 'Work finished' })).toBeVisible({ timeout: 30_000 });
  const inputs = p.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(photo('before.jpg'));
  await inputs.nth(1).setInputFiles(photo('after.jpg'));
  await expect(p.getByText('(1/6)')).toHaveCount(2, { timeout: 30_000 }); // before and after uploaded
  await p.getByRole('button', { name: 'Work finished' }).click();
  await expect(p.getByText(/Waiting for the customer to confirm|awaiting/i).first()).toBeVisible({ timeout: 30_000 });

  const c = cPage;
  await c.reload();
  await c.getByRole('button', { name: 'Fixed and everything works' }).click();
  await expect(c.getByText('Scheduled for payout').first()).toBeVisible({ timeout: 30_000 });
  await expect(c.getByText('Work finished').first()).toBeVisible();
  // rate the technician
  await c.getByRole('heading', { name: 'How was the service?' }).scrollIntoViewIfNeeded();
  await c.getByRole('button', { name: '5', exact: true }).click();
  await c.getByRole('button', { name: 'Professional' }).click();
  await c.getByRole('button', { name: 'Send rating' }).click();
  await expect(c.getByRole('button', { name: 'Send rating' })).toHaveCount(0, { timeout: 15_000 });
});

test('owner signs in with TOTP and sees the booking with a balanced ledger', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await useEnglish(p);
  await p.goto(URLS.ADMIN);
  await p.locator('input[type="email"]').fill('owner@example.invalid');
  await p.locator('input[type="password"]').fill(process.env.E2E_OWNER_PW!);
  await p.locator('form button[type="submit"]').click();
  // first sign-in: enrol the authenticator
  const secret = (await p.locator('code.k-ltr').first().textContent())!.trim();
  await p.locator('input[autocomplete="one-time-code"]').fill(totp(secret));
  await p.locator('form button[type="submit"]').click();
  await expect(p.getByText('Recovery codes')).toBeVisible();
  await p.getByRole('button', { name: /saved them/ }).click();
  await p.waitForURL(/overview/);

  await p.goto(`${URLS.ADMIN}bookings?q=${code}`);
  await p.getByText(code).first().click();
  await expect(p.getByText(code).first()).toBeVisible();
  await p.getByRole('tab', { name: 'Money' }).click();
  await expect(p.getByText('Technician net').first()).toBeVisible();

  await p.goto(`${URLS.ADMIN}reports`);
  await expect(p.getByText('Ledger balanced')).toBeVisible();
  await p.goto(`${URLS.ADMIN}security`);
  await p.getByRole('tab', { name: 'Audit log' }).click();
  await expect(p.getByText(/Audit chain intact/)).toBeVisible();
  await ctx.close();
});
