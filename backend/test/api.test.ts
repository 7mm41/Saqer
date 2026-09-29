import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase, type DatabaseHandle } from '../src/db/client.ts';
import { sessions, signInFailures, users } from '../src/db/schema.ts';
import { ownerExists, seed, setOwnerPassword } from '../src/db/seed.ts';
import { hashPassword, verifyPassword } from '../src/lib/passwords.ts';
import { emailIndex } from '../src/lib/people.ts';

const ADMIN = { email: 'admin@sarena.test', password: 'AdminPass123' };
/** The control panel's secret address in these tests. */
const PANEL = 'sarena-panel-test-1234';
/** SMS messages the server "sent", newest last. */
const texts: { phone: string; message: string }[] = [];

let app: FastifyInstance;
let database: DatabaseHandle;
let baseUrl: string;
let uploadsDir: string;

type Json = Record<string, any>;

async function call(method: string, url: string, options: { token?: string; body?: unknown; headers?: Json } = {}) {
  const response = await app.inject({
    method: method as 'GET',
    url,
    headers: { ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...options.headers },
    ...(options.body !== undefined ? { payload: options.body as Json } : {}),
  });
  return { status: response.statusCode, body: (response.body ? response.json() : {}) as Json, headers: response.headers };
}

/** Signs in from the control panel (with its secret address), or from the app with `panel: false`. */
async function signIn(email: string, password: string, { panel = true } = {}): Promise<string> {
  const headers = panel ? { 'x-sarena-panel': PANEL } : {};
  const { status, body } = await call('POST', '/v1/auth/login', { body: { email, password }, headers });
  assert.equal(status, 200, JSON.stringify(body));
  return body.token;
}

let phoneCounter = 0;
async function register(name = 'Test Member') {
  phoneCounter += 1;
  const phone = `9${String(8_000_000 + phoneCounter).padStart(7, '0')}`;
  const { status, body } = await call('POST', '/v1/auth/register', {
    body: { fullName: name, email: `member${phoneCounter}@example.com`, phone, password: 'Passw0rd!' },
  });
  assert.equal(status, 201, JSON.stringify(body));
  return body as { token: string; user: Json; membership: Json | null };
}

