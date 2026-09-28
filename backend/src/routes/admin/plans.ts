import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { plans } from '../../db/schema.ts';
import { errors } from '../../lib/errors.ts';
import { live } from '../../lib/live.ts';
import { localized, localizedList, parse, uuidParam } from '../../lib/validation.ts';
import { serializePlan } from '../../serializers.ts';

const planBody = z.object({
  name: localized,
  description: localized,
  priceBaisa: z.number().int().min(0).max(10_000_000),
  durationDays: z.number().int().min(1).max(3650),
  perks: localizedList,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export async function planAdminRoutes(admin: FastifyInstance) {
  const { db } = admin;
  const adminOnly = { preHandler: admin.guard('admin') };

  admin.get('/plans', adminOnly, async () => {
    const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.createdAt));
    return { plans: rows.map(serializePlan) };
  });

  admin.post('/plans', adminOnly, async (request, reply) => {
    const body = parse(planBody.partial({ perks: true, isActive: true, sortOrder: true }), request.body);
    const [plan] = await db.insert(plans).values(body).returning();
    admin.live.publish(...live.plansChanged());
    return reply.status(201).send({ plan: serializePlan(plan!) });
  });

  admin.patch('/plans/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(planBody.partial(), request.body);
    const [plan] = await db.update(plans).set(body).where(eq(plans.id, id)).returning();
    if (!plan) throw errors.notFound('Plan');
    admin.live.publish(...live.plansChanged());
    return { plan: serializePlan(plan) };
  });
}
