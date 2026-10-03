import { eq } from 'drizzle-orm';
import { SETTINGS_BY_KEY, defaultSettings, validateSetting, templateVariables } from '@katf/shared';
import type { Db, DbOrTx } from '../db';
import { settings, settingsHistory } from '../db/schema';
import { badRequest, forbidden } from '../lib/errors';

export type Values = Record<string, unknown>;

export const PRIVATE_KEYS = ['registration_allowlist', 'sms_allowlist', 'banks', 'work_status_documents', 'social_links'];

export class SettingsService {
  private cache: Values | null = null;
  private loadedAt = 0;
  /** with a connection pool (pg) other instances may change settings: reload every 30 s */
  constructor(private db: Db, private reloadEveryMs = 0) {}

  async all(): Promise<Values> {
    if (this.cache && (!this.reloadEveryMs || Date.now() - this.loadedAt < this.reloadEveryMs)) return this.cache;
    const rows = await this.db.select().from(settings);
    const v = defaultSettings();
    for (const r of rows) if (r.key in SETTINGS_BY_KEY) v[r.key] = r.value;
    this.cache = v;
    this.loadedAt = Date.now();
    return v;
  }

  invalidate() {
    this.cache = null;
  }

  async get<T = unknown>(key: string): Promise<T> {
    const v = await this.all();
    if (!(key in SETTINGS_BY_KEY)) throw new Error(`unknown setting ${key}`);
    return v[key] as T;
  }

  async int(key: string): Promise<number> {
    return Number(await this.get(key));
  }

  async bool(key: string): Promise<boolean> {
    return Boolean(await this.get(key));
  }

  /** Change a setting, writing history. Business-rule guards live here. */
  async set(tx: DbOrTx, key: string, value: unknown, by: { id: string | null; adminRole?: string }, reason: string, extraCheck?: (key: string, value: unknown) => Promise<void>) {
    const def = SETTINGS_BY_KEY[key];
    if (!def) throw badRequest('unknown_setting');
    if (def.ownerOnly && by.adminRole && by.adminRole !== 'owner') throw forbidden();
    const err = validateSetting(key, value);
    if (err) throw badRequest(err, { key });
    if (!reason?.trim()) throw badRequest('reason_required');
    if (extraCheck) await extraCheck(key, value);
    const current = await this.all();
    const old = current[key];
    const existing = await tx.select().from(settings).where(eq(settings.key, key));
    if (existing.length) await tx.update(settings).set({ value: value as never, updatedBy: by.id, updatedAt: new Date() }).where(eq(settings.key, key));
    else await tx.insert(settings).values({ key, value: value as never, updatedBy: by.id });
    await tx.insert(settingsHistory).values({ key, oldValue: old as never, newValue: value as never, changedBy: by.id, reason });
    if (this.cache) this.cache[key] = value;
    return { old, value };
  }

  /** The values a booking depends on, frozen at creation. */
  async snapshot(): Promise<Values> {
    const v = structuredClone(await this.all());
    // private lists never travel with a booking
    for (const k of PRIVATE_KEYS) delete v[k];
    return v;
  }
}

export { templateVariables };
