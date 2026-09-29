import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

await app.listen({ port: config.port, host: config.host });
const address = config.publicUrl || `http://localhost:${config.port}`;
app.log.info(`Website ${address}/`);
// The control panel's address is secret: only shown on the owner's own computer.
if (!config.production) app.log.info(`Control panel ${address}/${config.panelPath}/`);
if (!existsSync(join(config.dashboardDir, 'index.html'))) {
  app.log.warn(`The control panel isn't built: start the server with "npm start" (it builds it), or run "cd dashboard && npm install && npm run build".`);
}

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
