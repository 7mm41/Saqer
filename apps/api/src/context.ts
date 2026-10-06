import type { FastifyBaseLogger } from 'fastify';
import { loadConfig, type Config } from './config';
import { openDb } from './db';
import { Crypto, deriveKeys } from './lib/crypto';
import { systemClock, type Clock } from './lib/clock';
import { SettingsService } from './services/settings';
import { Bus } from './services/bus';
import { makeProviders } from './providers';
import { EncryptedLocalStorage, MemoryStorage } from './services/storage';
import type { Ctx } from './ctx';
import { settings } from './db/schema';
import { eq } from 'drizzle-orm';
// side-effect imports register the timer handlers
import './services/notifications';
import './services/bookings';
import './services/admin';

const consoleLog = { info: console.log, warn: console.warn, error: console.error, debug: () => {} } as unknown as Pick<FastifyBaseLogger, 'info' | 'warn' | 'error' | 'debug'>;

export async function createContext(opts: { config?: Config; memory?: boolean; clock?: Clock; log?: Ctx['log'] } = {}): Promise<Ctx> {
  const config = opts.config ?? loadConfig();
  const handle = await openDb({ url: config.DATABASE_URL, dataDir: config.DATA_DIR, memory: opts.memory });
  const crypto = new Crypto(deriveKeys(config.dataKey, config.previousDataKey));
  const log = opts.log ?? consoleLog;
  const ctx: Ctx = {
    db: handle.db,
    handle,
    config,
    crypto,
    clock: opts.clock ?? systemClock,
    log,
    settings: new SettingsService(handle.db, handle.kind === 'pg' ? 30_000 : 0),
    bus: new Bus(handle),
    providers: makeProviders(config, crypto, (m) => log.info(m)),
    storage: opts.memory ? new MemoryStorage(crypto) : new EncryptedLocalStorage(config.storageDir, crypto),
  };
  await ctx.bus.start();
  await ctx.settings.all();
  await checkKey(ctx);
  return ctx;
}

/** Refuse to start if DATA_KEY changed and existing data cannot be decrypted (§13). */
async function checkKey(ctx: Ctx) {
  const row = (await ctx.db.select().from(settings).where(eq(settings.key, '_key_check')))[0];
  if (!row) {
    await ctx.db.insert(settings).values({ key: '_key_check', value: ctx.crypto.encrypt('katf-key-check') as never });
    return;
  }
  try {
    if (ctx.crypto.decrypt(row.value as string) !== 'katf-key-check') throw new Error('mismatch');
  } catch {
    throw new Error('DATA_KEY cannot decrypt existing data. Refusing to start. Set the correct DATA_KEY (and DATA_KEY_PREVIOUS while rotating).');
  }
}
