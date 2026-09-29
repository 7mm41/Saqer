import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase } from '../src/db/client.ts';
import type { Device } from '../src/db/schema.ts';
import { seed } from '../src/db/seed.ts';
import { emptyPushResult, type PushMessage, type PushSender, type PushStatus } from '../src/lib/push.ts';
import type { WalletSigner } from '../src/lib/wallet.ts';

export type Json = Record<string, any>;

export const ADMIN = { email: 'admin@sarena.test', password: 'AdminPass123' };

/** Records pushes instead of calling APNs. */
export class FakePush implements PushSender {
  readonly configured = true;
  readonly sent: { devices: Device[]; message: PushMessage }[] = [];
  invalid = new Set<string>();

  async send(devices: Device[], message: PushMessage) {
    this.sent.push({ devices, message });
    const invalidTokens = devices.map((d) => d.token).filter((t) => this.invalid.has(t));
    const result = emptyPushResult();
    result.invalidTokens = invalidTokens;
    result.delivered = devices.length - invalidTokens.length;
    if (invalidTokens.length) result.failures.BadDeviceToken = invalidTokens.length;
    result.outcomes = devices.map((d) => ({
      token: d.token, ok: !this.invalid.has(d.token), status: this.invalid.has(d.token) ? 400 : 200,
      reason: this.invalid.has(d.token) ? 'BadDeviceToken' : undefined, environment: d.environment ?? 'sandbox',
    }));
    return result;
  }

  status(): PushStatus {
    return { configured: true, missing: [], problem: null, bundleId: 'om.sarena.app', defaultEnvironment: 'sandbox', recentFailures: [] };
  }

  async close() {}

  titles() {
    return this.sent.map((s) => s.message.title.en);
  }
}

export async function createTestApp(options: { wallet?: WalletSigner | null } = {}) {
  const uploadsDir = mkdtempSync(join(tmpdir(), 'sarena-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    UPLOADS_DIR: uploadsDir,
    WEBSITE_DIR: join(uploadsDir, 'no-website'),
    DASHBOARD_DIR: join(uploadsDir, 'no-dashboard'),
  });
  const database = await openDatabase({ inMemory: true });
  await seed(database.db, config, () => {});
  const push = new FakePush();
  const app: FastifyInstance = await buildApp({
    config, db: database.db, logger: false, rateLimit: false, scheduler: false, push, wallet: options.wallet ?? null,
  });

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

  let counter = 0;
  async function register(name = 'Test Member') {
    counter += 1;
    const phone = `7${String(1_000_000 + counter).padStart(7, '0')}`;
    const { status, body } = await call('POST', '/v1/auth/register', {
      body: { fullName: name, email: `n${counter}@example.com`, phone, password: 'Passw0rd!' },
    });
    assert.equal(status, 201, JSON.stringify(body));
    return body as { token: string; user: Json };
  }

  async function close() {
    await app.close();
    await database.close();
    rmSync(uploadsDir, { recursive: true, force: true });
  }

  return { app, db: database.db, push, call, signIn, register, close };
}

/** An instant at `hour`:`minute` Oman time (UTC+4), `days` from today. */
export function omanTime(hour: number, minute = 0, days = 0) {
  const now = new Date(Date.now() + 4 * 3_600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour - 4, minute));
}