/** Reads Server-Sent Events from `/v1/live`. */
/** The member/admin stream, or the public one (`/v1/live/public`) without a token. */
async function openLive(token: string | null) {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/v1/live${token ? '' : '/public'}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {}, signal: controller.signal,
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const events: { event: string; data: Json }[] = [];
  let ended = false;
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (event) events.push({ event, data: data ? JSON.parse(data) : {} });
        }
      }
    } catch {
      // Aborted.
    }
    ended = true;
  })();
  return {
    events,
    get ended() { return ended; },
    /** Resolves once an event with this name (optionally matching `where`) has arrived. */
    async next(name: string, where: (data: Json) => boolean = () => true, timeoutMs = 3000) {
      const started = Date.now();
      for (;;) {
        const found = events.find((e) => e.event === name && where(e.data));
        if (found) {
          events.splice(events.indexOf(found), 1);
          return found.data;
        }
        if (Date.now() - started > timeoutMs) throw new Error(`No "${name}" event within ${timeoutMs} ms; got ${JSON.stringify(events)}`);
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    async waitForEnd(timeoutMs = 3000) {
      const started = Date.now();
      while (!ended) {
        if (Date.now() - started > timeoutMs) throw new Error('Stream did not end');
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    close: async () => {
      controller.abort();
      await pump;
    },
  };
}

before(async () => {
  uploadsDir = mkdtempSync(join(tmpdir(), 'sarena-uploads-'));
  mkdirSync(join(uploadsDir, 'dashboard'));
  writeFileSync(join(uploadsDir, 'dashboard', 'index.html'), '<!doctype html><title>Sarena Admin</title>');
  const config = loadConfig({
    NODE_ENV: 'test',
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    UPLOADS_DIR: uploadsDir,
    WEBSITE_DIR: join(uploadsDir, 'no-website'),
    DASHBOARD_DIR: join(uploadsDir, 'dashboard'),
    PUBLIC_URL: 'https://sarena.test',
    ADMIN_PATH: PANEL,
    PAYMENTS_MODE: 'demo',
  });
  database = await openDatabase({ inMemory: true });
  await seed(database.db, config, () => {});
  app = await buildApp({
    config, db: database.db, logger: false, rateLimit: false, scheduler: false,
    sms: async (phone, message) => { texts.push({ phone, message }); },
  });
  baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
});

after(async () => {
  await app.close();
  await database.close();
  rmSync(uploadsDir, { recursive: true, force: true });
});

describe('configuration', () => {
  test('blank lines in .env count as not set; no password or payment is ever made up', () => {
    const blank = loadConfig({ NODE_ENV: 'development', JWT_SECRET: '', ADMIN_PASSWORD: '', PAYMENTS_MODE: '', PORT: '', PUBLIC_URL: ' ' });
    assert.ok(blank.jwtSecret.length >= 32);
    assert.equal(blank.adminPassword, null);
    assert.equal(blank.adminEmail, 'saqer@sarena.tech');
    assert.equal(blank.paymentsMode, 'disabled');
    assert.equal(blank.panelPath, 'admin');
    assert.equal(blank.port, 3000);
    assert.equal(blank.publicUrl, '');
    assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: '' }), /JWT_SECRET/);
  });

  test('in production the control panel has a secret address', () => {
    const secret = 's'.repeat(40);
    const derived = loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret }).panelPath;
    assert.match(derived, /^[a-f0-9]{24}$/);
    assert.equal(loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret }).panelPath, derived);
    assert.notEqual(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 't'.repeat(40) }).panelPath, derived);
    assert.equal(loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret, ADMIN_PATH: '/My-Panel-2026abc/' }).panelPath, 'my-panel-2026abc');
    assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: secret, ADMIN_PATH: 'short' }), /ADMIN_PATH/);
  });

  test('test and default accounts are removed once; only the owner is an admin', async () => {
    const db = await openDatabase({ inMemory: true });
    try {
      const owner = { NODE_ENV: 'test', ADMIN_EMAIL: 'owner@sarena.test' };
      // Accounts left by older versions: a demo member, a default admin, a second admin.
      for (const [email, role] of [['demo@sarena.om', 'member'], ['admin@sarena.local', 'admin'], ['other@sarena.test', 'admin']] as const) {
        await db.db.insert(users).values({ fullName: email, email, role, passwordHash: await hashPassword('Whatever123'), memberNumber: `SRN-${email.length}${role.length}` });
      }
      const logs: string[] = [];
      await seed(db.db, loadConfig(owner), (m) => logs.push(m));
      assert.deepEqual(await db.db.select().from(users), []);
      assert.match(logs.join('\n'), /Removed 3 test and default accounts/);
      // No owner yet, and no password is made up or printed: it has to be set.
      assert.match(logs.join('\n'), /has no password yet/);
      assert.doesNotMatch(logs.join('\n'), /Whatever123|password: /i);
      assert.equal(await ownerExists(db.db, loadConfig(owner)), false);

      // Later sign-ups stay (the clean-up ran once), but can't be admins.
      await setOwnerPassword(db.db, loadConfig(owner), 'Owner2026pw');
      await db.db.insert(users).values({ fullName: 'Late', email: 'late@sarena.test', role: 'admin', passwordHash: 'x', memberNumber: 'SRN-000001' });
      await seed(db.db, loadConfig(owner), () => {});
      const rows = await db.db.select().from(users);
      assert.deepEqual(rows.map((u) => [u.email, u.role]).sort(), [['late@sarena.test', 'member'], ['owner@sarena.test', 'admin']]);
    } finally {
      await db.close();
    }
  });

  test('the owner: password from npm run admin-password (or ADMIN_PASSWORD), with a membership for the app', async () => {
    const db = await openDatabase({ inMemory: true });
    try {
      const config = loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: 'Saqer@Sarena.tech' });
      const owner = async () => (await db.db.select().from(users).where(eq(users.emailIndex, emailIndex('saqer@sarena.tech'))))[0]!;
      await seed(db.db, config, () => {});
      const created = await setOwnerPassword(db.db, config, 'Chosen2026');
      assert.equal(created.created, true);
      await seed(db.db, config, () => {});
      const account = await owner();
      assert.equal(account.fullName, 'Saqer');
      assert.equal(account.role, 'admin');
      assert.ok(await verifyPassword('Chosen2026', account.passwordHash));
      const { activeMembership } = await import('../src/lib/memberships.ts');
      const membership = await activeMembership(db.db, account.id);
      assert.ok(membership && membership.membership.expiresAt.getTime() > Date.now() + 3000 * 86_400_000);

      // A new password signs the owner out everywhere.
      await db.db.insert(sessions).values({ userId: account.id });
      await setOwnerPassword(db.db, config, 'Changed2026');
      assert.ok((await db.db.select().from(sessions)).every((row) => row.revokedAt));
      assert.ok(await verifyPassword('Changed2026', (await owner()).passwordHash));

      // ADMIN_PASSWORD, if someone sets it, wins on the next start (without being printed).
      const logs: string[] = [];
      await seed(db.db, loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: 'saqer@sarena.tech', ADMIN_PASSWORD: 'FromEnv2026' }), (m) => logs.push(m));
      assert.ok(await verifyPassword('FromEnv2026', (await owner()).passwordHash));
      assert.doesNotMatch(logs.join('\n'), /FromEnv2026/);
      // Only one membership was ever given.
      const { memberships } = await import('../src/db/schema.ts');
      assert.equal((await db.db.select().from(memberships)).length, 1);
    } finally {
      await db.close();
    }
  });
});

/** Rows as stored, without the app decrypting them. */
async function raw<T>(db: DatabaseHandle['db'], query: SQL): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}

