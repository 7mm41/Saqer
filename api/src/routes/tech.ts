import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, asc, desc, eq, gte, inArray, lt, or, sql, isNull, gt } from 'drizzle-orm';
import QRCode from 'qrcode';
import { muscatDate, TECH_CANCEL_REASONS, DECLINE_REASONS, FAULT_TYPES, TECH_SERVICES, DOCUMENT_TYPES } from '@katf/shared';
import type { Ctx } from '../ctx';
import { bookingOffers, bookings, reviews, serviceCatalog, strikes, technicians, technicianDocuments } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { requireRole } from '../http';
import {
  acceptBooking,
  arrive,
  cancelByTechnician,
  completeJob,
  customerAbsent,
  declineBooking,
  logCall,
  revisitFailed,
  sendQuote,
  startDiagnosis,
  startRevisitWork,
  startTravel,
} from '../services/bookings';
import { loadBooking, logEvent } from '../services/booking-core';
import {
  QUIZ,
  addDocument,
  applicationStatus,
  earnings,
  ensureTechnician,
  reapply,
  requestDeletion,
  saveStep,
  setBank,
  submitApplication,
  submitQuiz,
  techProfile,
  updateProfile,
} from '../services/technicians';
import { monthlyStatement } from '../services/payouts';
import { pendingAcceptances } from '../services/legal';
import { notifyAdmins } from '../services/notifications';
import { techBookingView, techListItem } from '../views';
import { signedFileUrl } from '../services/files';
import { consumeStepUpOtp, requestStepUpOtp } from '../services/auth';

