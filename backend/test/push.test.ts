import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Http2Server, type IncomingHttpHeaders } from 'node:http2';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { decodeProtectedHeader } from 'jose';
import { loadConfig } from '../src/config.ts';
import { devices, type Device } from '../src/db/schema.ts';
import { checkApnsSettings, createPushSender, normalizePem, type PushSender } from '../src/lib/push.ts';
import { ADMIN, createTestApp, type Json } from './support.ts';

const SANDBOX_TOKEN = 'a'.repeat(64);
const PRODUCTION_TOKEN = 'b'.repeat(64);
const DELETED_TOKEN = 'c'.repeat(64);
const TOPIC = 'om.sarena.app';

const quietLog = { info() {}, warn() {}, error() {} } as never;
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

/** A stand-in for one of Apple's two gateways: it knows one token. */
function fakeGateway(knownToken: string, seen: IncomingHttpHeaders[]) {
  const server = createServer();
  server.on('stream', (stream, headers) => {
    seen.push(headers);
    const token = String(headers[':path']).split('/').pop();
    let reply: [number, string | null] = [200, null];
    if (token !== knownToken) reply = [400, 'BadDeviceToken'];
    else if (headers['apns-topic'] !== TOPIC) reply = [400, 'DeviceTokenNotForTopic'];
    stream.respond({ ':status': reply[0] });
    stream.end(reply[1] ? JSON.stringify({ reason: reply[1] }) : '');
  });
  return server;
}

function device(token: string, extra: Partial<Device> = {}): Device {
  return {
    id: token.slice(0, 8), userId: 'u', platform: 'ios', token, locale: 'ar', environment: null, bundleId: null,
    createdAt: new Date(), lastSeenAt: new Date(), ...extra,
  };
}

const message = { title: { en: 'Hi', ar: 'مرحبا' }, body: { en: 'Body', ar: 'نص' } };

describe('APNs sender', () => {
  const sandboxSeen: IncomingHttpHeaders[] = [];
  const productionSeen: IncomingHttpHeaders[] = [];
  let sandbox: Http2Server;
  let production: Http2Server;
  let sender: PushSender;

  before(async () => {
    sandbox = fakeGateway(SANDBOX_TOKEN, sandboxSeen);
    production = fakeGateway(PRODUCTION_TOKEN, productionSeen);
    await Promise.all([sandbox, production].map((server) => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))));
    const url = (server: Http2Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // The key pasted as one line, without its BEGIN/END lines.
    const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
    const config = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), APNS_KEY_ID: 'abc123defg', APNS_TEAM_ID: 'TEAM123456', APNS_KEY: body });
    sender = createPushSender(config, quietLog, { sandbox: url(sandbox), production: url(production) });
  });

  after(async () => {
    await sender.close();
    await Promise.all([sandbox, production].map((server) => new Promise((resolve) => server.close(resolve))));
  });

  test('each phone gets its own gateway, and a wrong guess is corrected', async () => {
    assert.equal(sender.configured, true);
    const result = await sender.send([
      // An older app version: the server guessed production (APNS_PRODUCTION), but it's an Xcode build.
      device(SANDBOX_TOKEN),
      device(PRODUCTION_TOKEN, { environment: 'production' }),
      // The app was deleted: neither gateway knows the token.
      device(DELETED_TOKEN, { environment: 'sandbox' }),
    ], message);

    assert.equal(result.delivered, 2);
    assert.deepEqual(result.environments, [{ token: SANDBOX_TOKEN, environment: 'sandbox' }]);
    assert.deepEqual(result.invalidTokens, [DELETED_TOKEN]);
    assert.deepEqual(result.failures, { BadDeviceToken: 1 });

    const headers = sandboxSeen.find((h) => String(h[':path']).endsWith(SANDBOX_TOKEN))!;
    assert.equal(headers['apns-topic'], TOPIC);
    assert.equal(headers['apns-push-type'], 'alert');
    const jwt = String(headers.authorization).replace('bearer ', '');
    assert.deepEqual(decodeProtectedHeader(jwt), { alg: 'ES256', kid: 'ABC123DEFG' });
  });

  test("the phone's own bundle identifier is the topic", async () => {
    const result = await sender.send([device(SANDBOX_TOKEN, { environment: 'sandbox', bundleId: 'com.someone.else' })], message);
    assert.equal(result.delivered, 0);
    assert.deepEqual(result.failures, { DeviceTokenNotForTopic: 1 });
    assert.deepEqual(result.invalidTokens, []);
    assert.equal(sender.status().recentFailures[0]?.reason, 'DeviceTokenNotForTopic');
  });
});