describe('personal data at rest', () => {
  test('names, emails, phone numbers and sign-in details are stored encrypted', async () => {
    const { user } = await register('Maryam Al Said');
    await call('POST', '/v1/auth/login', { body: { email: user.email, password: 'Passw0rd!' }, headers: { 'user-agent': 'iPhone Safari', 'x-forwarded-for': '192.0.2.99' } });
    // What a copy of the database would show.
    const [row] = await raw<{ full_name: string; email: string; phone: string; email_index: string }>(database.db,
      sql`select full_name, email, phone, email_index from users where id = ${user.id}`);
    assert.ok(row);
    for (const value of [row.full_name, row.email, row.phone]) assert.match(value, /^enc1:/);
    assert.doesNotMatch(JSON.stringify(row), /Maryam|example\.com|98000/);
    const signIns = await raw<{ ip: string; user_agent: string }>(database.db, sql`select ip, user_agent from sessions where user_id = ${user.id}`);
    for (const session of signIns) {
      assert.match(session.user_agent ?? 'enc1:', /^enc1:/);
      assert.doesNotMatch(JSON.stringify(session), /192\.0\.2|Safari/);
    }
    // The app and the control panel still see them as usual, and search works.
    const admin = await signIn(ADMIN.email, ADMIN.password);
    const found = await call('GET', '/v1/admin/members?q=maryam', { token: admin });
    assert.equal(found.body.items[0].fullName, 'Maryam Al Said');
    assert.equal((await call('GET', `/v1/admin/members?q=${user.phone}`, { token: admin })).body.total, 1);
  });

  test('accounts saved in clear by an earlier version are encrypted on start; a changed key stops the server', async () => {
    const db = await openDatabase({ inMemory: true });
    try {
      const config = loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: 'owner@sarena.test' });
      await seed(db.db, config, () => {});
      await db.db.execute(sql`insert into users (full_name, email, phone, password_hash, member_number) values ('Old Member', 'old@example.com', '91112222', 'x', 'SRN-111111')`);
      const logs: string[] = [];
      await seed(db.db, config, (m) => logs.push(m));
      assert.match(logs.join('\n'), /Encrypted the personal data of 1 accounts/);
      const [stored] = await raw<{ full_name: string; email: string; phone: string }>(db.db, sql`select full_name, email, phone from users where member_number = 'SRN-111111'`);
      assert.ok(stored);
      assert.ok([stored.full_name, stored.email, stored.phone].every((value) => value.startsWith('enc1:')));
      const [old] = await db.db.select().from(users).where(eq(users.emailIndex, emailIndex('OLD@example.com')));
      assert.equal(old!.fullName, 'Old Member');

      await assert.rejects(seed(db.db, loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: 'owner@sarena.test', DATA_KEY: 'another-key' }), () => {}), /another key/);
    } finally {
      await db.close();
    }
  });
});

describe('public', () => {
  test('health and public config', async () => {
    assert.deepEqual((await call('GET', '/health')).body, { ok: true });
    const config = await call('GET', '/v1/public/config');
    assert.equal(config.status, 200);
    assert.ok('appStoreUrl' in config.body.links);
    assert.equal(config.body.reminders.hoursBefore, 5);
  });

  test('a single annual plan at 15 OMR, served with an ETag', async () => {
    const first = await call('GET', '/v1/plans');
    assert.equal(first.status, 200);
    assert.equal(first.body.plans.length, 1);
    assert.equal(first.body.plans[0].priceBaisa, 15_000);
    assert.equal(first.body.plans[0].durationDays, 365);
    const etag = first.headers.etag as string;
    assert.ok(etag);
    const again = await call('GET', '/v1/plans', { headers: { 'if-none-match': etag } });
    assert.equal(again.status, 304);
  });

  test('venues are for signed-in accounts only', async () => {
    const { status, body } = await call('GET', '/v1/venues');
    assert.equal(status, 401);
    assert.equal(body.error.code, 'unauthorized');
  });

  test('pages load their files over plain http (Safari on localhost)', async () => {
    const page = await app.inject({ method: 'GET', url: `/${PANEL}/` });
    const policy = String(page.headers['content-security-policy'] ?? '');
    assert.match(policy, /script-src 'self'/);
    assert.doesNotMatch(policy, /upgrade-insecure-requests/);
  });

  test('the control panel opens only at its secret address', async () => {
    for (const url of ['/admin', '/admin/', '/Admin/', '/admin/venues', '/dashboard/', `/${PANEL}x/`, `/${PANEL.slice(0, -1)}/`]) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 404, url);
      assert.doesNotMatch(response.body, /Sarena Admin/, url);
    }
    const index = await app.inject({ method: 'GET', url: `/${PANEL}/venues` });
    assert.equal(index.statusCode, 200);
    assert.match(String(index.headers['content-type']), /text\/html/);
    assert.match(index.body, /Sarena Admin/);
    // Its files load from under the secret address; search engines skip it.
    assert.match(index.body, new RegExp(`<base href="/${PANEL}/">`));
    assert.equal(index.headers['x-robots-tag'], 'noindex, nofollow');
    assert.equal(index.headers['cache-control'], 'no-store');
    const robots = await app.inject({ method: 'GET', url: '/robots.txt' });
    assert.doesNotMatch(robots.body, new RegExp(PANEL));
  });

  test('the panel address works in any letter case', async () => {
    const upper = PANEL.replace(/^s/, 'S');
    for (const [url, location] of [[`/${upper}/`, `/${PANEL}/`], [`/${PANEL.toUpperCase()}`, `/${PANEL}/`],
      [`/${upper}/members?q=x`, `/${PANEL}/members?q=x`], [`/${PANEL}?tab=1`, `/${PANEL}/?tab=1`]]) {
      const response = await app.inject({ method: 'GET', url: url! });
      assert.equal(response.statusCode, 302, url);
      assert.equal(response.headers.location, location, url);
    }
  });

  test('without a built control panel, its address says how to build it', async () => {
    const config = loadConfig({ NODE_ENV: 'test', UPLOADS_DIR: uploadsDir, DASHBOARD_DIR: join(uploadsDir, 'no-dashboard') });
    const bare = await buildApp({ config, db: database.db, logger: false, rateLimit: false, scheduler: false });
    try {
      const page = await bare.inject({ method: 'GET', url: '/admin/' });
      assert.equal(page.statusCode, 503);
      assert.match(String(page.headers['content-type']), /text\/html/);
      assert.match(page.body, /npm run build/);
      assert.equal((await bare.inject({ method: 'GET', url: '/Admin/' })).headers.location, '/admin/');
    } finally {
      await bare.close();
    }
  });

  test('unknown API routes return a JSON 404', async () => {
    const { status, body } = await call('GET', '/v1/nope');
    assert.equal(status, 404);
    assert.equal(body.error.code, 'not_found');
  });
});

