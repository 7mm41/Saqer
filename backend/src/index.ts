import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/client.ts';
import { seed } from './db/seed.ts';
import { LiveHub } from './lib/live.ts';

const config = loadConfig();
const database = await openDatabase({ databaseUrl: config.databaseUrl, dataDir: config.dataDir });
const app = await buildApp({ config, db: database.db, live: new LiveHub(database.liveBridge) });

await seed(database.db, config, (message) => app.log.info(message));
if (!config.databaseUrl) app.log.info(`Using the embedded database in ${config.dataDir}/pglite (set DATABASE_URL for PostgreSQL).`);
if (config.demoMode && config.production) app.log.warn('DEMO_MODE is on in production: turn it off before launch.');

await app.listen({ port: config.port, host: config.host });
const local = `http://localhost:${config.port}`;
app.log.info(`Website ${config.publicUrl || local}/ · control panel ${config.publicUrl || local}/admin/`);

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    app.log.info(`${signal} received, shutting down.`);
    await app.close();
    await database.close();
    process.exit(0);
  });
}
