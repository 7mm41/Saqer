import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './config';
import type { Db, DbHandle } from './db';
import type { Crypto } from './lib/crypto';
import type { Clock } from './lib/clock';
import type { SettingsService } from './services/settings';
import type { Bus } from './services/bus';
import type { Providers } from './providers';
import type { Storage } from './services/storage';

export interface Ctx {
  db: Db;
  handle: DbHandle;
  config: Config;
  crypto: Crypto;
  clock: Clock;
  log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error' | 'debug'>;
  settings: SettingsService;
  bus: Bus;
  providers: Providers;
  storage: Storage;
}

export interface Actor {
  id: string | null;
  role: 'customer' | 'technician' | 'admin' | 'system';
  adminRole?: 'owner' | 'verifier' | 'support' | 'finance';
  ipHash?: string | null;
}

export const SYSTEM: Actor = { id: null, role: 'system' };
