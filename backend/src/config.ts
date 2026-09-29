import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export type Config = ReturnType<typeof loadConfig>;

/** All settings come from environment variables (see `.env.example`). */
export function loadConfig(input: NodeJS.ProcessEnv = process.env) {
  // A blank line in .env (`JWT_SECRET=`, as in .env.example) means "not set":
  // without this, an empty secret breaks every sign-in and an empty
  // ADMIN_PASSWORD would lock the dashboard.
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const production = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET ?? (production ? '' : 'dev-only-insecure-secret-change-me');
  if (production && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters in production.');
  }
  return {
    production,
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    /** The address people use (e.g. https://sarena.om); shown in the start-up message. */
    publicUrl: (env.PUBLIC_URL ?? '').replace(/\/$/, ''),
    /** PostgreSQL connection string. Empty = embedded PGlite database in `dataDir`. */
    databaseUrl: env.DATABASE_URL ?? '',
    dataDir: resolve(root, env.DATA_DIR ?? 'data'),
    uploadsDir: resolve(root, env.UPLOADS_DIR ?? 'data/uploads'),
    websiteDir: resolve(root, env.WEBSITE_DIR ?? '../website'),
    dashboardDir: resolve(root, env.DASHBOARD_DIR ?? '../dashboard/dist'),
    jwtSecret,
    tokenTtlDays: Number(env.TOKEN_TTL_DAYS ?? 30),
    adminEmail: (env.ADMIN_EMAIL ?? 'admin@sarena.local').toLowerCase(),
    /** Initial admin password; generated (and printed once) when not provided. */
    adminPassword: env.ADMIN_PASSWORD ?? randomBytes(9).toString('base64url'),
    adminPasswordGenerated: !env.ADMIN_PASSWORD,
    /** Seeds the demo member and accepts the fixed demo SMS code. Never enable in production. */
    demoMode: bool(env.DEMO_MODE, !production),
    /** "demo" grants memberships without payment; anything else requires a real payment integration. */
    paymentsMode: (env.PAYMENTS_MODE ?? (production ? 'disabled' : 'demo')) as 'demo' | 'disabled',
    sms: {
      provider: (env.SMS_PROVIDER ?? 'console') as 'console' | 'twilio',
      twilioAccountSid: env.TWILIO_ACCOUNT_SID ?? '',
      twilioAuthToken: env.TWILIO_AUTH_TOKEN ?? '',
      twilioFrom: env.TWILIO_FROM ?? '',
    },
    links: {
      appStore: env.APP_STORE_URL ?? '',
      googlePlay: env.GOOGLE_PLAY_URL ?? '',
      whatsapp: env.SUPPORT_WHATSAPP ?? '',
      email: env.SUPPORT_EMAIL ?? '',
      instagram: env.INSTAGRAM_URL ?? '',
    },
    /** Apple Push Notification service (token auth with a .p8 key from developer.apple.com). */
    apns: {
      keyId: env.APNS_KEY_ID ?? '',
      teamId: env.APNS_TEAM_ID ?? '',
      bundleId: env.APNS_BUNDLE_ID ?? 'om.sarena.app',
      privateKey: env.APNS_KEY ?? (env.APNS_KEY_FILE ? readFileSync(resolve(root, env.APNS_KEY_FILE), 'utf8') : ''),
      /** false = the sandbox gateway used by Xcode / TestFlight-less development builds. */
      production: bool(env.APNS_PRODUCTION, production),
    },
    /** Apple Wallet passes (membership card, booking codes). Off until all four are set. */
    wallet: {
      passTypeId: env.WALLET_PASS_TYPE_ID ?? '',
      teamId: env.WALLET_TEAM_ID ?? env.APNS_TEAM_ID ?? '',
      organization: env.WALLET_ORGANIZATION ?? 'Sarena',
      certFile: env.WALLET_CERT_FILE ? resolve(root, env.WALLET_CERT_FILE) : '',
      certPassword: env.WALLET_CERT_PASSWORD ?? '',
      wwdrFile: env.WALLET_WWDR_FILE ? resolve(root, env.WALLET_WWDR_FILE) : '',
    },
    /** Oman is UTC+4 all year (no daylight saving). */
    timezoneOffsetMinutes: Number(env.TIMEZONE_OFFSET_MINUTES ?? 240),
    /** Runs automatic notifications and theme changes (turn off on all but one instance if you prefer). */
    scheduler: bool(env.SCHEDULER, true),
  };
}
