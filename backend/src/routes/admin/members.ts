import { and, count, desc, eq, gt, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthContext } from '../../auth.ts';
import { bookings, memberships, plans, sessions, users } from '../../db/schema.ts';
import { ApiError, errors } from '../../lib/errors.ts';
import { live } from '../../lib/live.ts';
import { activeMembership, grantMembership, membershipStatus } from '../../lib/memberships.ts';
import { searchUserIds } from '../../lib/people.ts';
import { pagination, parse, uuidParam } from '../../lib/validation.ts';
import { serializeBooking, serializeMembership, serializeUser } from '../../serializers.ts';

/** When the account last signed in (app or control panel), or null. */
const lastSignIn = sql<Date | null>`(select max(s.created_at) from sessions s where s.user_id = "users"."id")`
  .mapWith(sessions.createdAt);
const iso = (value: Date | null) => value?.toISOString() ?? null;
/** Rows of these accounts (none when the search found nobody). */
const matching = (ids: string[]) => (ids.length ? inArray(users.id, ids) : sql`false`);

export async function memberAdminRoutes(admin: FastifyInstance) {
  const { db, config } = admin;
  const adminOnly = { preHandler: admin.guard('admin') };

  admin.get('/members', adminOnly, async (request) => {
    const query = parse(pagination.extend({
      q: z.string().trim().max(100).optional(),
      status: z.enum(['active', 'suspended']).optional(),
    }), request.query);
    const filters: SQL[] = [];
    if (query.q) filters.push(matching(await searchUserIds(db, query.q)));
    if (query.status) filters.push(eq(users.status, query.status));
    const where = filters.length ? and(...filters) : undefined;

    const [total] = await db.select({ n: count() }).from(users).where(where);
    const rows = await db.select({ user: users, lastSignInAt: lastSignIn }).from(users).where(where).orderBy(desc(users.createdAt))
      .limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    const now = new Date();
    const items = await Promise.all(rows.map(async ({ user, lastSignInAt }) => {
      const active = await activeMembership(db, user.id, now);
      return {
        ...serializeUser(user),
        lastSignInAt: iso(lastSignInAt),
        membership: active ? serializeMembership(active.membership, active.plan) : null,
      };
    }));
    return { items, total: total?.n ?? 0, page: query.page, pageSize: query.pageSize };
  });

  admin.get('/members/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [row] = await db.select({ user: users, lastSignInAt: lastSignIn }).from(users).where(eq(users.id, id)).limit(1);
    if (!row) throw errors.notFound('Member');
    const history = await db.select({ membership: memberships, plan: plans }).from(memberships)
      .innerJoin(plans, eq(plans.id, memberships.planId))
      .where(eq(memberships.userId, id)).orderBy(desc(memberships.createdAt));
    const codes = await db.select().from(bookings).where(eq(bookings.userId, id)).orderBy(desc(bookings.createdAt)).limit(50);
    return {
      member: { ...serializeUser(row.user), lastSignInAt: iso(row.lastSignInAt) },
      memberships: history.map((h) => serializeMembership(h.membership, h.plan)),
      bookings: codes.map((b) => serializeBooking(b)),
    };
  });

  admin.patch('/members/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    // No roles here: the owner is the only account that can open the control panel.
    const body = parse(z.object({
      fullName: z.string().trim().min(3).max(120).optional(),
      status: z.enum(['active', 'suspended']).optional(),
    }).strict(), request.body);
    const { user: me } = requireAuthContext(request);
    if (id === me.id && body.status === 'suspended') {
      throw new ApiError(400, 'cannot_modify_self', 'You cannot suspend your own account.');
    }
    const [user] = await db.update(users).set(body).where(eq(users.id, id)).returning();
    if (!user) throw errors.notFound('Member');
    if (body.status === 'suspended') {
      // Sign the member out everywhere.
      await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
    }
    admin.live.publish(...live.accountChanged(id));
    // Close open streams so a suspended account is disconnected.
    if (body.status) admin.live.publish(live.revokeUser(id));
    return { member: serializeUser(user) };
  });

  /** Deletes an account and everything linked to it (e.g. test accounts). Not the owner's. */
  admin.delete('/members/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw errors.notFound('Member');
    if (user.email === config.adminEmail) throw new ApiError(400, 'cannot_delete_owner', "The owner's account can't be deleted.");
    await db.delete(users).where(eq(users.id, id));
    admin.live.publish(live.revokeUser(id), live.admin('members'));
    return { ok: true };
  });

  /** Grant or extend a membership (e.g. a gift, a partner deal or a cash sale). */
  admin.post('/members/:id/memberships', adminOnly, async (request, reply) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(z.object({
      planId: z.uuid(),
      days: z.number().int().min(1).max(3650).optional(),
      paidBaisa: z.number().int().min(0).max(10_000_000).default(0),
    }), request.body);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw errors.notFound('Member');
    const granted = await grantMembership(db, { userId: id, planId: body.planId, source: 'admin', paidBaisa: body.paidBaisa, days: body.days });
    admin.live.publish(...live.membershipChanged(id));
    return reply.status(201).send({ membership: serializeMembership(granted.membership, granted.plan) });
  });

  admin.post('/memberships/:id/cancel', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [membership] = await db.update(memberships).set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(memberships.id, id)).returning();
    if (!membership) throw errors.notFound('Membership');
    admin.live.publish(...live.membershipChanged(membership.userId));
    const [plan] = await db.select().from(plans).where(eq(plans.id, membership.planId)).limit(1);
    return { membership: serializeMembership(membership, plan!) };
  });

  admin.get('/memberships', adminOnly, async (request) => {
    const query = parse(pagination.extend({
      status: z.enum(['active', 'expired', 'cancelled']).optional(),
      q: z.string().trim().max(100).optional(),
    }), request.query);
    const now = new Date();
    const filters: SQL[] = [];
    if (query.status === 'active') filters.push(eq(memberships.status, 'active'), gt(memberships.expiresAt, now));
    if (query.status === 'expired') filters.push(eq(memberships.status, 'active'), sql`${memberships.expiresAt} <= ${now}`);
    if (query.status === 'cancelled') filters.push(eq(memberships.status, 'cancelled'));
    if (query.q) filters.push(matching(await searchUserIds(db, query.q)));
    const where = filters.length ? and(...filters) : undefined;
    const [total] = await db.select({ n: count() }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId)).where(where);
    const rows = await db.select({ membership: memberships, plan: plans, user: users }).from(memberships)
      .innerJoin(plans, eq(plans.id, memberships.planId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(where).orderBy(desc(memberships.createdAt))
      .limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map((r) => ({
        ...serializeMembership(r.membership, r.plan),
        status: membershipStatus(r.membership, now),
        paidBaisa: r.membership.paidBaisa,
        member: { id: r.user.id, fullName: r.user.fullName, email: r.user.email, memberNumber: r.user.memberNumber },
      })),
      total: total?.n ?? 0, page: query.page, pageSize: query.pageSize,
    };
  });
}
