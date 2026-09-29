import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthContext } from '../../auth.ts';
import { bookings, users } from '../../db/schema.ts';
import { ApiError, errors } from '../../lib/errors.ts';
import { live } from '../../lib/live.ts';
import { activeMembership } from '../../lib/memberships.ts';
import { pagination, parse } from '../../lib/validation.ts';
import { checkMemberSignature, parseMemberQr } from '../../lib/wallet.ts';
import { serializeBooking, serializeMembership } from '../../serializers.ts';

export async function bookingAdminRoutes(admin: FastifyInstance) {
  const { db } = admin;

  admin.get('/bookings', { preHandler: admin.guard('admin', 'staff') }, async (request) => {
    const query = parse(pagination.extend({
      status: z.enum(['active', 'used', 'cancelled']).optional(),
      q: z.string().trim().max(60).optional(),
    }), request.query);
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(bookings.status, query.status));
    if (query.q) filters.push(or(ilike(bookings.code, `%${query.q}%`), ilike(users.fullName, `%${query.q}%`))!);
    const where = filters.length ? and(...filters) : undefined;
    const [total] = await db.select({ n: count() }).from(bookings).innerJoin(users, eq(users.id, bookings.userId)).where(where);
    const rows = await db.select({ booking: bookings, user: users }).from(bookings)
      .innerJoin(users, eq(users.id, bookings.userId)).where(where)
      .orderBy(desc(bookings.createdAt)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    return {
      items: rows.map((r) => ({ ...serializeBooking(r.booking), member: { id: r.user.id, fullName: r.user.fullName, memberNumber: r.user.memberNumber } })),
      total: total?.n ?? 0, page: query.page, pageSize: query.pageSize,
    };
  });

  /**
   * Venue staff scan a membership card (from Apple Wallet or the app): is this
   * person an active Sarena member? Checked live, so a renewed or cancelled
   * membership is always current whatever the card shows.
   */
  admin.post('/members/verify', { preHandler: admin.guard('admin', 'staff') }, async (request) => {
    const { qr } = parse(z.object({ qr: z.string().trim().min(10).max(300) }), request.body);
    const card = parseMemberQr(qr);
    if (!card) throw new ApiError(400, 'not_a_member_card', 'This is not a Sarena membership card.');
    const [user] = await db.select().from(users).where(eq(users.memberNumber, card.memberNumber)).limit(1);
    if (!user || !checkMemberSignature(admin.config.jwtSecret, user.id, card.signature)) {
      throw new ApiError(404, 'card_not_recognised', 'This membership card is not recognised.');
    }
    const current = user.status === 'active' ? await activeMembership(db, user.id) : null;
    return {
      member: { fullName: user.fullName, memberNumber: user.memberNumber, status: user.status },
      active: current !== null,
      membership: current ? serializeMembership(current.membership, current.plan) : null,
    };
  });

  /** Venue staff scan or type the member's code at the entrance. */
  admin.post('/bookings/redeem', { preHandler: admin.guard('admin', 'staff') }, async (request) => {
    const { code } = parse(z.object({ code: z.string().trim().toUpperCase().min(6).max(20) }), request.body);
    const { user: staff } = requireAuthContext(request);
    const normalized = code.startsWith('SRN-') ? code : `SRN-${code}`;
    const [row] = await db.select({ booking: bookings, user: users }).from(bookings)
      .innerJoin(users, eq(users.id, bookings.userId)).where(eq(bookings.code, normalized)).limit(1);
    if (!row) throw errors.notFound('Code');
    const { booking } = row;
    if (booking.status === 'used') throw new ApiError(409, 'already_used', 'This code was already used.');
    if (booking.status === 'cancelled') throw new ApiError(409, 'cancelled', 'This code was cancelled.');
    if (booking.expiresAt <= new Date()) throw new ApiError(410, 'expired', 'This code has expired.');
    const [updated] = await db.update(bookings).set({ status: 'used', usedAt: new Date(), redeemedBy: staff.id })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, 'active'))).returning();
    if (!updated) throw new ApiError(409, 'already_used', 'This code was already used.');
    admin.live.publish(...live.bookingsChanged(booking.userId));
    return { booking: serializeBooking(updated), member: { fullName: row.user.fullName, memberNumber: row.user.memberNumber } };
  });
}