describe('members', () => {
  test('register, browse, subscribe, then book', async () => {
    const { token, user, membership } = await register('Aisha Al Balushi');
    assert.equal(user.role, 'member');
    assert.equal(membership, null);

    const venues = await call('GET', '/v1/venues', { token });
    assert.equal(venues.status, 200);
    assert.equal(venues.body.venues.length, 9);
    const offer = venues.body.venues[0].offers[0];
    assert.ok(offer.memberPriceBaisa < offer.originalPriceBaisa);

    const unchanged = await call('GET', '/v1/venues', { token, headers: { 'if-none-match': venues.headers.etag as string } });
    assert.equal(unchanged.status, 304);

    const blocked = await call('POST', '/v1/bookings', { token, body: { offerId: offer.id, quantity: 2 } });
    assert.equal(blocked.status, 402);
    assert.equal(blocked.body.error.code, 'membership_required');

    const plan = (await call('GET', '/v1/plans')).body.plans[0];
    const subscribed = await call('POST', '/v1/membership/subscribe', { token, body: { planId: plan.id } });
    assert.equal(subscribed.status, 200, JSON.stringify(subscribed.body));
    assert.equal(subscribed.body.membership.status, 'active');
    const days = (Date.parse(subscribed.body.membership.expiresAt) - Date.now()) / 86_400_000;
    assert.ok(days > 364 && days <= 365, `expected a year, got ${days} days`);

    const booked = await call('POST', '/v1/bookings', { token, body: { offerId: offer.id, quantity: 2 } });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    assert.match(booked.body.booking.code, /^SRN-/);
    assert.equal(booked.body.booking.paidTotalBaisa, offer.memberPriceBaisa * 2);
    assert.equal(booked.body.booking.status, 'active');

    const mine = await call('GET', '/v1/me/bookings', { token });
    assert.equal(mine.body.bookings.length, 1);

    const used = await call('POST', `/v1/me/bookings/${booked.body.booking.id}/mark-used`, { token });
    assert.equal(used.body.booking.status, 'used');
    const twice = await call('POST', `/v1/me/bookings/${booked.body.booking.id}/mark-used`, { token });
    assert.equal(twice.status, 404);
  });

  test('renewing extends from the current expiry', async () => {
    const { token } = await register();
    const plan = (await call('GET', '/v1/plans')).body.plans[0];
    const first = await call('POST', '/v1/membership/subscribe', { token, body: { planId: plan.id } });
    const second = await call('POST', '/v1/membership/subscribe', { token, body: { planId: plan.id } });
    assert.equal(second.body.membership.startsAt, first.body.membership.expiresAt);
    const me = await call('GET', '/v1/me', { token });
    assert.equal(me.body.membership.expiresAt, second.body.membership.expiresAt);
  });

  test('registration validates input and rejects duplicates', async () => {
    const bad = await call('POST', '/v1/auth/register', {
      body: { fullName: 'X', email: 'not-an-email', phone: '123', password: 'short' },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'validation_failed');
    const taken = await call('POST', '/v1/auth/register', {
      body: { fullName: 'Someone Else', email: ADMIN.email, phone: '98765432', password: 'Passw0rd!' },
    });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error.code, 'email_taken');
  });

  test('members sign in by email', async () => {
    const { user } = await register('Email Member');
    const wrong = await call('POST', '/v1/auth/login', { body: { email: user.email, password: 'nope' } });
    assert.equal(wrong.status, 401);
    const { body } = await call('POST', '/v1/auth/login', { body: { email: user.email.toUpperCase(), password: 'Passw0rd!' } });
    assert.ok(body.token);
    assert.equal(body.panel, false);
    // A space the phone keyboard added around a pasted password is ignored.
    const spaced = await call('POST', '/v1/auth/login', { body: { email: user.email, password: ' Passw0rd! ' } });
    assert.equal(spaced.status, 200);
    const extra = await call('POST', '/v1/auth/login', { body: { email: user.email, password: 'Passw0rd!x' } });
    assert.equal(extra.status, 401);
  });

  test('members sign in by SMS code; there is no fixed test code', async () => {
    const { user } = await register('Phone Member');
    const requested = await call('POST', '/v1/auth/otp/request', { body: { phone: `+968 ${user.phone}` } });
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    assert.equal(requested.body.codeLength, 6);
    const code = /Sarena code: (\d{6})/.exec(texts.at(-1)!.message)![1]!;
    const tooSoon = await call('POST', '/v1/auth/otp/request', { body: { phone: user.phone } });
    assert.equal(tooSoon.status, 429);
    for (const guess of ['000000', '123456']) {
      if (guess === code) continue;
      const wrong = await call('POST', '/v1/auth/otp/verify', { body: { phone: user.phone, code: guess } });
      assert.equal(wrong.status, 400);
    }
    const arabic = code.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!);
    const verified = await call('POST', '/v1/auth/otp/verify', { body: { phone: user.phone, code: arabic } });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.user.email, user.email);
    const reused = await call('POST', '/v1/auth/otp/verify', { body: { phone: user.phone, code } });
    assert.equal(reused.status, 400);
  });

  test('guessing passwords locks the account for a while, even with the right one', async () => {
    const { user } = await register('Guessed Member');
    // Behind Caddy, the address is the one it adds; each guess here comes from somewhere else.
    const from = (n: number) => ({ 'x-forwarded-for': `203.0.113.${n}` });
    for (let i = 0; i < 5; i++) {
      assert.equal((await call('POST', '/v1/auth/login', { body: { email: user.email, password: `Wrong${i}pass` }, headers: from(i) })).status, 401);
    }
    const locked = await call('POST', '/v1/auth/login', { body: { email: user.email, password: 'Passw0rd!' }, headers: from(9) });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'too_many_attempts');
    assert.match(locked.body.error.message, /15 minutes/);
    // An unknown email answers the same way (nothing tells which emails have accounts).
    for (let i = 0; i < 5; i++) await call('POST', '/v1/auth/login', { body: { email: 'nobody@example.com', password: `Wrong${i}pass` }, headers: from(20 + i) });
    const unknown = await call('POST', '/v1/auth/login', { body: { email: 'nobody@example.com', password: 'x' }, headers: from(30) });
    assert.equal(unknown.body.error.code, 'too_many_attempts');
  });

  test('one address guessing many accounts is stopped too', async () => {
    const { user } = await register('Sprayed Member');
    const from = { 'x-forwarded-for': '198.51.100.7' };
    for (let i = 0; i < 20; i++) {
      await call('POST', '/v1/auth/login', { body: { email: `someone${i}@example.com`, password: 'Guess1234' }, headers: from });
    }
    const blocked = await call('POST', '/v1/auth/login', { body: { email: user.email, password: 'Passw0rd!' }, headers: from });
    assert.equal(blocked.status, 429);
    // Other people are unaffected.
    const elsewhere = await call('POST', '/v1/auth/login', { body: { email: user.email, password: 'Passw0rd!' }, headers: { 'x-forwarded-for': '198.51.100.8' } });
    assert.equal(elsewhere.status, 200);
  });

  test('unknown numbers cannot request a code', async () => {
    const { status, body } = await call('POST', '/v1/auth/otp/request', { body: { phone: '99999999' } });
    assert.equal(status, 404);
    assert.equal(body.error.code, 'phone_not_registered');
  });

  test('members can delete their account', async () => {
    const { token, user } = await register();
    assert.equal((await call('DELETE', '/v1/me', { token })).status, 200);
    assert.equal((await call('GET', '/v1/me', { token })).status, 401);
    const again = await call('POST', '/v1/auth/login', { body: { email: user.email, password: 'Passw0rd!' } });
    assert.equal(again.status, 401);
  });

  test('logging out revokes the token', async () => {
    const { token } = await register();
    assert.equal((await call('GET', '/v1/me', { token })).status, 200);
    assert.equal((await call('POST', '/v1/auth/logout', { token })).status, 200);
    assert.equal((await call('GET', '/v1/me', { token })).status, 401);
  });
});

