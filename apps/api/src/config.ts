import { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().optional(),
  DATA_DIR: z.string().default('.data'),
  DATA_KEY: z.string().optional(),
  DATA_KEY_PREVIOUS: z.string().optional(),
  ADMIN_PATH: z.string().optional(),
  PUBLIC_ORIGIN: z.string().default('http://localhost:3000'),
  TECH_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_ORIGIN: z.string().default('http://localhost:5174'),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  CORS_EXTRA_ORIGINS: z.string().default('capacitor://localhost,https://localhost'),
  TRUST_PROXY_HOPS: z.coerce.number().int().default(0),
  PAYMENT_PROVIDER: z.enum(['mock', 'thawani']).default('mock'),
  THAWANI_BASE_URL: z.string().default('https://uatcheckout.thawani.om'),
  THAWANI_SECRET_KEY: z.string().optional(),
  THAWANI_PUBLISHABLE_KEY: z.string().optional(),
  THAWANI_WEBHOOK_SECRET: z.string().optional(),
  THAWANI_LIVE: bool,
  SMS_PROVIDER: z.enum(['console', 'mock', 'twilio', 'http']).default('console'),
  SMS_SENDER: z.string().default('Katf'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  SMS_HTTP_URL: z.string().optional(),
  SMS_HTTP_TOKEN: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:support@example.invalid'),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_KEY_P8_BASE64: z.string().optional(),
  APNS_PRODUCTION: bool,
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Katf <no-reply@example.invalid>'),
  STORAGE_DIR: z.string().optional(),
  DEMO_MODE: bool,
  ENABLE_DEV_ENDPOINTS: bool,
  RATE_LIMIT_SCALE: z.coerce.number().int().min(1).max(10_000).default(1),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().default(10_000),
  LOG_LEVEL: z.string().default('info'),
  MAP_TILE_URL: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
});

export type Config = z.infer<typeof Env> & { dataKey: Buffer; previousDataKey: Buffer | null; adminPath: string; storageDir: string; corsOrigins: string[] };

function parseKey(raw: string): Buffer {
  const b = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (b.length !== 32) throw new Error('DATA_KEY must be 32 bytes (64 hex characters or base64)');
  return b;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env);
  const dataDir = resolve(e.DATA_DIR);
  let dataKey: Buffer;
  if (e.DATA_KEY) dataKey = parseKey(e.DATA_KEY);
  else if (e.NODE_ENV === 'production') throw new Error('DATA_KEY is required in production');
  else {
    // Development only: a random key kept in the git-ignored data directory.
    mkdirSync(dataDir, { recursive: true });
    const f = join(dataDir, 'dev-data-key');
    if (!existsSync(f)) writeFileSync(f, randomBytes(32).toString('hex'), { mode: 0o600 });
    dataKey = parseKey(readFileSync(f, 'utf8').trim());
  }
  if (e.NODE_ENV === 'production') {
    if (!e.ADMIN_PATH || e.ADMIN_PATH.length < 24) throw new Error('ADMIN_PATH (24+ random characters) is required in production');
    if (e.ENABLE_DEV_ENDPOINTS) throw new Error('ENABLE_DEV_ENDPOINTS cannot be used in production');
    if (e.DEMO_MODE) console.warn('DEMO_MODE is on: demo data is labelled on every screen');
  }
  const adminPath = e.ADMIN_PATH ?? 'dev-admin';
  if (!/^[A-Za-z0-9_-]+$/.test(adminPath)) throw new Error('ADMIN_PATH may contain only letters, digits, - and _');
  return {
    ...e,
    DATA_DIR: dataDir,
    dataKey,
    previousDataKey: e.DATA_KEY_PREVIOUS ? parseKey(e.DATA_KEY_PREVIOUS) : null,
    adminPath,
    storageDir: e.STORAGE_DIR ? resolve(e.STORAGE_DIR) : join(dataDir, 'files'),
    corsOrigins: [e.PUBLIC_ORIGIN, e.TECH_ORIGIN, e.ADMIN_ORIGIN, ...e.CORS_EXTRA_ORIGINS.split(',').map((s) => s.trim())].filter(Boolean),
  };
}
