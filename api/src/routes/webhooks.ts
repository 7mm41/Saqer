import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Ctx } from '../ctx';
import { payments, webhookEvents } from '../db/schema';
import { sha256 } from '../lib/crypto';
import { newId } from '../lib/ids';
import { syncPayment } from '../services/bookings';

/** Payment webhooks: verify the signature, store the event once (idempotency), then re-fetch the truth. */
export function webhookRoutes(app: FastifyInstance, ctx: Ctx) {
  app.post('/api/webhooks/payments', { config: { rawBody: true } }, async (req, reply) => {
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
    const v = ctx.providers.payments.verifyWebhook(req.headers, raw);
    if (!v) return reply.code(401).send({ error: 'invalid_signature' });
    const inserted = await ctx.db
      .insert(webhookEvents)
      .values({ id: newId(), provider: ctx.providers.payments.name, eventId: v.eventId, payloadHash: sha256(raw) })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (!inserted.length) return { ok: true, duplicate: true };
    const p = (await ctx.db.select().from(payments).where(eq(payments.providerRef, v.providerRef)))[0];
    if (p) await syncPayment(ctx, p.id);
    await ctx.db.update(webhookEvents).set({ processedAt: new Date(ctx.clock.now()) }).where(eq(webhookEvents.id, inserted[0]!.id));
    return { ok: true };
  });
}
