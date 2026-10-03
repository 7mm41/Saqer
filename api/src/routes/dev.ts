/**
 * Development and end-to-end test helpers. Registered only when ENABLE_DEV_ENDPOINTS=true, which the
 * config refuses in production, and only with the mock SMS provider (nothing real is ever exposed).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { normaliseOmanPhone } from '@katf/shared';
import type { Ctx } from '../ctx';
import { notFound } from '../lib/errors';
import type { MockSms } from '../providers';

export function devRoutes(app: FastifyInstance, ctx: Ctx) {
  if (!ctx.config.ENABLE_DEV_ENDPOINTS || ctx.config.NODE_ENV === 'production' || ctx.providers.sms.name !== 'mock') return;
  const r = app.withTypeProvider<ZodTypeProvider>();
  /** Last SMS sent to a phone (the OTP for browser tests). */
  r.get('/api/dev/last-sms', { schema: { querystring: z.object({ phone: z.string().max(20) }) } }, async (req) => {
    const to = normaliseOmanPhone(req.query.phone);
    const m = (ctx.providers.sms as MockSms).outbox.filter((x) => x.to === to).at(-1);
    if (!m) throw notFound();
    return { body: m.body, code: /\d{4,8}/.exec(m.body)?.[0] ?? null };
  });
}
