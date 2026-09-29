import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase, type DatabaseHandle } from '../src/db/client.ts';
import { users } from '../src/db/schema.ts';
import { DEMO_MEMBER, seed } from '../src/db/seed.ts';
import { hashPassword, verifyPassword } from '../src/lib/passwords.ts';

const ADMIN = { email: 'admin@sarena.test', password: 'AdminPass123' };

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

async function signIn(email: string, password: string): Promise<string> {
  const { status, body } = await call('POST', '/v1/auth/login', { body: { email, password } });
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
  });
  database = await openDatabase({ inMemory: true });
  await seed(database.db, config, () => {});
  app = await buildApp({ config, db: database.db, logger: false, rateLimit: false, scheduler: false });
  baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
});

after(async () => {
  await app.close();
  await database.close();
  rmSync(uploadsDir, { recursive: true, force: true });
});

describe('configuration', () => {
  test('blank lines in .env count as not set', () => {
    const blank = loadConfig({ NODE_ENV: 'development', JWT_SECRET: '', ADMIN_PASSWORD: '', PAYMENTS_MODE: '', PORT: '', PUBLIC_URL: ' ' });
    assert.ok(blank.jwtSecret.length >= 32);
    assert.ok(blank.adminPassword.length >= 8);
    assert.equal(blank.adminPasswordGenerated, true);
    assert.equal(blank.paymentsMode, 'demo');
    assert.equal(blank.port, 3000);
    assert.equal(blank.publicUrl, '');
    assert.throws(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: '' }), /JWT_SECRET/);
  });

  test('ADMIN_PASSWORD recovers the admin, and a blank admin password is replaced', async () => {
    const db = await openDatabase({ inMemory: true });
    try {
      const passwordOf = async () => (await db.db.select().from(users).where(eq(users.email, 'owner@sarena.test')))[0]!.passwordHash;
      const logs: string[] = [];
      await seed(db.db, loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: 'owner@sarena.test', ADMIN_PASSWORD: 'FirstPass123' }), () => {});
      assert.ok(await verifyPassword('FirstPass123', await passwordOf()));

      await seed(db.db, loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: 'owner@sarena.test', ADMIN_PASSWORD: 'NewPass4567' }), () => {});
      assert.ok(await verifyPassword('NewPass4567', await passwordOf()));

      // Created by an older version from a blank ADMIN_PASSWORD line.
      await db.db.update(users).set({ passwordHash: await hashPassword('') }).where(eq(users.email, 'owner@sarena.test'));
      await seed(db.db, loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: 'owner@sarena.test', ADMIN_PASSWORD: '' }), (m) => logs.push(m));
      const generated = /owner@sarena\.test: (\S+)/.exec(logs.join('\n'))?.[1];
      assert.ok(generated, logs.join('\n'));
      assert.ok(await verifyPassword(generated!, await passwordOf()));

      // Without ADMIN_PASSWORD a working password is left alone.
      logs.length = 0;
      await seed(db.db, loadConfig({ NODE_ENV: 'test', ADMIN_EMAIL: 'owner@sarena.test' }), (m) => logs.push(m));
      assert.ok(await verifyPassword(generated!, await passwordOf()));
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

  test('dashboard routes fall back to its index.html', async () => {
    const index = await app.inject({ method: 'GET', url: '/admin/venues' });
    assert.equal(index.statusCode, 200);
    assert.match(String(index.headers['content-type']), /text\/html/);
    assert.match(index.body, /Sarena Admin/);
    const redirect = await app.inject({ method: 'GET', url: '/admin' });
    assert.equal(redirect.statusCode, 302);
    assert.equal(redirect.headers.location, '/admin/');
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
      body: { fullName: 'Someone Else', email: DEMO_MEMBER.email, phone: '98765432', password: 'Passw0rd!' },
    });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error.code, 'email_taken');
  });

  test('demo member signs in by email, with an active membership', async () => {
    const wrong = await call('POST', '/v1/auth/login', { body: { email: DEMO_MEMBER.email, password: 'nope' } });
    assert.equal(wrong.status, 401);
    const { body } = await call('POST', '/v1/auth/login', { body: { email: 'Demo@Sarena.om', password: DEMO_MEMBER.password } });
    assert.ok(body.token);
    assert.equal(body.membership.status, 'active');
  });

  test('demo member signs in by SMS code', async () => {
    const requested = await call('POST', '/v1/auth/otp/request', { body: { phone: '+968 9123 4567' } });
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    assert.equal(requested.body.codeLength, 6);
    const tooSoon = await call('POST', '/v1/auth/otp/request', { body: { phone: '91234567' } });
    assert.equal(tooSoon.status, 429);
    const wrong = await call('POST', '/v1/auth/otp/verify', { body: { phone: '91234567', code: '000000' } });
    assert.equal(wrong.status, 400);
    const verified = await call('POST', '/v1/auth/otp/verify', { body: { phone: '91234567', code: '١٢٣٤٥٦' } });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(verified.body.user.email, DEMO_MEMBER.email);
    const reused = await call('POST', '/v1/auth/otp/verify', { body: { phone: '91234567', code: '123456' } });
    assert.equal(reused.status, 400);
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

  test('admins create admin and staff accounts', async () => {
    const created = await call('POST', '/v1/admin/members', {
      token: adminToken, body: { fullName: 'Second Admin', email: 'Second.Admin@Sarena.test', phone: '', password: 'Welcome2026', role: 'admin' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.member.role, 'admin');
    assert.equal(created.body.member.email, 'second.admin@sarena.test');
    assert.equal(created.body.member.phone, ''); // none (serialized as empty)

    // The new admin signs in to the dashboard straight away.
    const token = await signIn('second.admin@sarena.test', 'Welcome2026');
    assert.equal((await call('GET', '/v1/admin/stats', { token })).status, 200);

    const staff = await call('POST', '/v1/admin/members', {
      token, body: { fullName: 'Gate Staff', email: 'gate@sarena.test', phone: '9123 9876', password: 'Gate12345', role: 'staff' },
    });
    assert.equal(staff.status, 201, JSON.stringify(staff.body));
    assert.equal(staff.body.member.phone, '91239876');

    const duplicate = await call('POST', '/v1/admin/members', {
      token, body: { fullName: 'Again', email: 'gate@sarena.test', password: 'Gate12345', role: 'staff' },
    });
    assert.equal(duplicate.status, 409);
    const weak = await call('POST', '/v1/admin/members', {
      token, body: { fullName: 'Weak', email: 'weak@sarena.test', password: 'short', role: 'admin' },
    });
    assert.equal(weak.status, 400);
    const member = await register();
    const refused = await call('POST', '/v1/admin/members', {
      token: member.token, body: { fullName: 'Sneaky', email: 'sneaky@sarena.test', password: 'Sneaky2026', role: 'admin' },
    });
    assert.equal(refused.status, 403);
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

  test('staff redeem codes once', async () => {
    const member = await register();
    const plan = (await call('GET', '/v1/plans')).body.plans[0];
    await call('POST', '/v1/membership/subscribe', { token: member.token, body: { planId: plan.id } });
    const offerId = (await call('GET', '/v1/venues', { token: member.token })).body.venues[1].offers[0].id;
    const { code } = (await call('POST', '/v1/bookings', { token: member.token, body: { offerId, quantity: 1 } })).body.booking;

    const staff = await register('Venue Cashier');
    await call('PATCH', `/v1/admin/members/${staff.user.id}`, { token: adminToken, body: { role: 'staff' } });
    const redeemed = await call('POST', '/v1/admin/bookings/redeem', { token: staff.token, body: { code: code.toLowerCase() } });
    assert.equal(redeemed.status, 200, JSON.stringify(redeemed.body));
    assert.equal(redeemed.body.booking.status, 'used');
    assert.equal(redeemed.body.member.fullName, 'Test Member');

    const again = await call('POST', '/v1/admin/bookings/redeem', { token: staff.token, body: { code } });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'already_used');
    assert.equal((await call('GET', '/v1/admin/stats', { token: staff.token })).status, 403);
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
