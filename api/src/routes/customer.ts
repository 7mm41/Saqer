import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { maskOffPlatform, DISPUTE_REASONS, RATING_TAGS } from '@katf/shared';
import type { Ctx, Actor } from '../ctx';
import { addresses, bookings, consents, files, messages, notifications, pushSubscriptions, supportTickets, users, payments, legalDocuments } from '../db/schema';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors';
import { safeEqual } from '../lib/crypto';
import { newId } from '../lib/ids';
import { actorOf, assertCsrf, clearSessionCookies, requireRole } from '../http';
import {
  approveQuote,
  cancelByCustomer,
  confirmJob,
  createBooking,
  createRevisit,
  logCall,
  openDispute,
  rateBooking,
  rejectQuote,
  startCheckout,
  trackingToken,
} from '../services/bookings';
import { loadBooking, loadByCode, type Booking } from '../services/booking-core';
import { storeUpload, type Purpose } from '../services/files';
import { pendingAcceptances, recordConsents } from '../services/legal';
import { markRead, notifyAdmins, renderInapp } from '../services/notifications';
import { appealDispute, anonymiseCustomer } from '../services/admin';
import { customerBookingView } from '../views';
import { audit } from '../services/audit';

const zTimes = { windowStart: z.number().int(), windowEnd: z.number().int() };

