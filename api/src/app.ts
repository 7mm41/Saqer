import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import fastifyStatic from '@fastify/static';
import { serializerCompiler, validatorCompiler, jsonSchemaTransform, hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Ctx } from './ctx';
import { AppError } from './lib/errors';
import { readAuth } from './http';
import { publicRoutes } from './routes/public';
import { authRoutes } from './routes/auth';
import { customerRoutes } from './routes/customer';
import { techRoutes } from './routes/tech';
import { adminRoutes } from './routes/admin';
import { webhookRoutes } from './routes/webhooks';
import { devRoutes } from './routes/dev';

/** Strip query strings (tokens) from logged URLs; never log headers or bodies (§13). */
const safeUrl = (u: string) => u.split('?')[0]!.replace(/\/[0-9a-f-]{36}/gi, '/:id');

export async function buildApp(ctx: Ctx, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger
      ? {
          level: ctx.config.LOG_LEVEL,
          serializers: {
            req: (r) => ({ method: r.method, url: safeUrl(r.url) }),
            res: (r) => ({ statusCode: r.statusCode }),
          },
        }
      : false,
    trustProxy: ctx.config.TRUST_PROXY_HOPS > 0 ? (_addr: string, hop: number) => hop < ctx.config.TRUST_PROXY_HOPS : false,
    bodyLimit: 1024 * 1024,
    disableRequestLogging: false,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // keep the raw body for webhook signatures
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as { rawBody: string }).rawBody = body as string;
    if (!body) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new AppError(400, 'invalid_json'), undefined);
    }
  });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || ctx.config.corsOrigins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-requested-with', 'x-device-id', 'x-track-token'],
  });
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: ctx.config.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300 * ctx.config.RATE_LIMIT_SCALE,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
    // hashed admin-panel assets are cheap static files; counting them would lock out an office behind one IP
    allowList: (req) => req.method === 'GET' && req.url.startsWith(`/${ctx.config.adminPath}/assets/`),
    errorResponseBuilder: () => ({ statusCode: 429, error: 'rate_limited' }) });
  await app.register(multipart, { limits: { fileSize: 26 * 1024 * 1024, files: 1, fields: 5 } });
  await app.register(swagger, {
    openapi: { info: { title: 'Katf API', version: '0.1.0' } },
    transform: jsonSchemaTransform,
    hideUntagged: false,
  });

  app.decorateRequest('auth', null);
  app.decorateRequest('viaCookie', false);
  app.addHook('onRequest', async (req) => {
    const admin = req.url.startsWith(`/${ctx.config.adminPath}/`);
    const { claims, viaCookie } = readAuth(ctx, req, admin);
    req.auth = claims;
    req.viaCookie = viaCookie;
    if (claims && claims.role === 'admin' && !admin) req.auth = null; // admin tokens only work on the admin path
  });
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('cache-control', reply.getHeader('cache-control') ?? 'no-store');
    return payload;
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      const first = err.validation[0];
      const msg = (first as { message?: string })?.message;
      const known = msg && /^[a-z_]+$/.test(msg) ? msg : 'invalid_input';
      return reply.code(400).send({ error: known, field: (first as { instancePath?: string })?.instancePath ?? null });
    }
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.code, ...(err.details ? { details: err.details } : {}) });
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return reply.code(429).send({ error: 'rate_limited' });
    if (status && status < 500) return reply.code(status).send({ error: status === 413 ? 'file_size' : 'bad_request' });
    req.log.error({ err: { message: String(err.message).slice(0, 300), code: (err as { code?: string }).code } }, 'unhandled');
    return reply.code(500).send({ error: 'generic' });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found' }));

  publicRoutes(app, ctx);
  authRoutes(app, ctx);
  customerRoutes(app, ctx);
  techRoutes(app, ctx);
  adminRoutes(app, ctx);
  webhookRoutes(app, ctx);
  devRoutes(app, ctx);

  // The admin SPA, only under the secret path. Unknown admin URLs get the same 404 as anything else.
  const adminDist = process.env.ADMIN_DIST ?? join(process.cwd(), '..', 'admin', 'dist');
  if (existsSync(adminDist)) {
    await app.register(fastifyStatic, { root: adminDist, prefix: `/${ctx.config.adminPath}/`, decorateReply: false, index: false, wildcard: false, setHeaders: (reply) => void reply.header('cache-control', 'no-store') });
    const index = async (_req: unknown, reply: { header: (k: string, v: string) => unknown; type: (t: string) => unknown; send: (b: Buffer) => unknown }) => {
      const { readFile } = await import('node:fs/promises');
      reply.header('content-security-policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
      reply.header('x-robots-tag', 'noindex, nofollow');
      reply.type('text/html; charset=utf-8');
      // The build is path-agnostic; the secret path is injected here so it never appears in the files.
      const html = (await readFile(join(adminDist, 'index.html'), 'utf8')).replace('%ADMIN_BASE%', `/${ctx.config.adminPath}/`);
      return reply.send(Buffer.from(html));
    };
    app.get(`/${ctx.config.adminPath}`, index as never);
    app.get(`/${ctx.config.adminPath}/`, index as never);
    for (const p of ['overview', 'applications', 'technicians', 'customers', 'bookings', 'dispatch', 'disputes', 'payments', 'payouts', 'reports', 'catalog', 'areas', 'legal', 'messaging', 'reviews', 'support', 'settings', 'security', 'staff'])
      app.get(`/${ctx.config.adminPath}/${p}*`, index as never);
  }
  return app;
}