describe('dashboard', () => {
  let adminToken: string;
  before(async () => {
    adminToken = await signIn(ADMIN.email, ADMIN.password);
  });

  test('members cannot use the dashboard API', async () => {
    const { token } = await register();
    assert.equal((await call('GET', '/v1/admin/stats', { token })).status, 403);
    assert.equal((await call('POST', '/v1/admin/bookings/redeem', { token, body: { code: 'SRN-AAAA-BBBB' } })).status, 403);
  });

  test('overview stats', async () => {
    const { status, body } = await call('GET', '/v1/admin/stats', { token: adminToken });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.members >= 1);
    assert.ok(body.activeMemberships >= 1);
    assert.equal(body.signups.length, 30);
  });

  test('search members and grant a membership', async () => {
    const { user } = await register('Salim Al Hinai');
    const found = await call('GET', '/v1/admin/members?q=Hinai', { token: adminToken });
    assert.equal(found.body.total, 1);
    assert.equal(found.body.items[0].id, user.id);
    assert.equal(found.body.items[0].membership, null);

    const plan = (await call('GET', '/v1/admin/plans', { token: adminToken })).body.plans[0];
    const granted = await call('POST', `/v1/admin/members/${user.id}/memberships`, {
      token: adminToken, body: { planId: plan.id, days: 30 },
    });
    assert.equal(granted.status, 201, JSON.stringify(granted.body));
    assert.equal(granted.body.membership.source, 'admin');

    const detail = await call('GET', `/v1/admin/members/${user.id}`, { token: adminToken });
    assert.equal(detail.body.memberships.length, 1);

    const cancelled = await call('POST', `/v1/admin/memberships/${granted.body.membership.id}/cancel`, { token: adminToken });
    assert.equal(cancelled.body.membership.status, 'cancelled');
    const list = await call('GET', '/v1/admin/memberships?status=cancelled', { token: adminToken });
    assert.ok(list.body.items.some((m: Json) => m.id === granted.body.membership.id));

    // The memberships list searches by the member's name or number.
    const byName = await call('GET', '/v1/admin/memberships?q=hinai', { token: adminToken });
    assert.equal(byName.status, 200, JSON.stringify(byName.body));
    assert.equal(byName.body.total, 1);
    assert.equal(byName.body.items[0].member.id, user.id);
    const byNumber = await call('GET', `/v1/admin/memberships?q=${encodeURIComponent(user.memberNumber)}&status=cancelled`, { token: adminToken });
    assert.equal(byNumber.body.total, 1);
    assert.equal((await call('GET', '/v1/admin/memberships?q=nobody-by-this-name', { token: adminToken })).body.total, 0);
  });

  test('only the owner, signed in from the secret address, can use the control panel', async () => {
    // The same account signed in from the app (no secret) is only a member there.
    const fromApp = await call('POST', '/v1/auth/login', { body: ADMIN });
    assert.equal(fromApp.body.panel, false);
    assert.equal((await call('GET', '/v1/admin/stats', { token: fromApp.body.token })).status, 403);
    assert.equal((await call('GET', '/v1/me', { token: fromApp.body.token })).body.panel, false);
    assert.equal((await call('GET', '/v1/me', { token: adminToken })).body.panel, true);
    // A wrong secret is the same as none.
    const wrongSecret = await call('POST', '/v1/auth/login', { body: ADMIN, headers: { 'x-sarena-panel': 'admin' } });
    assert.equal(wrongSecret.body.panel, false);

    // Any other account, even one marked admin in the database, can't use it.
    const other = await register('Would Be Admin');
    await database.db.update(users).set({ role: 'admin' }).where(eq(users.id, other.user.id));
    const otherToken = await signIn(other.user.email, 'Passw0rd!');
    assert.equal((await call('GET', '/v1/admin/stats', { token: otherToken })).status, 403);
    await database.db.update(users).set({ role: 'member' }).where(eq(users.id, other.user.id));

    // No accounts are made, and no roles given, from the control panel.
    const create = await call('POST', '/v1/admin/members', {
      token: adminToken, body: { fullName: 'Second Admin', email: 'second@sarena.test', password: 'Welcome2026', role: 'admin' },
    });
    assert.equal(create.status, 404);
    const promote = await call('PATCH', `/v1/admin/members/${other.user.id}`, { token: adminToken, body: { role: 'admin' } });
    assert.equal(promote.status, 400);
  });

  test('test accounts can be deleted from the control panel, but not the owner', async () => {
    const test = await register('Old Test Account');
    const removed = await call('DELETE', `/v1/admin/members/${test.user.id}`, { token: adminToken });
    assert.equal(removed.status, 200);
    assert.equal((await call('GET', '/v1/me', { token: test.token })).status, 401);
    const me = (await call('GET', '/v1/me', { token: adminToken })).body.user;
    const owner = await call('DELETE', `/v1/admin/members/${me.id}`, { token: adminToken });
    assert.equal(owner.status, 400);
    assert.equal(owner.body.error.code, 'cannot_delete_owner');
  });

  test("the owner's sign-in history: last panel sign-in, devices, and wrong passwords", async () => {
    const first = await call('POST', '/v1/auth/login', {
      body: ADMIN, headers: { 'x-sarena-panel': PANEL, 'user-agent': 'Safari on iPhone', 'x-forwarded-for': '192.0.2.10' },
    });
    await call('POST', '/v1/auth/login', { body: { ...ADMIN, password: 'NotMine123' }, headers: { 'x-forwarded-for': '192.0.2.66', 'user-agent': 'curl' } });
    const now = await call('POST', '/v1/auth/login', { body: ADMIN, headers: { 'x-sarena-panel': PANEL, 'x-forwarded-for': '192.0.2.11' } });

    const history = await call('GET', '/v1/admin/security/sign-ins', { token: now.body.token });
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.equal(history.body.lastPanelSignIn.ip, '192.0.2.10');
    assert.equal(history.body.lastPanelSignIn.device, 'Safari on iPhone');
    assert.equal(history.body.failuresSinceLastSignIn, 1);
    const [latest, failure] = history.body.items;
    assert.equal(latest.current, true);
    assert.equal(latest.panel, true);
    assert.equal(failure.kind, 'wrong_password');
    assert.equal(failure.ip, '192.0.2.66');
    // Members' wrong passwords aren't kept.
    const member = await register('Forgetful Member');
    await call('POST', '/v1/auth/login', { body: { email: member.user.email, password: 'Nope12345' } });
    assert.ok((await database.db.select().from(signInFailures)).every((row) => row.emailIndex === emailIndex(ADMIN.email)));

    // Every other sign-in can be ended from here; this one stays.
    const ended = await call('POST', '/v1/admin/security/sign-out-others', { token: now.body.token });
    assert.ok(ended.body.ended >= 2);
    assert.equal((await call('GET', '/v1/me', { token: first.body.token })).status, 401);
    assert.equal((await call('GET', '/v1/me', { token: now.body.token })).status, 200);
    adminToken = now.body.token;
  });

  test('the members list shows when each account last signed in', async () => {
    const member = await register('Recent Member');
    const list = await call('GET', `/v1/admin/members?q=${encodeURIComponent(member.user.email)}`, { token: adminToken });
    const row = list.body.items[0];
    assert.ok(Math.abs(Date.parse(row.lastSignInAt) - Date.now()) < 60_000);
    const detail = await call('GET', `/v1/admin/members/${member.user.id}`, { token: adminToken });
    assert.equal(detail.body.member.lastSignInAt, row.lastSignInAt);
  });

  test('suspending a member signs them out everywhere', async () => {
    const { token, user } = await register();
    const suspended = await call('PATCH', `/v1/admin/members/${user.id}`, { token: adminToken, body: { status: 'suspended' } });
    assert.equal(suspended.body.member.status, 'suspended');
    assert.equal((await call('GET', '/v1/me', { token })).status, 401);
    const login = await call('POST', '/v1/auth/login', { body: { email: user.email, password: 'Passw0rd!' } });
    assert.equal(login.status, 403);
    assert.equal(login.body.error.code, 'account_suspended');
  });

  test('admins cannot suspend themselves', async () => {
    const me = await call('GET', '/v1/me', { token: adminToken });
    const { status, body } = await call('PATCH', `/v1/admin/members/${me.body.user.id}`, { token: adminToken, body: { status: 'suspended' } });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'cannot_modify_self');
  });

  test('create an event with an image and a ticket option; members see it', async () => {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'poster.png');
    const upload = await fetch(`${baseUrl}/v1/admin/uploads`, {
      method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: form,
    });
    assert.equal(upload.status, 201);
    const { url } = (await upload.json()) as { url: string };
    // A path on this server, so it survives a change of address (new tunnel, domain).
    assert.match(url, /^\/uploads\/.+\.png$/);
    const served = await fetch(`${baseUrl}${url}`);
    assert.equal(served.status, 200);

    const rejected = new FormData();
    rejected.append('file', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');
    const bad = await fetch(`${baseUrl}/v1/admin/uploads`, {
      method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: rejected,
    });
    assert.equal(bad.status, 415);
    // A page (or script) renamed .png is refused too: the file must really be an image.
    const disguised = new FormData();
    disguised.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'poster.png');
    const fake = await fetch(`${baseUrl}/v1/admin/uploads`, { method: 'POST', headers: { authorization: `Bearer ${adminToken}` }, body: disguised });
    assert.equal(fake.status, 415);
    // Image addresses are uploads or web addresses, never javascript: or data:.
    for (const imageUrl of ['javascript:alert(1)', 'data:text/html,hi', '/v1/admin/stats']) {
      const venue = (await call('GET', '/v1/admin/venues', { token: adminToken })).body.venues[0];
      assert.equal((await call('PATCH', `/v1/admin/venues/${venue.id}`, { token: adminToken, body: { imageUrl } })).status, 400, imageUrl);
    }

    const text = (en: string, ar: string) => ({ en, ar });
    const created = await call('POST', '/v1/admin/venues', {
      token: adminToken,
      body: {
        slug: 'muscat-food-festival', category: 'festivals',
        name: text('Muscat Food Festival', 'مهرجان مسقط للطعام'), area: text('Qurum, Muscat', 'القرم، مسقط'),
        summary: text('Street food from 30 countries.', 'أكلات شعبية من ٣٠ دولة.'),
        about: text('Three nights of food.', 'ثلاث ليالٍ من الطعام.'),
        openingHours: text('6 PM – midnight', '٦ م – ١٢ ص'),
        latitude: 23.61, longitude: 58.47, imageUrl: url,
        eventStartsAt: '2026-12-01T14:00:00.000Z', eventEndsAt: '2026-12-03T20:00:00.000Z',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const venueId = created.body.venue.id;
    const duplicate = await call('POST', '/v1/admin/venues', { token: adminToken, body: { ...created.body.venue, offers: undefined } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'slug_taken');

    const offer = await call('POST', `/v1/admin/venues/${venueId}/offers`, {
      token: adminToken,
      body: { title: text('Entry pass', 'تذكرة دخول'), originalPriceBaisa: 5000, memberPriceBaisa: 3000, remaining: 2 },
    });
    assert.equal(offer.status, 201, JSON.stringify(offer.body));

    const { token } = await register();
    const visible = (await call('GET', '/v1/venues', { token })).body.venues.find((v: Json) => v.id === venueId);
    assert.equal(visible.imageUrl, url);
    assert.equal(visible.offers[0].remaining, 2);

    // Scarcity: only 2 left at the member price.
    const plan = (await call('GET', '/v1/plans')).body.plans[0];
    await call('POST', '/v1/membership/subscribe', { token, body: { planId: plan.id } });
    const tooMany = await call('POST', '/v1/bookings', { token, body: { offerId: offer.body.offer.id, quantity: 3 } });
    assert.equal(tooMany.status, 409);
    assert.equal((await call('POST', '/v1/bookings', { token, body: { offerId: offer.body.offer.id, quantity: 2 } })).status, 201);

    await call('PATCH', `/v1/admin/venues/${venueId}`, { token: adminToken, body: { isPublished: false } });
    assert.equal((await call('GET', `/v1/venues/${venueId}`, { token })).status, 404);
    assert.equal((await call('DELETE', `/v1/admin/venues/${venueId}`, { token: adminToken })).status, 200);
  });

  test('images saved with a localhost address are served as paths', async () => {
    const adminToken = await signIn(ADMIN.email, ADMIN.password);
    const venue = (await call('GET', '/v1/admin/venues', { token: adminToken })).body.venues[0];
    const saved = await call('PATCH', `/v1/admin/venues/${venue.id}`, {
      token: adminToken, body: { imageUrl: 'http://localhost:3000/uploads/old-poster.jpg' },
    });
    assert.equal(saved.body.venue.imageUrl, '/uploads/old-poster.jpg');
    const external = await call('PATCH', `/v1/admin/venues/${venue.id}`, {
      token: adminToken, body: { imageUrl: 'https://cdn.example.com/uploads/poster.jpg' },
    });
    assert.equal(external.body.venue.imageUrl, 'https://cdn.example.com/uploads/poster.jpg');
    await call('PATCH', `/v1/admin/venues/${venue.id}`, { token: adminToken, body: { imageUrl: venue.imageUrl } });
  });

  test('codes are redeemed once', async () => {
    const member = await register();
    const plan = (await call('GET', '/v1/plans')).body.plans[0];
    await call('POST', '/v1/membership/subscribe', { token: member.token, body: { planId: plan.id } });
    const offerId = (await call('GET', '/v1/venues', { token: member.token })).body.venues[1].offers[0].id;
    const { code } = (await call('POST', '/v1/bookings', { token: member.token, body: { offerId, quantity: 1 } })).body.booking;

    const redeemed = await call('POST', '/v1/admin/bookings/redeem', { token: adminToken, body: { code: code.toLowerCase() } });
    assert.equal(redeemed.status, 200, JSON.stringify(redeemed.body));
    assert.equal(redeemed.body.booking.status, 'used');
    assert.equal(redeemed.body.member.fullName, 'Test Member');

    const again = await call('POST', '/v1/admin/bookings/redeem', { token: adminToken, body: { code } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'already_used');
  });

  test('plans can be edited', async () => {
    const plan = (await call('GET', '/v1/admin/plans', { token: adminToken })).body.plans[0];
    const updated = await call('PATCH', `/v1/admin/plans/${plan.id}`, { token: adminToken, body: { priceBaisa: 14_000 } });
    assert.equal(updated.body.plan.priceBaisa, 14_000);
    await call('PATCH', `/v1/admin/plans/${plan.id}`, { token: adminToken, body: { priceBaisa: 15_000 } });
  });
});

describe('live updates', () => {
  test('dashboard edits reach open apps without signing in again', async () => {
    const adminToken = await signIn(ADMIN.email, ADMIN.password);
    const member = await register();
    const stream = await openLive(member.token);
    const dashboard = await openLive(adminToken);
    try {
      await stream.next('ready');
      await dashboard.next('ready');

      const venue = (await call('GET', '/v1/admin/venues', { token: adminToken })).body.venues[0];
      await call('PATCH', `/v1/admin/venues/${venue.id}`, { token: adminToken, body: { isFeatured: !venue.isFeatured } });
      await stream.next('catalog');
      assert.equal((await dashboard.next('admin', (d) => d.topic === 'catalog')).topic, 'catalog');

      const offer = venue.offers[0];
      await call('PATCH', `/v1/admin/offers/${offer.id}`, { token: adminToken, body: { memberPriceBaisa: offer.memberPriceBaisa - 100 } });
      await stream.next('catalog');

      const plan = (await call('GET', '/v1/admin/plans', { token: adminToken })).body.plans[0];
      await call('PATCH', `/v1/admin/plans/${plan.id}`, { token: adminToken, body: { perks: plan.perks } });
      await stream.next('plans');

      await call('POST', `/v1/admin/members/${member.user.id}/memberships`, { token: adminToken, body: { planId: plan.id } });
      await stream.next('membership');
      await dashboard.next('admin', (d) => d.topic === 'memberships');

      // Other members only get their own events.
      const other = await register();
      await call('POST', `/v1/admin/members/${other.user.id}/memberships`, { token: adminToken, body: { planId: plan.id } });
      await dashboard.next('admin', (d) => d.topic === 'memberships');
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(stream.events.filter((e) => e.event === 'membership').length, 0);

      const { booking } = (await call('POST', '/v1/bookings', { token: member.token, body: { offerId: offer.id, quantity: 1 } })).body;
      await dashboard.next('admin', (d) => d.topic === 'bookings');
      await stream.next('bookings');
      await call('POST', '/v1/admin/bookings/redeem', { token: adminToken, body: { code: booking.code } });
      await stream.next('bookings');

      // Signing out closes the device's stream.
      await call('POST', '/v1/auth/logout', { token: member.token });
      assert.deepEqual(await stream.next('account'), { revoked: true });
      await stream.waitForEnd();

      const refused = await fetch(`${baseUrl}/v1/live`, { headers: { authorization: `Bearer ${member.token}` } });
      assert.equal(refused.status, 401);
      await refused.body?.cancel();
    } finally {
      await stream.close();
      await dashboard.close();
    }
  });

  test('the public stream carries public changes only', async () => {
    const adminToken = await signIn(ADMIN.email, ADMIN.password);
    const guest = await openLive(null);
    try {
      await guest.next('ready');
      const venue = (await call('GET', '/v1/admin/venues', { token: adminToken })).body.venues[0];
      await call('PATCH', `/v1/admin/venues/${venue.id}`, { token: adminToken, body: { isFeatured: !venue.isFeatured } });
      await guest.next('catalog');
      const plan = (await call('GET', '/v1/admin/plans', { token: adminToken })).body.plans[0];
      await call('PATCH', `/v1/admin/plans/${plan.id}`, { token: adminToken, body: { perks: plan.perks } });
      await guest.next('plans');
      const member = await register();
      await call('POST', `/v1/admin/members/${member.user.id}/memberships`, { token: adminToken, body: { planId: plan.id } });
      await new Promise((r) => setTimeout(r, 150));
      assert.deepEqual(guest.events.filter((e) => ['membership', 'admin', 'bookings', 'account'].includes(e.event)), []);
    } finally {
      await guest.close();
    }
  });

  test('suspension closes the member stream', async () => {
    const adminToken = await signIn(ADMIN.email, ADMIN.password);
    const member = await register();
    const stream = await openLive(member.token);
    try {
      await stream.next('ready');
      await call('PATCH', `/v1/admin/members/${member.user.id}`, { token: adminToken, body: { status: 'suspended' } });
      await stream.next('account', (d) => d.revoked === true);
      await stream.waitForEnd();
    } finally {
      await stream.close();
    }
  });
});