export function customerRoutes(app: FastifyInstance, ctx: Ctx) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  /** The booking's customer: a signed-in owner, or the holder of the tracking link (sent to their phone). */
  async function bookingCustomer(req: FastifyRequest, id: string): Promise<{ b: Booking; actor: Actor & { id: string } }> {
    const b = await loadBooking(ctx.db, id).catch(() => {
      throw notFound();
    });
    if (req.auth?.role === 'customer' && req.auth.uid === b.customerId) {
      assertCsrf(req);
      return { b, actor: { id: b.customerId, role: 'customer', ipHash: ctx.crypto.hashIp(req.ip) } };
    }
    const token = (req.headers['x-track-token'] as string | undefined) ?? (req.query as { t?: string })?.t;
    if (token && safeEqual(token, trackingToken(ctx, b.id))) return { b, actor: { id: b.customerId, role: 'customer', ipHash: ctx.crypto.hashIp(req.ip) } };
    if (req.auth) throw notFound();
    throw unauthorized();
  }

  // ---------------------------------------------------------------- uploads
  r.post('/api/uploads', { config: { rateLimit: { max: 40 * ctx.config.RATE_LIMIT_SCALE, timeWindow: '1 hour' } } }, async (req) => {
    const owner = req.auth ? actorOf(req, ctx) : null;
    if (owner) assertCsrf(req);
    else if (req.headers['x-requested-with'] !== 'katf') throw forbidden('csrf');
    const part = await req.file({ limits: { fileSize: 26 * 1024 * 1024, files: 1 } });
    if (!part) throw badRequest('file_required');
    const purpose = String((part.fields.purpose as { value?: string } | undefined)?.value ?? '') as Purpose;
    const allowedAnon: Purpose[] = ['booking_problem', 'dispute']; // tracking-link holders report problems without signing in
    const allowedCustomer: Purpose[] = ['booking_problem', 'dispute'];
    const allowedTech: Purpose[] = ['arrival', 'diagnosis', 'before', 'after', 'receipt', 'profile_photo', 'work_sample', 'document', 'signature', 'certification', 'dispute'];
    const ok = !owner ? allowedAnon.includes(purpose) : owner.role === 'customer' ? allowedCustomer.includes(purpose) : owner.role === 'technician' ? allowedTech.includes(purpose) : false;
    if (!ok) throw forbidden();
    const buf = await part.toBuffer();
    const res = await storeUpload(ctx, { buffer: buf, purpose, ownerId: owner?.id ?? null });
    return res;
  });

  // ---------------------------------------------------------------- bookings
  r.post(
    '/api/bookings',
    {
      schema: {
        body: z.object({
          technicianSlug: z.string().max(60).nullish(),
          repeatOf: z.string().uuid().nullish(),
          problem: z.string().max(30),
          units: z.array(z.object({ type: z.string().max(20), brand: z.string().max(40).optional(), count: z.number().int().min(1).max(20) })).min(1).max(5),
          problemText: z.string().max(2000).nullish(),
          mediaIds: z.array(z.string().uuid()).max(10).default([]),
          urgency: z.enum(['today', 'day']),
          address: z.object({
            wilayat: z.string().max(40),
            neighbourhood: z.string().max(60),
            wayNo: z.string().max(20).nullish(),
            buildingNo: z.string().max(20).nullish(),
            flatNo: z.string().max(20).nullish(),
            landmark: z.string().max(120).nullish(),
            notes: z.string().max(300).nullish(),
            label: z.string().max(40).nullish(),
          }),
          lat: z.number().min(16).max(27),
          lng: z.number().min(51).max(60),
          saveAddress: z.boolean().default(false),
          ...zTimes,
          name: z.string().min(1).max(80),
          email: z.string().email().max(120).nullish(),
          acceptedDocIds: z.array(z.string().uuid()).min(1).max(5),
          locale: z.enum(['ar', 'en']).default('ar'),
          returnUrl: z.string().url(),
        }),
      },
      config: { rateLimit: { max: 20 * ctx.config.RATE_LIMIT_SCALE, timeWindow: '1 hour' } },
    },
    async (req) => {
      const a = requireRole(req, ctx, 'customer');
      // media must be anonymous booking uploads or this customer's own
      if (req.body.mediaIds.length) {
        const rows = await ctx.db.select().from(files).where(inArray(files.id, req.body.mediaIds));
        if (rows.length !== req.body.mediaIds.length || rows.some((f) => f.purpose !== 'booking_problem' || (f.ownerUserId && f.ownerUserId !== a.id))) throw badRequest('invalid_media');
        await ctx.db.update(files).set({ ownerUserId: a.id }).where(and(inArray(files.id, req.body.mediaIds), isNull(files.ownerUserId)));
      }
      const allowed = [ctx.config.PUBLIC_ORIGIN, ...ctx.config.corsOrigins];
      if (!allowed.some((o) => req.body.returnUrl.startsWith(o))) throw badRequest('bad_return_url');
      return createBooking(ctx, a, { ...req.body, technicianSlug: req.body.technicianSlug ?? null, repeatOf: req.body.repeatOf ?? null, email: req.body.email ?? null }, { ip: req.ip, ua: String(req.headers['user-agent'] ?? '') });
    },
  );

  r.get('/api/bookings', async (req) => {
    const a = requireRole(req, ctx, 'customer');
    const rows = await ctx.db.select().from(bookings).where(eq(bookings.customerId, a.id)).orderBy(desc(bookings.createdAt)).limit(100);
    return rows.map((b) => ({ id: b.id, code: b.code, status: b.status, problem: b.problem, window: { start: b.windowStart, end: b.windowEnd }, visitFee: b.visitFee, quoteTotal: b.quoteTotal, isRevisit: b.isRevisit, token: trackingToken(ctx, b.id) }));
  });

  r.get('/api/bookings/:id', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const { b } = await bookingCustomer(req, req.params.id);
    return customerBookingView(ctx, b);
  });

  /** Tracking link: /b/{code}?t=token */
  r.get('/api/track/:code', { schema: { params: z.object({ code: z.string().max(20) }), querystring: z.object({ t: z.string().optional() }) } }, async (req) => {
    const b = await loadByCode(ctx.db, req.params.code).catch(() => {
      throw notFound();
    });
    const tokenOk = req.query.t && safeEqual(req.query.t, trackingToken(ctx, b.id));
    const owner = req.auth?.role === 'customer' && req.auth.uid === b.customerId;
    if (!tokenOk && !owner) throw notFound();
    return { ...(await customerBookingView(ctx, b)), token: trackingToken(ctx, b.id) };
  });

  r.post('/api/bookings/:id/pay', { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ returnUrl: z.string().url(), locale: z.enum(['ar', 'en']).default('ar') }) } }, async (req) => {
    const { b } = await bookingCustomer(req, req.params.id);
    const p = (await ctx.db.select().from(payments).where(and(eq(payments.bookingId, b.id), eq(payments.status, 'pending'))).orderBy(desc(payments.createdAt)))[0];
    if (!p) throw conflict('payment_not_pending');
    if (p.checkoutUrl) return { checkoutUrl: p.checkoutUrl };
    return { checkoutUrl: (await startCheckout(ctx, p.id, req.body.returnUrl, req.body.locale)).url };
  });

  r.post('/api/bookings/:id/cancel', { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ reason: z.string().max(200).nullish() }) } }, async (req) => {
    const { actor } = await bookingCustomer(req, req.params.id);
    await cancelByCustomer(ctx, actor, req.params.id, req.body.reason ?? null);
    return { ok: true };
  });

  r.post(
    '/api/bookings/:id/quote/:quoteId/approve',
    { schema: { params: z.object({ id: z.string().uuid(), quoteId: z.string().uuid() }), body: z.object({ returnUrl: z.string().url(), locale: z.enum(['ar', 'en']).default('ar') }) } },
    async (req) => {
      const { actor } = await bookingCustomer(req, req.params.id);
      return approveQuote(ctx, actor, req.params.id, req.params.quoteId, req.body.returnUrl, req.body.locale);
    },
  );

  r.post('/api/bookings/:id/quote/reject', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const { actor } = await bookingCustomer(req, req.params.id);
    await rejectQuote(ctx, actor, req.params.id);
    return { ok: true };
  });

  r.post('/api/bookings/:id/confirm', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const { actor } = await bookingCustomer(req, req.params.id);
    await confirmJob(ctx, actor, req.params.id);
    return { ok: true };
  });

  r.post(
    '/api/bookings/:id/dispute',
    { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ reasonCode: z.enum(DISPUTE_REASONS.map((d) => d.id) as [string, ...string[]]), description: z.string().max(2000).nullish(), evidence: z.array(z.string().uuid()).max(8).default([]) }) } },
    async (req) => {
      const { actor } = await bookingCustomer(req, req.params.id);
      if (req.body.evidence.length) {
        const rows = await ctx.db.select().from(files).where(inArray(files.id, req.body.evidence));
        if (rows.length !== req.body.evidence.length || rows.some((f) => f.purpose !== 'dispute' || (f.ownerUserId && f.ownerUserId !== actor.id))) throw badRequest('invalid_media');
        await ctx.db.update(files).set({ ownerUserId: actor.id }).where(and(inArray(files.id, req.body.evidence), isNull(files.ownerUserId)));
      }
      await openDispute(ctx, actor, req.params.id, { reasonCode: req.body.reasonCode, description: req.body.description ?? null, evidence: req.body.evidence });
      return { ok: true };
    },
  );

  r.post('/api/disputes/:id/appeal', { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ text: z.string().min(5).max(2000) }) } }, async (req) => {
    const a = actorOf(req, ctx);
    assertCsrf(req);
    await appealDispute(ctx, a, req.params.id, req.body.text);
    return { ok: true };
  });

  r.post(
    '/api/bookings/:id/rate',
    { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ rating: z.number().int().min(1).max(5), tags: z.array(z.enum(RATING_TAGS.map((t) => t.id) as [string, ...string[]])).max(5).default([]), comment: z.string().max(500).nullish() }) } },
    async (req) => {
      const { actor } = await bookingCustomer(req, req.params.id);
      await rateBooking(ctx, actor, req.params.id, { rating: req.body.rating, tags: req.body.tags, comment: req.body.comment ?? null });
      return { ok: true };
    },
  );

  r.post('/api/bookings/:id/revisit', { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ ...zTimes, note: z.string().max(500).nullish() }) } }, async (req) => {
    const { actor } = await bookingCustomer(req, req.params.id);
    return createRevisit(ctx, actor, req.params.id, { ...req.body, note: req.body.note ?? null });
  });

  r.post('/api/bookings/:id/call', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const { actor } = await bookingCustomer(req, req.params.id);
    return logCall(ctx, actor, req.params.id);
  });

  r.post('/api/bookings/:id/report', { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ text: z.string().min(3).max(2000) }) } }, async (req) => {
    const { b, actor } = await bookingCustomer(req, req.params.id);
    await ctx.db.insert(supportTickets).values({ id: newId(), userId: actor.id, userRole: 'customer', bookingId: b.id, subject: `بلاغ سلوك — ${b.code}`, messages: [{ by: actor.id, role: 'customer', body: req.body.text, at: new Date(ctx.clock.now()).toISOString() }] });
    await notifyAdmins(ctx, ctx.db, ['owner', 'support'], `بلاغ من زبون على الطلب ${b.code}`);
    return { ok: true };
  });

  r.get('/api/bookings/:id/receipt', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const { b } = await bookingCustomer(req, req.params.id);
    const view = await customerBookingView(ctx, b);
    const s = await ctx.settings.all();
    const pays = await ctx.db.select().from(payments).where(eq(payments.bookingId, b.id));
    return {
      company: { appName: s.app_name, appNameEn: s.app_name_en, name: s.company_name, cr: s.cr_number, address: s.company_address, email: s.contact_email },
      vat: { enabled: Boolean(s.vat_invoices), pct: s.vat_pct },
      booking: view,
      payments: pays.filter((p) => ['paid', 'refunded', 'partially_refunded'].includes(p.status)).map((p) => ({ kind: p.kind, amount: p.amount, refunded: p.refundedAmount, paidAt: p.paidAt })),
    };
  });

  // ---------------------------------------------------------------- in-app chat (masking + flags, §12)
  r.get('/api/bookings/:id/messages', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const b = await loadBooking(ctx.db, req.params.id);
    const a = req.auth ? actorOf(req, ctx) : (await bookingCustomer(req, req.params.id)).actor;
    if (a.id !== b.customerId && a.id !== b.technicianId) throw notFound();
    const rows = await ctx.db.select().from(messages).where(eq(messages.bookingId, b.id)).orderBy(messages.createdAt);
    return rows.map((m) => ({ id: m.id, mine: m.senderId === a.id, role: m.senderRole, body: m.body, flagged: Boolean(m.flaggedReason), at: m.createdAt }));
  });

  r.post('/api/bookings/:id/messages', { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ body: z.string().min(1).max(1000) }) } }, async (req) => {
    const b = await loadBooking(ctx.db, req.params.id);
    const a = req.auth ? actorOf(req, ctx) : (await bookingCustomer(req, req.params.id)).actor;
    if (req.auth) assertCsrf(req);
    if (a.id !== b.customerId && a.id !== b.technicianId) throw notFound();
    if (!b.technicianId || ['requested', 'pending_payment'].includes(b.status)) throw conflict('chat_not_open');
    const m = maskOffPlatform(req.body.body);
    await ctx.db.insert(messages).values({ id: newId(), bookingId: b.id, senderId: a.id, senderRole: a.role, body: m.text, flaggedReason: m.flagged ? 'off_platform' : null });
    if (m.flagged) {
      const s = await ctx.settings.all();
      const since = new Date(ctx.clock.now() - Number(s.chat_flags_window_days) * 86_400_000);
      const mine = (await ctx.db.select({ id: messages.id, at: messages.createdAt }).from(messages).where(and(eq(messages.senderId, a.id)))).filter((x) => x.at >= since);
      const flaggedCount = (await ctx.db.select().from(messages).where(eq(messages.senderId, a.id))).filter((x) => x.flaggedReason && x.createdAt >= since).length;
      if (flaggedCount >= Number(s.chat_flags_for_review) && mine.length) await notifyAdmins(ctx, ctx.db, ['owner', 'support'], `محادثة تكرر فيها محاولة التواصل خارج المنصة (${b.code})`);
    }
    await ctx.bus.publish({ bookingId: b.id, type: 'message', at: ctx.clock.now() });
    return { ok: true, masked: m.flagged };
  });

  // ---------------------------------------------------------------- live status (SSE)
  r.get('/api/bookings/:id/events', { schema: { params: z.object({ id: z.string().uuid() }), querystring: z.object({ t: z.string().optional() }) } }, async (req, reply) => {
    const b = await loadBooking(ctx.db, req.params.id).catch(() => {
      throw notFound();
    });
    const tokenOk = req.query.t && safeEqual(req.query.t, trackingToken(ctx, b.id));
    const a = req.auth;
    const allowed = tokenOk || (a && (a.uid === b.customerId || a.uid === b.technicianId || a.role === 'admin'));
    if (!allowed) throw notFound();
    sse(req, reply, (send) => ctx.bus.subscribe(b.id, (e) => send({ type: e.type, status: e.status, at: e.at })));
  });

  // ---------------------------------------------------------------- terms
  r.get('/api/terms/pending', async (req) => {
    const a = actorOf(req, ctx);
    if (a.role === 'admin') return [];
    return pendingAcceptances(ctx.db, a.id, a.role as 'customer' | 'technician');
  });

  r.post('/api/terms/accept', { schema: { body: z.object({ docIds: z.array(z.string().uuid()).min(1).max(5), locale: z.enum(['ar', 'en']).default('ar'), signatureName: z.string().max(120).nullish(), signatureFileId: z.string().uuid().nullish() }) } }, async (req) => {
    const a = actorOf(req, ctx);
    assertCsrf(req);
    if (a.role === 'admin') throw forbidden();
    const pending = await pendingAcceptances(ctx.db, a.id, a.role as 'customer' | 'technician');
    const ids = req.body.docIds.filter((id) => pending.some((p) => p.id === id));
    await recordConsents(ctx.db, { userId: a.id, docIds: ids, context: 're-acceptance', ipHash: ctx.crypto.hashIp(req.ip), userAgent: String(req.headers['user-agent'] ?? ''), locale: req.body.locale, signatureName: req.body.signatureName, signatureFileId: req.body.signatureFileId });
    return { accepted: ids.length };
  });

  // ---------------------------------------------------------------- notifications and push
  r.get('/api/notifications', async (req) => {
    const a = actorOf(req, ctx);
    const u = (await ctx.db.select({ locale: users.locale }).from(users).where(eq(users.id, a.id)))[0];
    const rows = await ctx.db.select().from(notifications).where(and(eq(notifications.userId, a.id), eq(notifications.channel, 'inapp'))).orderBy(desc(notifications.createdAt)).limit(100);
    const texts = await renderInapp(ctx.db, rows, (u?.locale as 'ar' | 'en') ?? 'ar');
    return rows.map((n, i) => ({ id: n.id, key: n.templateKey, text: texts[i], link: n.link, read: Boolean(n.readAt), at: n.createdAt }));
  });

  r.post('/api/notifications/read', { schema: { body: z.object({ ids: z.union([z.array(z.string().uuid()), z.literal('all')]) }) } }, async (req) => {
    const a = actorOf(req, ctx);
    assertCsrf(req);
    await markRead(ctx, a.id, req.body.ids);
    return { ok: true };
  });

  r.post('/api/push/subscribe', { schema: { body: z.object({ kind: z.enum(['webpush', 'apns']), endpoint: z.string().max(1000), keys: z.record(z.string(), z.string()).nullish(), deviceId: z.string().max(100).nullish() }) } }, async (req) => {
    const a = actorOf(req, ctx);
    assertCsrf(req);
    if (req.body.kind === 'webpush' && !req.body.endpoint.startsWith('https://')) throw badRequest('invalid_endpoint');
    const exists = await ctx.db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, a.id), eq(pushSubscriptions.endpoint, req.body.endpoint)));
    if (!exists.length) await ctx.db.insert(pushSubscriptions).values({ id: newId(), userId: a.id, kind: req.body.kind, endpoint: req.body.endpoint, keys: req.body.keys ?? null, deviceId: req.body.deviceId ?? null });
    return { ok: true };
  });

  // ---------------------------------------------------------------- customer account (§8.5, §13 data rights)
  r.get('/api/account', async (req) => {
    const a = requireRole(req, ctx, 'customer');
    const addr = await ctx.db.select().from(addresses).where(eq(addresses.userId, a.id));
    const cons = await ctx.db.select().from(consents).where(eq(consents.userId, a.id)).orderBy(desc(consents.acceptedAt));
    return {
      addresses: addr.map((x) => ({ ...x, notesEnc: undefined, notes: ctx.crypto.decrypt(x.notesEnc) })),
      consents: cons.map((c) => ({ id: c.id, docType: c.docType, version: c.version, acceptedAt: c.acceptedAt, documentId: c.legalDocumentId, withdrawnAt: c.withdrawnAt, context: c.context })),
    };
  });

  r.patch('/api/account', { schema: { body: z.object({ name: z.string().min(1).max(80).optional(), email: z.string().email().max(120).nullish(), locale: z.enum(['ar', 'en']).optional(), marketing: z.boolean().optional() }) } }, async (req) => {
    const a = actorOf(req, ctx);
    assertCsrf(req);
    if (a.role === 'admin') throw forbidden();
    await ctx.db
      .update(users)
      .set({
        ...(req.body.name ? { displayName: req.body.name } : {}),
        ...(req.body.email !== undefined ? { emailEnc: req.body.email ? ctx.crypto.encrypt(req.body.email.toLowerCase()) : null } : {}),
        ...(req.body.locale ? { locale: req.body.locale } : {}),
        ...(req.body.marketing !== undefined ? { marketingConsent: req.body.marketing } : {}),
      })
      .where(eq(users.id, a.id));
    return { ok: true };
  });

  r.delete('/api/account/addresses/:id', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const a = requireRole(req, ctx, 'customer');
    await ctx.db.delete(addresses).where(and(eq(addresses.id, req.params.id), eq(addresses.userId, a.id)));
    return { ok: true };
  });

  r.get('/api/account/export', async (req, reply) => {
    const a = actorOf(req, ctx);
    if (a.role === 'admin') throw forbidden();
    const u = (await ctx.db.select().from(users).where(eq(users.id, a.id)))[0]!;
    const myBookings = await ctx.db.select().from(bookings).where(a.role === 'customer' ? eq(bookings.customerId, a.id) : eq(bookings.technicianId, a.id));
    const cons = await ctx.db.select().from(consents).where(eq(consents.userId, a.id));
    const addr = await ctx.db.select().from(addresses).where(eq(addresses.userId, a.id));
    const msgs = await ctx.db.select().from(messages).where(eq(messages.senderId, a.id));
    const data = {
      exportedAt: new Date(ctx.clock.now()).toISOString(),
      profile: { name: u.displayName, phone: ctx.crypto.decrypt(u.phoneEnc), email: ctx.crypto.decrypt(u.emailEnc), locale: u.locale, createdAt: u.createdAt, marketingConsent: u.marketingConsent },
      addresses: addr.map((x) => ({ ...x, notesEnc: undefined, notes: ctx.crypto.decrypt(x.notesEnc), userId: undefined })),
      bookings: myBookings.map((b) => ({ code: b.code, status: b.status, problem: b.problem, window: [b.windowStart, b.windowEnd], visitFee: b.visitFee, quoteTotal: b.quoteTotal, refundTotal: b.refundTotal, createdAt: b.createdAt })),
      consents: cons.map((c) => ({ docType: c.docType, version: c.version, acceptedAt: c.acceptedAt, textSha256: c.textSha256, withdrawnAt: c.withdrawnAt })),
      messages: msgs.map((m) => ({ booking: m.bookingId, body: m.body, at: m.createdAt })),
    };
    await audit(ctx.db, a, { action: 'account.export', entity: 'user', entityId: a.id });
    reply.header('content-disposition', 'attachment; filename="my-data.json"');
    return data;
  });

  r.delete('/api/account', async (req, reply) => {
    const a = requireRole(req, ctx, 'customer');
    await ctx.db.transaction(async (tx) => {
      await anonymiseCustomer(ctx, tx, a.id);
      await audit(tx, a, { action: 'account.delete', entity: 'user', entityId: a.id });
    });
    clearSessionCookies(reply, ctx);
    return { ok: true };
  });

  r.post('/api/account/consents/:id/withdraw', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const a = actorOf(req, ctx);
    assertCsrf(req);
    const c = (await ctx.db.select().from(consents).where(and(eq(consents.id, req.params.id), eq(consents.userId, a.id))))[0];
    if (!c) throw notFound();
    if (c.context !== 'marketing') throw conflict('only_marketing_withdrawable');
    await ctx.db.update(consents).set({ withdrawnAt: new Date(ctx.clock.now()) }).where(eq(consents.id, c.id));
    return { ok: true };
  });

  // ---------------------------------------------------------------- support
  r.get('/api/support/tickets', async (req) => {
    const a = actorOf(req, ctx);
    return ctx.db.select().from(supportTickets).where(eq(supportTickets.userId, a.id)).orderBy(desc(supportTickets.updatedAt));
  });

  r.post('/api/support/tickets', { schema: { body: z.object({ subject: z.string().min(2).max(120), body: z.string().min(2).max(4000), bookingId: z.string().uuid().nullish() }) } }, async (req) => {
    const a = actorOf(req, ctx);
    assertCsrf(req);
    if (a.role === 'admin') throw forbidden();
    if (req.body.bookingId) {
      const b = await loadBooking(ctx.db, req.body.bookingId);
      if (b.customerId !== a.id && b.technicianId !== a.id) throw notFound();
    }
    const id = newId();
    await ctx.db.insert(supportTickets).values({ id, userId: a.id, userRole: a.role, bookingId: req.body.bookingId ?? null, subject: req.body.subject, messages: [{ by: a.id, role: a.role, body: req.body.body, at: new Date(ctx.clock.now()).toISOString() }] });
    await notifyAdmins(ctx, ctx.db, ['owner', 'support'], 'تذكرة دعم جديدة');
    return { id };
  });

  r.post('/api/support/tickets/:id/reply', { schema: { params: z.object({ id: z.string().uuid() }), body: z.object({ body: z.string().min(1).max(4000) }) } }, async (req) => {
    const a = actorOf(req, ctx);
    assertCsrf(req);
    const t = (await ctx.db.select().from(supportTickets).where(and(eq(supportTickets.id, req.params.id), eq(supportTickets.userId, a.id))))[0];
    if (!t) throw notFound();
    await ctx.db
      .update(supportTickets)
      .set({ messages: [...t.messages, { by: a.id, role: a.role, body: req.body.body, at: new Date(ctx.clock.now()).toISOString() }], status: 'open', updatedAt: new Date(ctx.clock.now()) })
      .where(eq(supportTickets.id, t.id));
    return { ok: true };
  });

  r.get('/api/legal-accepted/:id', { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    // the exact text a person accepted
    const a = actorOf(req, ctx);
    const c = (await ctx.db.select().from(consents).where(and(eq(consents.id, req.params.id), eq(consents.userId, a.id))))[0];
    if (!c) throw notFound();
    const d = (await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.id, c.legalDocumentId)))[0];
    return { title: d?.title, version: c.version, acceptedAt: c.acceptedAt, body: d?.renderedBody };
  });
}

/** Server-Sent Events with heartbeats; the subscription is removed when the client leaves. */
export function sse(req: FastifyRequest, reply: FastifyReply, subscribe: (send: (data: unknown) => void) => () => void) {
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  reply.hijack();
  const send = (data: unknown) => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: 'hello' });
  const unsub = subscribe(send);
  const hb = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
  req.raw.on('close', () => {
    clearInterval(hb);
    unsub();
  });
}