describe('APNs settings', () => {
  test('a key pasted with \\n, quotes or no BEGIN line still reads', () => {
    const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
    for (const raw of [pem, `"${pem.replaceAll('\n', '\\n')}"`, body]) {
      assert.equal(normalizePem(raw).replace(/\s+/g, ''), pem.replace(/\s+/g, ''));
    }
  });

  test('empty and wrong settings are named', () => {
    const base = { NODE_ENV: 'test' };
    assert.deepEqual(checkApnsSettings(loadConfig(base).apns), { missing: ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY_FILE'], problem: null });
    const noFile = loadConfig({ ...base, APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'TEAM123456', APNS_KEY_FILE: 'certs/nope.p8' }).apns;
    assert.match(checkApnsSettings(noFile).problem!, /APNS_KEY_FILE: there is no file at .*certs\/nope\.p8/);
    const badId = loadConfig({ ...base, APNS_KEY_ID: 'AuthKey_ABC.p8', APNS_TEAM_ID: 'TEAM123456', APNS_KEY: pem }).apns;
    assert.match(checkApnsSettings(badId).problem!, /APNS_KEY_ID/);
  });
});

describe('push in the control panel', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let adminToken: string;

  before(async () => {
    t = await createTestApp();
    adminToken = await t.signIn(ADMIN.email, ADMIN.password);
  });
  after(() => t.close());

  test("phones register with their gateway and bundle identifier; admins can test and see the status", async () => {
    const status = async () => (await t.call('GET', '/v1/admin/push/status', { token: adminToken })).body as Json;
    assert.equal((await status()).devices.mine, 0);
    const none = await t.call('POST', '/v1/admin/push/test', { token: adminToken, body: {} });
    assert.equal(none.status, 409);
    assert.equal(none.body.error.code, 'no_devices');

    const register = await t.call('POST', '/v1/me/devices', {
      token: adminToken, body: { token: SANDBOX_TOKEN, platform: 'ios', locale: 'ar-OM', environment: 'sandbox', bundleId: 'om.sarena.app' },
    });
    assert.equal(register.status, 200);
    const [row] = await t.db.select().from(devices);
    assert.equal(row!.environment, 'sandbox');
    assert.equal(row!.bundleId, 'om.sarena.app');

    const current = await status();
    assert.equal(current.configured, true);
    assert.deepEqual(current.devices, { total: 1, sandbox: 1, production: 0, unknown: 0, mine: 1 });

    const sent = await t.call('POST', '/v1/admin/push/test', { token: adminToken, body: {} });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.delivered, 1);
    assert.deepEqual(sent.body.devices, [{ environment: 'sandbox', ok: true, reason: null }]);
    assert.equal(t.push.sent.at(-1)!.message.title.en, 'Sarena test notification ✅');
  });

  test('a notification no phone accepted shows as failed, with the reason', async () => {
    t.push.invalid.add(SANDBOX_TOKEN);
    const created = await t.call('POST', '/v1/admin/notifications', {
      token: adminToken,
      body: { title: { en: 'Hello', ar: 'مرحبا' }, body: { en: 'Body', ar: 'نص' }, audience: 'all' },
    });
    assert.equal(created.status, 201);
    await t.app.notifier.tick();
    const list = await t.call('GET', '/v1/admin/notifications?q=Hello', { token: adminToken });
    const item = list.body.items[0];
    assert.equal(item.status, 'failed');
    assert.equal(item.recipients, 1);
    assert.equal(item.delivered, 0);
    assert.equal(item.error, 'BadDeviceToken');
    // Apple no longer knows that phone, so it is forgotten.
    assert.equal((await t.db.select().from(devices)).length, 0);
  });
});
