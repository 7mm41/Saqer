import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { normalizePem } from './lib/push.ts';

const root = resolve(import.meta.dirname, '..');

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/** The .p8 key from APNS_KEY (its text) or APNS_KEY_FILE (a path, relative to backend/ or starting with ~/). */
function readApnsKey(env: NodeJS.ProcessEnv): { privateKey: string; keyError: string | null } {
  if (env.APNS_KEY) return { privateKey: normalizePem(env.APNS_KEY), keyError: null };
  if (!env.APNS_KEY_FILE) return { privateKey: '', keyError: null };
  const file = env.APNS_KEY_FILE.trim().replace(/^["']|["']$/g, '');
  const path = file.startsWith('~/') ? resolve(homedir(), file.slice(2)) : resolve(root, file);
  try {
    return { privateKey: normalizePem(readFileSync(path, 'utf8')), keyError: null };
  } catch {
    return { privateKey: '', keyError: `APNS_KEY_FILE: there is no file at ${path}. Put the AuthKey_XXXXXXXXXX.p8 file there, or write its full path.` };
  }
}

/** The only account that can open the control panel (and also signs in to the app). */
export const OWNER_EMAIL = 'saqer@sarena.tech';

/**
 * The control panel's secret address: https://<domain>/<panelPath>/. Nothing links to
 * it, and only sign-ins made from it can manage anything. ADMIN_PATH when set (the
 * installer writes a random one); in production otherwise derived from JWT_SECRET, so
 * it stays secret and the same across restarts; "admin" for local development.
 */
function panelPath(env: NodeJS.ProcessEnv, production: boolean, jwtSecret: string): string {
  const chosen = env.ADMIN_PATH?.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  if (chosen) {
    if (!/^[a-z0-9-]{12,64}$/.test(chosen)) {
      throw new Error('ADMIN_PATH must be 12–64 lowercase letters, digits or dashes (e.g. the random one the installer writes).');
    }
    return chosen;
  }
  if (!production) return 'admin';
  return createHmac('sha256', jwtSecret).update('sarena-control-panel').digest('hex').slice(0, 24);
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
    /** The owner's email: the only account that can open the control panel. */
    adminEmail: (env.ADMIN_EMAIL ?? OWNER_EMAIL).trim().toLowerCase(),
    /**
     * Optional: sets the owner's password on start. The installer never writes it;
     * it asks for the password (hidden) and stores only its hash in the database.
     */
    adminPassword: env.ADMIN_PASSWORD ?? null,
    panelPath: panelPath(env, production, jwtSecret),
    /** Encrypts personal data in the database (lib/sealed.ts). Never change it once data is stored. */
    dataKey: env.DATA_KEY ?? jwtSecret,
    /** Proxies in front of the server (Caddy = 1): the client's address is taken from the last one. */
    trustProxy: Number(env.TRUST_PROXY ?? 1),
    /** "demo" grants memberships without payment (tests only); off unless set. */
    paymentsMode: (env.PAYMENTS_MODE === 'demo' ? 'demo' : 'disabled') as 'demo' | 'disabled',
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
      keyId: (env.APNS_KEY_ID ?? '').trim().toUpperCase(),
      teamId: (env.APNS_TEAM_ID ?? '').trim().toUpperCase(),
      /** The app's bundle identifier. Phones on current app versions send their own. */
      bundleId: (env.APNS_BUNDLE_ID ?? 'om.sarena.app').trim(),
      ...readApnsKey(env),
      /**
       * The gateway for phones registered by older app versions. Current versions
       * say which one they use (Xcode builds: sandbox; TestFlight / App Store: production).
       */
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
