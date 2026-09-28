import { existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type preHandlerHookHandler } from 'fastify';
import { makeGuard } from './auth.ts';
import type { Config } from './config.ts';
import type { Database } from './db/client.ts';
import type { Role } from './db/schema.ts';
import { ApiError } from './lib/errors.ts';
import { LiveHub } from './lib/live.ts';
import { Notifier } from './lib/notifier.ts';
import { createPushSender, type PushSender } from './lib/push.ts';
import { createSmsSender, type SmsSender } from './lib/sms.ts';
import { createTokenService, type TokenService } from './lib/tokens.ts';
import { adminRoutes } from './routes/admin/index.ts';
import { appConfigRoutes } from './routes/app-config.ts';
import { authRoutes } from './routes/auth.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { liveRoutes } from './routes/live.ts';
import { memberRoutes } from './routes/member.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    config: Config;
    tokens: TokenService;
    sms: SmsSender;
    live: LiveHub;
    notifier: Notifier;
    /** `preHandler: app.guard()` (any signed-in user) or `app.guard('admin')`. */
    guard: (...roles: Role[]) => preHandlerHookHandler;
  }
}

export type BuildOptions = {
  config: Config;
  db: Database;
  /** Live-update hub; defaults to a single-process hub. */
  live?: LiveHub;
  /** Push provider; defaults to APNs when configured. */
  push?: PushSender;
  /** Runs the notification scheduler (tests call `app.notifier.tick()` themselves). */
  scheduler?: boolean;
  logger?: boolean;
  rateLimit?: boolean;
};

export async function buildApp({
  config, db, live = new LiveHub(), push, scheduler = config.scheduler, logger = true, rateLimit: limitRequests = true,
}: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger ? { level: config.production ? 'info' : 'debug' } : false,
    trustProxy: true,
    bodyLimit: 1_000_000,
  });

  const tokens = createTokenService(config.jwtSecret, config.tokenTtlDays);
  app.decorate('db', db);
  app.decorate('config', config);
  app.decorate('tokens', tokens);
  app.decorate('sms', createSmsSender(config.sms, app.log));
  app.decorate('guard', makeGuard(db, tokens) as FastifyInstance['guard']);
  app.decorate('live', live);
  const notifier = new Notifier({ db, push: push ?? createPushSender(config, app.log), live, config, log: app.log });
  app.decorate('notifier', notifier);
  app.decorateRequest('auth', null);
  await live.start();
  if (scheduler) app.addHook('onReady', async () => notifier.start());
  // End open event streams first, or closing the server would wait on them.
  app.addHook('preClose', async () => {
    await notifier.stop();
    await live.stop();
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(rateLimit, { global: false, max: limitRequests ? 100 : 1_000_000, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status === 429) {
      return reply.status(429).send({ error: { code: 'too_many_requests', message: 'Too many requests. Please slow down.' } });
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: 'bad_request', message: (error as Error).message } });
    }
    request.log.error(error);
    return reply.status(500).send({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
  });

  app.get('/health', async () => ({ ok: true }));

  const authLimit = limitRequests ? { rateLimit: { max: 10, timeWindow: '1 minute' } } : {};
  await app.register(async (api) => {
    await authRoutes(api, authLimit);
    await catalogRoutes(api);
    await memberRoutes(api);
    await adminRoutes(api);
    await liveRoutes(api);
    await appConfigRoutes(api);
  }, { prefix: '/v1' });

  // Uploaded images, the public website and the admin dashboard (a PWA).
  mkdirSync(config.uploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: config.uploadsDir, prefix: '/uploads/', decorateReply: false, maxAge: '30d', immutable: true,
  });
  if (existsSync(config.dashboardDir)) {
    await app.register(fastifyStatic, { root: config.dashboardDir, prefix: '/admin/', decorateReply: false });
  }
  if (existsSync(config.websiteDir)) {
    await app.register(fastifyStatic, { root: config.websiteDir, prefix: '/' });
  }

  app.setNotFoundHandler(async (request, reply) => {
    // Client-side routes of the dashboard (/admin/venues...) fall back to its index.html.
    const dashboardIndex = join(config.dashboardDir, 'index.html');
    if (request.method === 'GET' && request.url.startsWith('/admin') && existsSync(dashboardIndex)) {
      if (request.url === '/admin') return reply.redirect('/admin/');
      return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(await readFile(dashboardIndex));
    }
    return reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
  });

  return app;
}
