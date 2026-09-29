import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthContext } from '../auth.ts';
import { bookings, devices, offers, plans, users, venues, type Booking } from '../db/schema.ts';
import { bookingCode } from '../lib/codes.ts';
import { ApiError, errors } from '../lib/errors.ts';
import { live } from '../lib/live.ts';
import { activeMembership, grantMembership } from '../lib/memberships.ts';
import { effectivePriceBaisa } from '../lib/plans.ts';
import { parse, uuidParam } from '../lib/validation.ts';
import { bookingPass, buildPass, memberQr, membershipPass } from '../lib/wallet.ts';
import { serializeBooking, serializeMembership, serializeUser } from '../serializers.ts';

const CODE_VALIDITY_DAYS = 30;

export async function memberRoutes(api: FastifyInstance) {
  const { db, config } = api;
  const signedIn = { preHandler: api.guard() };

  api.get('/me', signedIn, async (request) => {
    const { user, panel } = requireAuthContext(request);
    const active = await activeMembership(db, user.id);
    // `panel`: this sign-in can open the control panel (the owner, signed in from it).
    return { user: serializeUser(user), membership: active ? serializeMembership(active.membership, active.plan) : null, panel };
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
    const granted = await grantMembership(db, { userId: user.id, planId, source: 'demo', paidBaisa: effectivePriceBaisa(plan) });
    api.live.publish(...live.membershipChanged(user.id));
    return { membership: serializeMembership(granted.membership, granted.plan) };
  });

  api.get('/me/bookings', signedIn, async (request) => {
    const { user } = requireAuthContext(request);
    const rows = await db.select({ booking: bookings, eventStartsAt: venues.eventStartsAt }).from(bookings)
      .leftJoin(venues, eq(venues.id, bookings.venueId))
      .where(eq(bookings.userId, user.id)).orderBy(desc(bookings.createdAt));
    return { bookings: rows.map((r) => serializeBooking(r.booking, r.eventStartsAt)) };
  });

  api.post('/bookings', signedIn, async (request, reply) => {
    const { user } = requireAuthContext(request);
    const body = parse(z.object({ offerId: z.uuid(), quantity: z.number().int().min(1).max(10) }), request.body);
    if (!(await activeMembership(db, user.id))) throw errors.membershipRequired();

    const { booking, remaining, eventStartsAt } = await db.transaction(async (tx) => {
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
        return { booking: created as Booking, remaining, eventStartsAt: venue.eventStartsAt };
      }
      throw new ApiError(500, 'server_error', 'Could not generate a code.');
    });
    api.live.publish(...live.bookingsChanged(user.id));
    if (remaining !== null && booking.offerId && booking.venueId) {
      api.live.publish(live.offerRemaining(booking.offerId, booking.venueId, remaining));
    }
    return reply.status(201).send({ booking: serializeBooking(booking, eventStartsAt) });
  });

  // ---- Apple Wallet

  const walletLang = (request: { query: unknown }) => ((request.query as { lang?: string })?.lang === 'en' ? 'en' : 'ar');
  const sendPass = (reply: import('fastify').FastifyReply, name: string, pass: Buffer) =>
    reply.header('Content-Type', 'application/vnd.apple.pkpass')
      .header('Content-Disposition', `attachment; filename="${name}.pkpass"`)
      .header('Cache-Control', 'no-store')
      .send(pass);
  const requireWallet = () => {
    if (!api.wallet) throw new ApiError(503, 'wallet_unavailable', 'Apple Wallet passes are not set up on the server yet.');
    return api.wallet;
  };

  /** The membership card: its QR lets any partner confirm the membership is active. */
  api.get('/me/wallet/membership.pkpass', signedIn, async (request, reply) => {
    const signer = requireWallet();
    const { user } = requireAuthContext(request);
    const membership = await activeMembership(db, user.id);
    const pass = membershipPass({ user, membership, qr: memberQr(api.config.jwtSecret, user), lang: walletLang(request) });
    return sendPass(reply, 'Sarena-membership', buildPass(signer, pass));
  });

  /** One booking code as a pass (event ticket or coupon), with the same QR as in the app. */
  api.get('/me/bookings/:id/wallet.pkpass', signedIn, async (request, reply) => {
    const signer = requireWallet();
    const { user } = requireAuthContext(request);
    const { id } = parse(uuidParam, request.params);
    const [row] = await db.select({ booking: bookings, venue: venues }).from(bookings)
      .leftJoin(venues, eq(venues.id, bookings.venueId))
      .where(and(eq(bookings.id, id), eq(bookings.userId, user.id))).limit(1);
    if (!row) throw errors.notFound('Booking');
    const pass = bookingPass({ booking: row.booking, venue: row.venue, lang: walletLang(request) });
    return sendPass(reply, row.booking.code, buildPass(signer, pass));
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

  /**
   * Deletes the member's account and everything linked to it (sessions,
   * memberships, codes, devices). Required by the App Store for apps that
   * create accounts. The owner's account can't be deleted.
   */
  api.delete('/me', signedIn, async (request) => {
    const { user } = requireAuthContext(request);
    if (user.role !== 'member') {
      throw new ApiError(403, 'forbidden', "The owner's account can't be deleted.");
    }
    await db.delete(users).where(eq(users.id, user.id));
    api.live.publish(live.revokeUser(user.id), live.admin('members'));
    return { ok: true };
  });

  /** Registers this app's push token (APNs / FCM); a token moves to whoever signed in last. */
  api.post('/me/devices', signedIn, async (request) => {
    const { user } = requireAuthContext(request);
    const body = parse(z.object({
      token: z.string().trim().min(16).max(512),
      platform: z.enum(['ios', 'android']),
      locale: z.string().transform((v) => (v.toLowerCase().startsWith('en') ? 'en' as const : 'ar' as const)).default('ar'),
      /** Apple's gateway for this token: Xcode builds use the sandbox, TestFlight and the App Store production. */
      environment: z.enum(['sandbox', 'production']).optional(),
      /** The app's bundle identifier (the APNs topic). */
      bundleId: z.string().trim().regex(/^[A-Za-z0-9.-]{3,155}$/).optional(),
    }), request.body);
    const values = {
      userId: user.id, platform: body.platform, locale: body.locale,
      environment: body.environment ?? null, bundleId: body.bundleId ?? null,
    };
    await db.insert(devices).values({ ...values, token: body.token })
      .onConflictDoUpdate({ target: devices.token, set: { ...values, lastSeenAt: new Date() } });
    return { ok: true };
  });

  /** Called on sign-out so this phone stops receiving the member's notifications. */
  api.delete('/me/devices/:token', signedIn, async (request) => {
    const { user } = requireAuthContext(request);
    const { token } = parse(z.object({ token: z.string().min(16).max(512) }), request.params);
    await db.delete(devices).where(and(eq(devices.token, token), eq(devices.userId, user.id)));
    return { ok: true };
  });
}
