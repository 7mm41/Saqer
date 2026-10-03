import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Ctx } from '../ctx';
import { users, technicians } from '../db/schema';
import { unauthorized } from '../lib/errors';
import { logout, logoutEverywhere, refresh, requestOtp, verifyOtp } from '../services/auth';
import { actorOf, assertCsrf, clearSessionCookies, COOKIE, deviceId, setSessionCookies } from '../http';
import { ensureTechnician } from '../services/technicians';
import { maskPhone } from '@katf/shared';

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const role = z.enum(['customer', 'technician']);

  r.post('/api/auth/otp/request', { schema: { body: z.object({ phone: z.string().max(30), role }) }, config: { rateLimit: { max: 10 * ctx.config.RATE_LIMIT_SCALE, timeWindow: '10 minutes' } } }, async (req) => {
    const t0 = Date.now();
    const res = await requestOtp(ctx, { phone: req.body.phone, role: req.body.role, ip: req.ip });
    // constant-ish response time (decoy delay)
    const wait = 400 - (Date.now() - t0);
    if (wait > 0 && ctx.config.NODE_ENV !== 'test') await new Promise((r) => setTimeout(r, wait));
    return res;
  });

  r.post(
    '/api/auth/otp/verify',
    {
      schema: { body: z.object({ challengeId: z.string().uuid(), phone: z.string().max(30), code: z.string().min(4).max(8), role, deviceLabel: z.string().max(120).optional(), locale: z.enum(['ar', 'en']).optional(), tokenMode: z.enum(['cookie', 'bearer']).default('cookie') }) },
      config: { rateLimit: { max: 20 * ctx.config.RATE_LIMIT_SCALE, timeWindow: '10 minutes' } },
    },
    async (req, reply) => {
      const dev = deviceId(req, reply, ctx);
      const t = await verifyOtp(ctx, { ...req.body, deviceId: dev, ip: req.ip, deviceLabel: req.body.deviceLabel ?? String(req.headers['user-agent'] ?? '').slice(0, 120) });
      if (req.body.role === 'technician') await ensureTechnician(ctx, t.userId);
      if (req.body.tokenMode === 'cookie') {
        setSessionCookies(reply, ctx, t);
        return { userId: t.userId, isNew: t.isNew, accessExp: t.accessExp };
      }
      return { userId: t.userId, isNew: t.isNew, accessToken: t.accessToken, accessExp: t.accessExp, refreshToken: t.refreshToken };
    },
  );

  r.post('/api/auth/refresh', { schema: { body: z.object({ refreshToken: z.string().optional() }).optional() } }, async (req, reply) => {
    const fromBody = req.body?.refreshToken;
    const token = fromBody ?? req.cookies[COOKIE.refresh];
    if (!token) throw unauthorized('session_expired');
    if (!fromBody && req.headers['x-requested-with'] !== 'katf') throw unauthorized('csrf');
    const dev = deviceId(req, reply, ctx);
    const t = await refresh(ctx, token, dev);
    if (!fromBody) {
      setSessionCookies(reply, ctx, t);
      return { accessExp: t.accessExp };
    }
    return { accessToken: t.accessToken, accessExp: t.accessExp, refreshToken: t.refreshToken };
  });

  r.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) {
      assertCsrf(req);
      await logout(ctx, req.auth.sid);
    }
    clearSessionCookies(reply, ctx);
    return { ok: true };
  });

  r.post('/api/auth/logout-all', async (req, reply) => {
    const a = actorOf(req, ctx);
    assertCsrf(req);
    await logoutEverywhere(ctx, a.id);
    clearSessionCookies(reply, ctx);
    return { ok: true };
  });

  r.get('/api/me', async (req) => {
    const a = actorOf(req, ctx);
    const u = (await ctx.db.select().from(users).where(eq(users.id, a.id)))[0];
    if (!u || u.status !== 'active') throw unauthorized();
    const t = a.role === 'technician' ? (await ctx.db.select({ status: technicians.status }).from(technicians).where(eq(technicians.userId, a.id)))[0] : null;
    return {
      id: u.id,
      role: u.role,
      name: u.displayName,
      email: u.emailEnc ? ctx.crypto.decrypt(u.emailEnc) : null,
      phoneMasked: u.phoneEnc ? maskPhone(ctx.crypto.decrypt(u.phoneEnc)) : null,
      locale: u.locale,
      marketingConsent: u.marketingConsent,
      technicianStatus: t?.status ?? null,
    };
  });
}
