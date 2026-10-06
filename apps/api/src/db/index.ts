import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  kind: 'pg' | 'pglite';
  close(): Promise<void>;
  listen?(channel: string, fn: (payload: string) => void): Promise<void>;
  notify?(channel: string, payload: string): Promise<void>;
}

const here = dirname(fileURLToPath(import.meta.url));
export const migrationsFolder = process.env.MIGRATIONS_DIR ?? join(here, '..', '..', 'migrations');

export async function openDb(opts: { url?: string; dataDir?: string; memory?: boolean }): Promise<DbHandle> {
  if (opts.url) {
    const pool = new pg.Pool({ connectionString: opts.url, max: 10 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    const listener = await pool.connect();
    const handlers = new Map<string, ((p: string) => void)[]>();
    listener.on('notification', (m) => handlers.get(m.channel)?.forEach((f) => f(m.payload ?? '')));
    return {
      db,
      kind: 'pg',
      close: async () => {
        listener.release();
        await pool.end();
      },
      listen: async (channel, fn) => {
        handlers.set(channel, [...(handlers.get(channel) ?? []), fn]);
        await listener.query(`LISTEN ${channel.replace(/[^a-z_]/g, '')}`);
      },
      notify: async (channel, payload) => {
        await pool.query('SELECT pg_notify($1, $2)', [channel, payload]);
      },
    };
  }
  let client: PGlite;
  if (opts.memory) client = new PGlite();
  else {
    const dir = join(opts.dataDir ?? '.data', 'pglite');
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzlePglite(client, { schema }) as unknown as Db;
  await migratePglite(db as never, { migrationsFolder });
  return { db, kind: 'pglite', close: () => client.close() };
}

export { schema };
