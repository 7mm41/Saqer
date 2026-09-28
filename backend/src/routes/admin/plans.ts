import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { plans } from '../../db/schema.ts';
import { ApiError, errors } from '../../lib/errors.ts';
import { live } from '../../lib/live.ts';
import { localized, localizedList, parse, uuidParam } from '../../lib/validation.ts';
import { serializePlanAdmin } from '../../serializers.ts';

const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v)).nullable();

const planBody = z.object({
  name: localized,
  description: localized,
  priceBaisa: z.number().int().min(0).max(10_000_000),
  durationDays: z.number().int().min(1).max(3650),
  perks: localizedList,
  /** Discount: null clears it. */
  promoPriceBaisa: z.number().int().min(0).max(10_000_000).nullable(),
  promoLabel: localized.nullable(),
  promoStartsAt: isoDate,
  promoEndsAt: isoDate,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

function checkPromo(body: Partial<z.infer<typeof planBody>>, current?: { priceBaisa: number }) {
  const price = body.priceBaisa ?? current?.priceBaisa;
  if (body.promoPriceBaisa != null && price !== undefined && body.promoPriceBaisa >= price) {
    throw new ApiError(400, 'validation_failed', 'promoPriceBaisa: the discounted price must be lower than the price.');
  }
  if (body.promoStartsAt && body.promoEndsAt && body.promoEndsAt <= body.promoStartsAt) {
    throw new ApiError(400, 'validation_failed', 'promoEndsAt: the discount must end after it starts.');
  }
}

export async function planAdminRoutes(admin: FastifyInstance) {
  const { db } = admin;
  const adminOnly = { preHandler: admin.guard('admin') };

  admin.get('/plans', adminOnly, async () => {
    const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.createdAt));
    return { plans: rows.map(serializePlanAdmin) };
  });

  admin.post('/plans', adminOnly, async (request, reply) => {
    const body = parse(planBody.partial({
      perks: true, isActive: true, sortOrder: true, promoPriceBaisa: true, promoLabel: true, promoStartsAt: true, promoEndsAt: true,
    }), request.body);
    checkPromo(body);
    const [plan] = await db.insert(plans).values(body).returning();
    admin.live.publish(...live.plansChanged());
    return reply.status(201).send({ plan: serializePlanAdmin(plan!) });
  });

  admin.patch('/plans/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(planBody.partial(), request.body);
    const [current] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
    if (!current) throw errors.notFound('Plan');
    checkPromo(body, current);
    const [plan] = await db.update(plans).set(body).where(eq(plans.id, id)).returning();
    if (!plan) throw errors.notFound('Plan');
    admin.live.publish(...live.plansChanged());
    return { plan: serializePlanAdmin(plan) };
  });
}
