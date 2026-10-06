import { createContext } from './context';
import { buildApp } from './app';
import { seedProduction } from './seed';
import { startScheduler } from './services/scheduler';
import { ensureDailyJobs } from './services/admin';

const ctx = await createContext();
const app = await buildApp(ctx, { logger: true });
ctx.log = app.log;
await seedProduction(ctx);
await ensureDailyJobs(ctx);
const stop = startScheduler(ctx);
await app.listen({ port: ctx.config.PORT, host: ctx.config.HOST });
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, async () => {
    stop();
    await app.close();
    await ctx.handle.close();
    process.exit(0);
  });
