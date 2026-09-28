import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { LiveBridge } from '../lib/live.ts';
import * as schema from './schema.ts';

const migrationsFolder = resolve(import.meta.dirname, '../../drizzle');

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

export type DatabaseHandle = {
  db: Database;
  close: () => Promise<void>;
  /** Cross-instance live-update transport (Postgres only; PGlite is single-process). */
  liveBridge: LiveBridge | null;
};

const LIVE_CHANNEL = 'sarena_live';

/**
 * LISTEN/NOTIFY on a dedicated connection, so live updates reach clients
 * connected to any API instance. Reconnects if the connection drops.
 */
function postgresBridge(pool: pg.Pool, connectionString: string): LiveBridge {
  return {
    publish: async (payload) => {
      await pool.query('SELECT pg_notify($1, $2)', [LIVE_CHANNEL, payload]);
    },
    subscribe: async (onMessage) => {
      let client: pg.Client | null = null;
      let stopped = false;
      const connect = async () => {
        if (stopped) return;
        const next = new pg.Client({ connectionString });
        next.on('notification', (message) => {
          if (message.channel === LIVE_CHANNEL && message.payload) onMessage(message.payload);
        });
        next.on('error', () => {
          next.end().catch(() => {});
          if (!stopped) setTimeout(() => void connect().catch(() => {}), 2_000);
        });
        await next.connect();
        await next.query(`LISTEN ${LIVE_CHANNEL}`);
        client = next;
      };
      await connect();
      return async () => {
        stopped = true;
        await client?.end().catch(() => {});
      };
    },
  };
}

/**
 * PostgreSQL when `databaseUrl` is set (production); otherwise an embedded
 * PGlite database — real Postgres compiled to WASM — stored in `dataDir`
 * (or in memory for tests). Same SQL, same migrations, zero setup.
 */
export async function openDatabase(options: { databaseUrl?: string; dataDir?: string; inMemory?: boolean }): Promise<DatabaseHandle> {
  if (options.databaseUrl) {
    const pool = new pg.Pool({ connectionString: options.databaseUrl, max: 10 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    // The query API is identical across drivers; the cast unifies the types.
    return {
      db: db as unknown as Database,
      close: () => pool.end(),
      liveBridge: postgresBridge(pool, options.databaseUrl),
    };
  }
  let client: PGlite;
  if (options.inMemory) {
    client = new PGlite();
  } else {
    const dir = resolve(options.dataDir ?? 'data', 'pglite');
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db, close: () => client.close(), liveBridge: null };
}