export function techRoutes(app: FastifyInstance, ctx: Ctx) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tech = (req: Parameters<typeof requireRole>[0]) => requireRole(req, ctx, 'technician');
  const id = z.object({ id: z.string().uuid() });

  // ---------------------------------------------------------------- registration (§6)
  r.get('/api/tech/application', async (req) => applicationStatus(ctx, tech(req).id));

  r.put('/api/tech/application/step/:n', { schema: { params: z.object({ n: z.coerce.number().int().min(2).max(8) }), body: z.record(z.string(), z.unknown()) } }, async (req) =>
    saveStep(ctx, tech(req).id, req.params.n, req.body),
  );

  r.post(
    '/api/tech/application/documents',
    { schema: { body: z.object({ type: z.enum(DOCUMENT_TYPES.map((d) => d.id) as [string, ...string[]]), fileId: z.string().uuid(), expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() }) } },
    async (req) => addDocument(ctx, tech(req).id, { type: req.body.type, fileId: req.body.fileId, expiresAt: req.body.expiresAt ?? null }),
  );

  r.get('/api/tech/quiz', async (req) => {
    tech(req);
    return QUIZ.map((q) => ({ id: q.id, topic: q.topic, q: q.q, options: q.options }));
  });

  r.post('/api/tech/quiz', { schema: { body: z.object({ answers: z.record(z.string(), z.number().int()) }) } }, async (req) => submitQuiz(ctx, tech(req).id, req.body.answers));

  r.post(
    '/api/tech/application/submit',
    {
      schema: {
        body: z.object({
          acceptedDocIds: z.array(z.string().uuid()).min(4).max(5),
          truthDeclaration: z.literal(true),
          marketing: z.boolean().default(false),
          signatureName: z.string().min(2).max(120),
          signatureFileId: z.string().uuid(),
          locale: z.enum(['ar', 'en']).default('ar'),
        }),
      },
    },
    async (req) => {
      await submitApplication(ctx, tech(req).id, req.body, { ip: req.ip, ua: String(req.headers['user-agent'] ?? '') });
      return { ok: true };
    },
  );

  r.post('/api/tech/application/reapply', async (req) => {
    await reapply(ctx, tech(req).id);
    return { ok: true };
  });

  // ---------------------------------------------------------------- home (§7.1)
  r.get('/api/tech/home', async (req) => {
    const a = tech(req);
    const t = await ensureTechnician(ctx, a.id);
    const now = ctx.clock.now();
    const today = muscatDate(now);
    const mine = await ctx.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.technicianId, a.id), inArray(bookings.status, ['accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote_sent', 'repair_payment_pending', 'in_progress', 'completed_pending_confirmation', 'requested'])))
      .orderBy(asc(bookings.windowStart));
    const offers = await ctx.db
      .select({ bookingId: bookingOffers.bookingId })
      .from(bookingOffers)
      .where(and(eq(bookingOffers.technicianId, a.id), eq(bookingOffers.status, 'offered'), gt(bookingOffers.expiresAt, new Date(now))));
    const offered = offers.length ? await ctx.db.select().from(bookings).where(inArray(bookings.id, offers.map((o) => o.bookingId))) : [];
    const requests = [...mine.filter((b) => b.status === 'requested'), ...offered.filter((b) => b.status === 'requested')];
    const active = mine.filter((b) => b.status !== 'requested');
    const todays = active.filter((b) => muscatDate(b.windowStart.getTime()) === today);
    const e = await earnings(ctx, a.id);
    const in30 = new Date(now + 30 * 86_400_000).toISOString().slice(0, 10);
    const docs = await ctx.db.select().from(technicianDocuments).where(and(eq(technicianDocuments.technicianId, a.id), inArray(technicianDocuments.status, ['approved', 'expired'])));
    const pending = await pendingAcceptances(ctx.db, a.id, 'technician');
    const activeStrikes = await ctx.db.select({ id: strikes.id }).from(strikes).where(and(eq(strikes.technicianId, a.id), isNull(strikes.removedAt), gt(strikes.expiresAt, new Date(now))));
    return {
      status: t.status,
      available: t.available,
      vacationUntil: t.vacationUntil,
      publicName: t.publicName,
      rating: t.ratingCount ? Math.round((t.ratingSum * 10) / t.ratingCount) / 10 : null,
      ratingCount: t.ratingCount,
      probationJobsLeft: t.status === 'approved_probation' ? t.probationJobsLeft : null,
      requests: await Promise.all(requests.map((b) => techBookingView(ctx, b, a.id))),
      today: await Promise.all(todays.map((b) => techListItem(ctx, b))),
      next: active[0] ? await techBookingView(ctx, active[0], a.id) : null,
      week: { awaiting: e.awaitingConfirmation.length, scheduled: e.scheduled, paid: e.paid },
      alerts: {
        documentsExpiring: docs.filter((d) => d.expiresAt && d.expiresAt <= in30).map((d) => ({ type: d.type, expiresAt: d.expiresAt, status: d.status })),
        termsPending: pending,
        strikes: activeStrikes.length,
        paused: t.status === 'paused' ? t.pausedReason : null,
      },
    };
  });

  r.post('/api/tech/availability', { schema: { body: z.object({ available: z.boolean() }) } }, async (req) => {
    const a = tech(req);
    await ctx.db.update(technicians).set({ available: req.body.available }).where(eq(technicians.userId, a.id));
    return { ok: true };
  });

  // ---------------------------------------------------------------- jobs (§7.3, §7.4)
  r.get('/api/tech/jobs', { schema: { querystring: z.object({ tab: z.enum(['today', 'upcoming', 'past']).default('today'), q: z.string().max(20).optional() }) } }, async (req) => {
    const a = tech(req);
    const now = ctx.clock.now();
    const today = muscatDate(now);
    const rows = await ctx.db.select().from(bookings).where(eq(bookings.technicianId, a.id)).orderBy(desc(bookings.windowStart)).limit(300);
    const finals = ['settled', 'paid_out', 'closed_visit_only', 'customer_absent', 'cancelled_by_customer', 'cancelled_by_technician', 'expired', 'refunded_full', 'refunded_partial', 'repair_failed_closed', 'confirmed'];
    let list = rows.filter((b) => b.status !== 'requested');
    if (req.query.q) list = list.filter((b) => b.code.includes(req.query.q!.toUpperCase()));
    else if (req.query.tab === 'today') list = list.filter((b) => muscatDate(b.windowStart.getTime()) === today && !finals.includes(b.status));
    else if (req.query.tab === 'upcoming') list = list.filter((b) => b.windowStart.getTime() > now && muscatDate(b.windowStart.getTime()) !== today && !finals.includes(b.status)).reverse();
    else list = list.filter((b) => finals.includes(b.status));
    return Promise.all(list.map((b) => techListItem(ctx, b)));
  });

  r.get('/api/tech/jobs/:id', { schema: { params: id } }, async (req) => {
    const a = tech(req);
    const b = await loadBooking(ctx.db, req.params.id);
    const offered = (await ctx.db.select({ id: bookingOffers.id }).from(bookingOffers).where(and(eq(bookingOffers.bookingId, b.id), eq(bookingOffers.technicianId, a.id)))).length > 0;
    if (b.technicianId !== a.id && !offered) throw notFound();
    return techBookingView(ctx, b, a.id);
  });

  r.post('/api/tech/jobs/:id/accept', { schema: { params: id } }, async (req) => {
    await acceptBooking(ctx, tech(req), req.params.id);
    return { ok: true };
  });
  r.post('/api/tech/jobs/:id/decline', { schema: { params: id, body: z.object({ reason: z.enum(DECLINE_REASONS.map((d) => d.id) as [string, ...string[]]).nullish() }) } }, async (req) => {
    await declineBooking(ctx, tech(req), req.params.id, req.body.reason ?? null);
    return { ok: true };
  });
  r.post('/api/tech/jobs/:id/travel', { schema: { params: id, body: z.object({ etaMinutes: z.number().int() }) } }, async (req) => {
    await startTravel(ctx, tech(req), req.params.id, req.body.etaMinutes);
    return { ok: true };
  });
  r.post(
    '/api/tech/jobs/:id/arrive',
    { schema: { params: id, body: z.object({ lat: z.number(), lng: z.number(), photoFileId: z.string().uuid(), override: z.boolean().default(false), overrideReason: z.string().max(300).nullish(), simulated: z.boolean().default(false) }) } },
    async (req) => {
      await arrive(ctx, tech(req), req.params.id, { ...req.body, overrideReason: req.body.overrideReason ?? null });
      return { ok: true };
    },
  );
  r.post('/api/tech/jobs/:id/call', { schema: { params: id } }, async (req) => logCall(ctx, tech(req), req.params.id));
  r.post('/api/tech/jobs/:id/absent', { schema: { params: id } }, async (req) => {
    await customerAbsent(ctx, tech(req), req.params.id);
    return { ok: true };
  });
  r.post('/api/tech/jobs/:id/diagnose', { schema: { params: id } }, async (req) => {
    await startDiagnosis(ctx, tech(req), req.params.id);
    return { ok: true };
  });
  r.post(
    '/api/tech/jobs/:id/quote',
    {
      schema: {
        params: id,
        body: z.object({
          faults: z.array(z.enum(FAULT_TYPES.map((f) => f.id) as [string, ...string[]])).max(8),
          notes: z.string().max(1000).nullish(),
          photos: z.array(z.string().uuid()).max(10),
          durationMin: z.number().int().min(5).max(24 * 60).nullish(),
          items: z.array(z.object({ kind: z.enum(['labor', 'part', 'other']), label: z.string().min(1).max(120), qty: z.number().int(), unitPrice: z.number().int(), catalogId: z.string().uuid().nullish() })).min(1).max(30),
        }),
      },
    },
    async (req) => sendQuote(ctx, tech(req), req.params.id, req.body),
  );
  r.post('/api/tech/jobs/:id/revisit-start', { schema: { params: id } }, async (req) => {
    await startRevisitWork(ctx, tech(req), req.params.id);
    return { ok: true };
  });
  r.post(
    '/api/tech/jobs/:id/complete',
    { schema: { params: id, body: z.object({ before: z.array(z.string().uuid()).min(1).max(10), after: z.array(z.string().uuid()).min(1).max(10), notes: z.string().max(2000).nullish(), parts: z.array(z.object({ label: z.string().max(120), receiptFileId: z.string().uuid().nullish() })).max(20).default([]) }) } },
    async (req) => {
      await completeJob(ctx, tech(req), req.params.id, req.body);
      return { ok: true };
    },
  );
  r.post('/api/tech/jobs/:id/cancel', { schema: { params: id, body: z.object({ reason: z.enum(TECH_CANCEL_REASONS.map((d) => d.id) as [string, ...string[]]) }) } }, async (req) => {
    await cancelByTechnician(ctx, tech(req), req.params.id, req.body.reason);
    return { ok: true };
  });
  r.post('/api/tech/jobs/:id/revisit-failed', { schema: { params: id, body: z.object({ note: z.string().min(3).max(1000) }) } }, async (req) => {
    await revisitFailed(ctx, tech(req), req.params.id, req.body.note);
    return { ok: true };
  });
  /** Safety report (§7.3): shows 9999 in the app and alerts the admin with booking and last GPS. */
  r.post('/api/tech/jobs/:id/safety', { schema: { params: id, body: z.object({ lat: z.number().nullish(), lng: z.number().nullish(), note: z.string().max(500).nullish() }) } }, async (req) => {
    const a = tech(req);
    const b = await loadBooking(ctx.db, req.params.id);
    if (b.technicianId !== a.id) throw notFound();
    await logEvent(ctx.db, b.id, a, 'safety_report', { note: req.body.note ?? null, lat: req.body.lat ?? null, lng: req.body.lng ?? null });
    await notifyAdmins(ctx, ctx.db, ['owner', 'support'], `بلاغ سلامة من فني — الطلب ${b.code}${req.body.lat ? ` (${req.body.lat.toFixed(4)}, ${req.body.lng?.toFixed(4)})` : ''}`);
    return { ok: true, emergencyNumber: '9999' };
  });

  // ---------------------------------------------------------------- earnings (§7.5)
  r.get('/api/tech/earnings', async (req) => earnings(ctx, tech(req).id));
  r.get('/api/tech/statement', { schema: { querystring: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }) } }, async (req) => {
    const a = tech(req);
    const s = await ctx.settings.all();
    const t = await ensureTechnician(ctx, a.id);
    return { ...(await monthlyStatement(ctx, a.id, req.query.month)), technician: t.publicName, appName: s.app_name, company: s.company_name, cr: s.cr_number };
  });

  r.post('/api/tech/bank/otp', { config: { rateLimit: { max: 5 * ctx.config.RATE_LIMIT_SCALE, timeWindow: '10 minutes' } } }, async (req) =>
    requestStepUpOtp(ctx, { userId: tech(req).id, role: 'technician', purpose: 'bank_change', ip: req.ip }),
  );

  r.post(
    '/api/tech/bank',
    { schema: { body: z.object({ bankName: z.string().max(60), iban: z.string().max(40), holderName: z.string().max(120), letterFileId: z.string().uuid().nullish(), challengeId: z.string().uuid(), code: z.string().min(4).max(8) }) } },
    async (req) => {
      const a = tech(req);
      // changing bank details needs a fresh OTP on the account phone
      await consumeStepUpOtp(ctx, { userId: a.id, challengeId: req.body.challengeId, code: req.body.code, purpose: 'bank_change' });
      return setBank(ctx, a.id, { bankName: req.body.bankName, iban: req.body.iban, holderName: req.body.holderName, letterFileId: req.body.letterFileId ?? null }, { initial: false });
    },
  );

  // ---------------------------------------------------------------- my link (§7.8)
  r.get('/api/tech/link', async (req) => {
    const a = tech(req);
    const t = await ensureTechnician(ctx, a.id);
    if (!t.bookingSlug) throw conflict('not_approved');
    const url = `${ctx.config.PUBLIC_ORIGIN}/t/${t.bookingSlug}`;
    const qr = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#10303A', light: '#FFFFFF' } });
    const own = await ctx.db.select({ c: bookings.customerId }).from(bookings).where(and(eq(bookings.technicianId, a.id), eq(bookings.entryMode, 'direct_link')));
    const repeat = await ctx.db.select({ c: bookings.customerId }).from(bookings).where(and(eq(bookings.technicianId, a.id), eq(bookings.entryMode, 'repeat'), eq(bookings.isRevisit, false)));
    const s = await ctx.settings.all();
    return { url, qrSvg: qr, ownCustomers: new Set(own.map((x) => x.c)).size, repeatCustomers: new Set(repeat.map((x) => x.c)).size, ownCommissionBps: Number(s.own_customer_commission_pct), standardCommissionBps: t.commissionOverrideBps ?? Number(s.commission_pct) };
  });

  // ---------------------------------------------------------------- profile and account (§7.6, §7.7, §7.9)
  r.get('/api/tech/profile', async (req) => {
    const a = tech(req);
    const p = await techProfile(ctx, a.id);
    return { ...p, photoUrl: p.photoFileId ? signedFileUrl(ctx, p.photoFileId, 3600) : null, workPhotos: p.workPhotoIds.map((f) => ({ id: f, url: signedFileUrl(ctx, f, 3600) })) };
  });
  r.patch('/api/tech/profile', { schema: { body: z.record(z.string(), z.unknown()) } }, async (req) => updateProfile(ctx, tech(req).id, req.body));
  r.delete('/api/tech/account', async (req) => {
    await requestDeletion(ctx, tech(req).id);
    return { ok: true };
  });

  r.get('/api/tech/reviews', async (req) => {
    const a = tech(req);
    const rows = await ctx.db.select().from(reviews).where(and(eq(reviews.technicianId, a.id), eq(reviews.direction, 'customer_to_technician'))).orderBy(desc(reviews.createdAt));
    const dist = [1, 2, 3, 4, 5].map((n) => rows.filter((r) => r.rating === n).length);
    return { distribution: dist, reviews: rows.filter((r) => r.moderationStatus === 'visible').map((r) => ({ id: r.id, rating: r.rating, tags: r.tags, comment: r.comment, reply: r.reply, at: r.createdAt })) };
  });
  r.post('/api/tech/reviews/:id/reply', { schema: { params: id, body: z.object({ reply: z.string().min(1).max(500) }) } }, async (req) => {
    const a = tech(req);
    const rv = (await ctx.db.select().from(reviews).where(and(eq(reviews.id, req.params.id), eq(reviews.technicianId, a.id))))[0];
    if (!rv) throw notFound();
    if (rv.reply) throw conflict('already_replied');
    await ctx.db.update(reviews).set({ reply: req.body.reply }).where(eq(reviews.id, rv.id));
    return { ok: true };
  });
  r.post('/api/tech/strikes/:id/appeal', { schema: { params: id, body: z.object({ text: z.string().min(5).max(2000) }) } }, async (req) => {
    const a = tech(req);
    const s = (await ctx.db.select().from(strikes).where(and(eq(strikes.id, req.params.id), eq(strikes.technicianId, a.id))))[0];
    if (!s) throw notFound();
    if (s.appealStatus) throw conflict('already_appealed');
    const set = await ctx.settings.all();
    if (ctx.clock.now() > s.createdAt.getTime() + Number(set.appeal_days) * 86_400_000) throw conflict('appeal_window_closed');
    await ctx.db.update(strikes).set({ appealStatus: 'pending', appealText: req.body.text }).where(eq(strikes.id, s.id));
    await notifyAdmins(ctx, ctx.db, ['owner', 'support'], 'اعتراض جديد على مخالفة');
    return { ok: true };
  });

  r.get('/api/tech/catalog', async (req) => {
    tech(req);
    return {
      catalog: await ctx.db.select().from(serviceCatalog).where(eq(serviceCatalog.active, true)).orderBy(asc(serviceCatalog.sort)),
      services: TECH_SERVICES,
    };
  });

  void or;
  void sql;
  void gte;
  void lt;
}
