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
import { createWalletSigner, type WalletSigner } from './lib/wallet.ts';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    config: Config;
    tokens: TokenService;
    sms: SmsSender;
    live: LiveHub;
    notifier: Notifier;
    /** Signs Apple Wallet passes; null until the Pass Type ID certificate is configured. */
    wallet: WalletSigner | null;
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
  /** Wallet pass signer; defaults to the certificate in the config (tests pass their own). */
  wallet?: WalletSigner | null;
  /** Runs the notification scheduler (tests call `app.notifier.tick()` themselves). */
  scheduler?: boolean;
  logger?: boolean;
  rateLimit?: boolean;
};

export async function buildApp({
  config, db, live = new LiveHub(), push, wallet, scheduler = config.scheduler, logger = true, rateLimit: limitRequests = true,
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
  app.decorate('wallet', wallet !== undefined ? wallet : loadWallet(config, app.log));
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
        // Off: Safari applies it to http://localhost too, so the website and the
        // control panel would load their files from https://localhost and stay
        // blank. HTTPS is enforced by the proxy in front of the server instead.
        upgradeInsecureRequests: null,
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
    const { url } = request;
    if (request.method === 'GET' && /^\/admin(?=[/?]|$)/i.test(url)) {
      // /admin, /Admin/ or /ADMIN/members (typed by hand, or capitalised by the phone) → /admin/…
      if (!url.startsWith('/admin/')) return reply.redirect(`/admin/${url.slice('/admin'.length).replace(/^\//, '')}`);
      // Client-side routes of the dashboard (/admin/venues...) fall back to its index.html.
      const dashboardIndex = join(config.dashboardDir, 'index.html');
      if (existsSync(dashboardIndex)) {
        return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(await readFile(dashboardIndex));
      }
      return reply.status(503).type('text/html; charset=utf-8').header('Cache-Control', 'no-store').send(DASHBOARD_NOT_BUILT);
    }
    return reply.status(404).send({ error: { code: 'not_found', message: 'Not found.' } });
  });

  return app;
}

/** The Wallet signing identity, or null (feature off) with a log line saying why. */
function loadWallet(config: Config, log: FastifyInstance['log']): WalletSigner | null {
  try {
    const signer = createWalletSigner(config.wallet);
    if (signer) log.info(`Apple Wallet passes are on (${signer.passTypeId}).`);
    return signer;
  } catch (error) {
    log.error(`Apple Wallet passes are off: ${(error as Error).message}`);
    return null;
  }
}

/** Shown at /admin/ when the control panel hasn't been built (`npm start` builds it). */
const DASHBOARD_NOT_BUILT = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sarena · لوحة التحكم</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #FBF6F1; color: #2E2E32; font: 16px/1.7 -apple-system, "Segoe UI", Tahoma, sans-serif; padding: 16px; box-sizing: border-box; }
  main { max-width: 560px; background: #fff; border: 1px solid #F0E3D6; border-radius: 20px; padding: 24px 28px; box-shadow: 0 10px 30px rgba(0,0,0,.06); }
  h1 { font-size: 20px; margin: 0 0 8px; color: #FF7900; }
  code { display: block; direction: ltr; text-align: left; background: #2E2E32; color: #fff; border-radius: 10px; padding: 10px 14px; margin: 10px 0; font: 14px/1.6 ui-monospace, Menlo, monospace; white-space: pre-wrap; }
  hr { border: 0; border-top: 1px solid #F0E3D6; margin: 18px 0; }
  .en { direction: ltr; text-align: left; }
  @media (prefers-color-scheme: dark) { body { background: #121017; color: #EDEDF0; } main { background: #1C1A22; border-color: #2E2B36; } hr { border-color: #2E2B36; } }
</style></head><body><main>
<h1>لوحة التحكم لم تُجهَّز بعد</h1>
<p>الخادم يعمل، لكن ملفات لوحة التحكم لم تُبنَ في هذا المجلد. أوقف الخادم (Ctrl + C) ثم شغّله بهذا الأمر، وسيجهّزها تلقائياً:</p>
<code>cd backend &amp;&amp; npm start</code>
<p>أو ابنِها يدوياً ثم أعد تشغيل الخادم:</p>
<code>cd dashboard &amp;&amp; npm install &amp;&amp; npm run build</code>
<hr>
<div class="en"><h1>The control panel isn't built yet</h1>
<p>The server is running, but the control panel's files haven't been built in this folder. Stop the server (Ctrl + C) and start it with <b>cd backend &amp;&amp; npm start</b>, which builds it automatically, or run <b>cd dashboard &amp;&amp; npm install &amp;&amp; npm run build</b> and restart.</p></div>
</main></body></html>`;
