import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthContext } from '../auth.ts';
import { bookings, offers, plans, venues, type Booking } from '../db/schema.ts';
import { bookingCode } from '../lib/codes.ts';
import { ApiError, errors } from '../lib/errors.ts';
import { live } from '../lib/live.ts';
import { activeMembership, grantMembership } from '../lib/memberships.ts';
import { parse, uuidParam } from '../lib/validation.ts';
import { serializeBooking, serializeMembership, serializeUser } from '../serializers.ts';

const CODE_VALIDITY_DAYS = 30;

export async function memberRoutes(api: FastifyInstance) {
  const { db, config } = api;
  const signedIn = { preHandler: api.guard() };

  api.get('/me', signedIn, async (request) => {
    const { user } = requireAuthContext(request);
    const active = await activeMembership(db, user.id);
    return { user: serializeUser(user), membership: active ? serializeMembership(active.membership, active.plan) : null };
  });

  /**
   * Starts or renews the membership. With PAYMENTS_MODE=demo it is granted
   * immediately; production must verify an App Store purchase (or a web
   * payment) before calling `grantMembership`.
   */
  api.post('/membership/subscribe', signedIn, async (request) => {
    const { user } = requireAuthContext(request);
    const { planId } = parse(z.object({ planId: z.uuid() }), request.body);
    if (config.paymentsMode !== 'demo') throw errors.paymentsDisabled();
    const [plan] = await db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.isActive, true))).limit(1);
    if (!plan) throw errors.notFound('Plan');
    const granted = await grantMembership(db, { userId: user.id, planId, source: 'demo', paidBaisa: plan.priceBaisa });
    api.live.publish(...live.membershipChanged(user.id));
    return { membership: serializeMembership(granted.membership, granted.plan) };
  });

  api.get('/me/bookings', signedIn, async (request) => {
    const { user } = requireAuthContext(request);
    const rows = await db.select().from(bookings).where(eq(bookings.userId, user.id)).orderBy(desc(bookings.createdAt));
    return { bookings: rows.map(serializeBooking) };
  });

  api.post('/bookings', signedIn, async (request, reply) => {
    const { user } = requireAuthContext(request);
    const body = parse(z.object({ offerId: z.uuid(), quantity: z.number().int().min(1).max(10) }), request.body);
    if (!(await activeMembership(db, user.id))) throw errors.membershipRequired();

    const { booking, remaining } = await db.transaction(async (tx) => {
      const [row] = await tx.select({ offer: offers, venue: venues }).from(offers)
        .innerJoin(venues, eq(venues.id, offers.venueId))
        .where(and(eq(offers.id, body.offerId), eq(offers.isActive, true), eq(venues.isPublished, true)))
        .limit(1);
      if (!row) throw errors.notFound('Offer');
      const { offer, venue } = row;
      let remaining: number | null = null;
      if (offer.remaining !== null) {
        // Conditional decrement: safe under concurrent bookings.
        const updated = await tx.update(offers)
          .set({ remaining: sql`${offers.remaining} - ${body.quantity}` })
          .where(and(eq(offers.id, offer.id), gte(offers.remaining, body.quantity)))
          .returning({ remaining: offers.remaining });
        if (updated.length === 0) throw errors.soldOut();
        remaining = updated[0]!.remaining;
      }
      const values = {
        userId: user.id, venueId: venue.id, offerId: offer.id, venueName: venue.name, category: venue.category,
        offerTitle: offer.title, quantity: body.quantity,
        paidTotalBaisa: offer.memberPriceBaisa * body.quantity,
        originalTotalBaisa: offer.originalPriceBaisa * body.quantity,
        expiresAt: new Date(Date.now() + CODE_VALIDITY_DAYS * 86_400_000),
      };
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = bookingCode();
        const [existing] = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.code, code)).limit(1);
        if (existing) continue;
        const [created] = await tx.insert(bookings).values({ ...values, code }).returning();
        return { booking: created as Booking, remaining };
      }
      throw new ApiError(500, 'server_error', 'Could not generate a code.');
    });
    api.live.publish(...live.bookingsChanged(user.id));
    if (remaining !== null && booking.offerId && booking.venueId) {
      api.live.publish(live.offerRemaining(booking.offerId, booking.venueId, remaining));
    }
    return reply.status(201).send({ booking: serializeBooking(booking) });
  });

  /** The member confirms the venue accepted the code (staff can also redeem it from the dashboard). */
  api.post('/me/bookings/:id/mark-used', signedIn, async (request) => {
    const { user } = requireAuthContext(request);
    const { id } = parse(uuidParam, request.params);
    const [updated] = await db.update(bookings).set({ status: 'used', usedAt: new Date() })
      .where(and(eq(bookings.id, id), eq(bookings.userId, user.id), eq(bookings.status, 'active')))
      .returning();
    if (!updated) throw errors.notFound('Booking');
    api.live.publish(...live.bookingsChanged(user.id));
    return { booking: serializeBooking(updated) };
  });
}
