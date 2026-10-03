/**
 * Admin API, served only under /{ADMIN_PATH}/api (§9). Every route declares which staff roles
 * may use it; every state change requires a reason and is audit-logged.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, sql, ne } from 'drizzle-orm';
import { SETTINGS, defaultSettings } from '@katf/shared';
import type { Ctx } from '../ctx';
import {
  adminAccounts,
  areas,
  auditLog,
  blockedIdentities,
  bookings,
  consents,
  disputes,
  legalDocuments,
  ledgerEntries,
  notificationTemplates,
  payments,
  profileEditRequests,
  refunds,
  reviews,
  serviceCatalog,
  sessions,
  settingsHistory,
  signInHistory,
  strikes,
  supportTickets,
  technicianDocuments,
  technicians,
  users,
  quizAttempts,
  payableItems,
  waitlistEntries,
  broadcasts,
  messages,
} from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { clearSessionCookies, COOKIE, deviceId, requireAdmin, setSessionCookies } from '../http';
import { adminSignIn, createAdmin, hashPassword, listSessions, logout, refresh } from '../services/auth';
import { audit, verifyAudit } from '../services/audit';
import { decideApplication } from '../services/technicians';
import {
  adminCancel,
  assignTechnician,
  broadcast,
  changeSetting,
  customerAction,
  decideDispute,
  disputePreview,
  extendTimer,
  markNoShow,
  maskedIdentity,
  moderateReview,
  overview,
  replyTicket,
  reveal,
  technicianAction,
  updateArea,
  upsertCatalog,
} from '../services/admin';
import { addAdjustment, batchCsv, batches, createBatch, duePayouts, markBatchPaid, markPayoutFailed, monthlyStatement, setHold } from '../services/payouts';
import { outOfDateDocuments, publishVersion, DOC_TYPES, TITLES } from '../services/legal';
import { releaseQuote, syncPayment, revisitFailed } from '../services/bookings';
import { loadBooking } from '../services/booking-core';
import { adminBookingView } from '../views';
import { readSignedFile, signedFileUrl } from '../services/files';
import { notify } from '../services/notifications';
import { accountBalance } from '../services/ledger';
import { newId } from '../lib/ids';

const R = z.object({ reason: z.string().min(2).max(1000) });

export function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const P = `/${ctx.config.adminPath}/api`;
  const id = z.object({ id: z.string().uuid() });

  // ---------------------------------------------------------------- sign-in (§9.1)
  r.post(
    `${P}/auth/sign-in`,
    {
      schema: { body: z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200), totp: z.string().max(10).nullish(), recoveryCode: z.string().max(20).nullish(), enrollSecret: z.string().max(64).nullish() }) },
      config: { rateLimit: { max: 30 * ctx.config.RATE_LIMIT_SCALE, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      const res = await adminSignIn(ctx, { ...req.body, deviceId: deviceId(req, reply, ctx), deviceLabel: String(req.headers['user-agent'] ?? '').slice(0, 120), ip: req.ip });
      if (res.tokens) setSessionCookies(reply, ctx, res.tokens, true);
      return { status: res.status, enrollment: res.enrollment ?? null, recoveryCodes: res.recoveryCodes ?? null };
    },
  );
  r.post(`${P}/auth/refresh`, async (req, reply) => {
    const token = req.cookies[COOKIE.adminRefresh];
    if (!token || req.headers['x-requested-with'] !== 'katf') throw forbidden('session_expired');
    const t = await refresh(ctx, token, deviceId(req, reply, ctx));
    setSessionCookies(reply, ctx, t, true);
    return { ok: true };
  });
  r.post(`${P}/auth/sign-out`, async (req, reply) => {
    if (req.auth) await logout(ctx, req.auth.sid);
    clearSessionCookies(reply, ctx, true);
    return { ok: true };
  });
  r.get(`${P}/me`, async (req) => {
    const a = await requireAdmin(req, ctx, 'any');
    const u = (await ctx.db.select().from(users).where(eq(users.id, a.id)))[0]!;
    const acc = (await ctx.db.select().from(adminAccounts).where(eq(adminAccounts.userId, a.id)))[0]!;
    const s = await ctx.settings.all();
    return { id: a.id, name: u.displayName, role: acc.role, lastSignInAt: acc.lastSignInAt, lastSignInDevice: acc.lastSignInDevice, legalGate: s.legal_gate_cleared, demoMode: ctx.config.DEMO_MODE };
  });

  // ---------------------------------------------------------------- overview
  r.get(`${P}/overview`, async (req) => {
    await requireAdmin(req, ctx, 'any');
    return { ...(await overview(ctx)), outOfDateDocuments: await outOfDateDocuments(ctx) };
  });

  // ---------------------------------------------------------------- applications (§9.2 #2)
  r.get(`${P}/applications`, async (req) => {
    await requireAdmin(req, ctx, ['verifier']);
    const rows = await ctx.db.select().from(technicians).where(inArray(technicians.status, ['submitted', 'in_review', 'needs_info'])).orderBy(asc(technicians.applicationSubmittedAt));
    const now = ctx.clock.now();
    return rows.map((t) => ({ id: t.userId, name: t.publicName, status: t.status, submittedAt: t.applicationSubmittedAt, waitingHours: t.applicationSubmittedAt ? Math.floor((now - t.applicationSubmittedAt.getTime()) / 3_600_000) : null, workStatus: t.workStatus, areas: t.areas }));
  });

  r.get(`${P}/technicians/:id`, { schema: { params: id } }, async (req) => {
    await requireAdmin(req, ctx, ['verifier', 'support', 'finance']);
    const t = (await ctx.db.select().from(technicians).where(eq(technicians.userId, req.params.id)))[0];
    if (!t) throw notFound();
    const docs = await ctx.db.select().from(technicianDocuments).where(eq(technicianDocuments.technicianId, t.userId)).orderBy(desc(technicianDocuments.createdAt));
    const jobs = await ctx.db.select().from(bookings).where(eq(bookings.technicianId, t.userId)).orderBy(desc(bookings.createdAt)).limit(100);
    const st = await ctx.db.select().from(strikes).where(eq(strikes.technicianId, t.userId)).orderBy(desc(strikes.createdAt));
    const rv = await ctx.db.select().from(reviews).where(eq(reviews.technicianId, t.userId)).orderBy(desc(reviews.createdAt)).limit(100);
    const edits = await ctx.db.select().from(profileEditRequests).where(eq(profileEditRequests.technicianId, t.userId)).orderBy(desc(profileEditRequests.createdAt));
    const quiz = await ctx.db.select().from(quizAttempts).where(eq(quizAttempts.technicianId, t.userId)).orderBy(desc(quizAttempts.createdAt)).limit(5);
    const items = await ctx.db.select().from(payableItems).where(eq(payableItems.technicianId, t.userId)).orderBy(desc(payableItems.createdAt));
    const cons = await ctx.db.select().from(consents).where(eq(consents.userId, t.userId));
    const history = await ctx.db.select().from(auditLog).where(eq(auditLog.entityId, t.userId)).orderBy(desc(auditLog.id)).limit(100);
    // duplicates across accounts (§12 fraud signals)
    const dupPhone = await ctx.db.select({ id: users.id, role: users.role }).from(users).where(and(eq(users.phoneIndex, (await ctx.db.select().from(users).where(eq(users.id, t.userId)))[0]?.phoneIndex ?? '-'), ne(users.id, t.userId)));
    return {
      id: t.userId,
      status: t.status,
      publicName: t.publicName,
      fullNameEn: t.fullNameEn,
      nationality: t.nationality,
      workStatus: t.workStatus,
      identity: await maskedIdentity(ctx, t.userId),
      photoUrl: t.photoFileId ? signedFileUrl(ctx, t.photoFileId) : null,
      bio: t.bio,
      experienceBand: t.experienceBand,
      services: t.services,
      acTypes: t.acTypes,
      brands: t.brands,
      tools: t.tools,
      ownVehicle: t.ownVehicle,
      teamSize: t.teamSize,
      areas: t.areas,
      workingDays: t.workingDays,
      workingHours: t.workingHours,
      maxJobsPerDay: t.maxJobsPerDay,
      bookingSlug: t.bookingSlug,
      commissionOverrideBps: t.commissionOverrideBps,
      probationJobsLeft: t.probationJobsLeft,
      rating: t.ratingCount ? Math.round((t.ratingSum * 10) / t.ratingCount) / 10 : null,
      ratingCount: t.ratingCount,
      jobsCompleted: t.jobsCompleted,
      strikesCount: t.strikesCount,
      submittedAt: t.applicationSubmittedAt,
      reviewedAt: t.reviewedAt,
      rejectReason: t.rejectReason,
      needsInfoMessage: t.needsInfoMessage,
      checklist: t.verifierChecklist,
      internalNotes: t.internalNotes,
      quizPassedAt: t.quizPassedAt,
      quiz,
      workPhotos: t.workPhotoIds.map((f) => signedFileUrl(ctx, f)),
      documents: docs.map((d) => ({ id: d.id, type: d.type, status: d.status, expiresAt: d.expiresAt, createdAt: d.createdAt, rejectReason: d.rejectReason })),
      jobs: jobs.map((b) => ({ id: b.id, code: b.code, status: b.status, window: b.windowStart, net: b.technicianNet })),
      strikes: st,
      reviews: rv,
      edits,
      payables: items,
      consents: cons.map((c) => ({ docType: c.docType, version: c.version, acceptedAt: c.acceptedAt, signatureName: c.signatureName, textSha256: c.textSha256 })),
      history,
      duplicates: { phone: dupPhone },
    };
  });

  /** Opening an identity document is logged (§13). */
  r.get(`${P}/documents/:id`, { schema: { params: id } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['verifier']);
    const d = (await ctx.db.select().from(technicianDocuments).where(eq(technicianDocuments.id, req.params.id)))[0];
    if (!d) throw notFound();
    await audit(ctx.db, a, { action: 'document.view', entity: 'technician_document', entityId: d.id, data: { type: d.type } });
    return { url: signedFileUrl(ctx, d.fileId, 300), type: d.type, expiresAt: d.expiresAt };
  });

  r.post(
    `${P}/applications/:id/decide`,
    { schema: { params: id, body: z.object({ decision: z.enum(['approve', 'needs_info', 'reject', 'in_review']), reason: z.string().min(2).max(2000), items: z.array(z.string().max(60)).max(20).optional(), checklist: z.record(z.string(), z.boolean()).optional() }) } },
    async (req) => {
      const a = await requireAdmin(req, ctx, ['verifier']);
      await decideApplication(ctx, a, req.params.id, req.body);
      return { ok: true };
    },
  );

  r.post(`${P}/technicians/:id/reveal`, { schema: { params: id, body: z.object({ field: z.string().max(30), reason: z.string().min(3).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['verifier', 'finance', 'support']);
    return { value: await reveal(ctx, a, 'technician', req.params.id, req.body.field, req.body.reason) };
  });

  // ---------------------------------------------------------------- technicians (§9.2 #3)
  r.get(`${P}/technicians`, { schema: { querystring: z.object({ status: z.string().optional(), wilayat: z.string().optional(), q: z.string().max(60).optional(), page: z.coerce.number().int().min(1).default(1) }) } }, async (req) => {
    await requireAdmin(req, ctx, ['verifier', 'support', 'finance']);
    let rows = await ctx.db.select().from(technicians).orderBy(desc(technicians.updatedAt));
    if (req.query.status) rows = rows.filter((t) => t.status === req.query.status);
    if (req.query.wilayat) rows = rows.filter((t) => t.areas.some((a) => a.wilayat === req.query.wilayat));
    if (req.query.q) {
      const q = req.query.q.trim();
      const phoneIdx = /^\+?\d{8,12}$/.test(q) ? ctx.crypto.blindIndex('phone', q.startsWith('+') ? q : `+968${q.slice(-8)}`) : null;
      const byPhone = phoneIdx ? (await ctx.db.select({ id: users.id }).from(users).where(eq(users.phoneIndex, phoneIdx))).map((u) => u.id) : [];
      rows = rows.filter((t) => byPhone.includes(t.userId) || (t.publicName ?? '').includes(q) || (t.fullNameEn ?? '').toLowerCase().includes(q.toLowerCase()) || t.bookingSlug === q);
    }
    const page = rows.slice((req.query.page - 1) * 50, req.query.page * 50);
    const due = await ctx.db.select().from(payableItems).where(inArray(payableItems.status, ['scheduled', 'held', 'in_batch']));
    return {
      total: rows.length,
      rows: page.map((t) => ({
        id: t.userId,
        name: t.publicName,
        status: t.status,
        areas: t.areas.map((a) => a.wilayat),
        rating: t.ratingCount ? Math.round((t.ratingSum * 10) / t.ratingCount) / 10 : null,
        jobs: t.jobsCompleted,
        strikes: t.strikesCount,
        balance: due.filter((d) => d.technicianId === t.userId).reduce((s, d) => s + d.amount, 0),
        slug: t.bookingSlug,
      })),
    };
  });

  r.post(
    `${P}/technicians/:id/action`,
    {
      schema: {
        params: id,
        body: z.object({
          action: z.enum(['suspend', 'unsuspend', 'ban', 'pause', 'unpause', 'commission', 'add_strike', 'remove_strike', 'reset_device', 'message', 'approve_edit', 'reject_edit', 'verify_bank', 'note', 'approve_document', 'reject_document']),
          reason: z.string().min(2).max(2000),
          value: z.unknown().optional(),
        }),
      },
    },
    async (req) => {
      const money = ['commission', 'verify_bank'].includes(req.body.action);
      const a = await requireAdmin(req, ctx, money ? ['finance'] : ['verifier', 'support']);
      if (['ban', 'suspend', 'unsuspend'].includes(req.body.action) && a.adminRole === 'verifier' && req.body.action === 'ban') throw forbidden();
      await technicianAction(ctx, a, req.params.id, req.body);
      return { ok: true };
    },
  );

  r.post(`${P}/strikes/:id/appeal`, { schema: { params: id, body: z.object({ accept: z.boolean(), reason: z.string().min(2).max(1000) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    const s = (await ctx.db.select().from(strikes).where(eq(strikes.id, req.params.id)))[0];
    if (!s || s.appealStatus !== 'pending') throw notFound();
    await ctx.db.update(strikes).set({ appealStatus: req.body.accept ? 'accepted' : 'rejected', removedAt: req.body.accept ? new Date(ctx.clock.now()) : null, removedReason: req.body.accept ? req.body.reason : null }).where(eq(strikes.id, s.id));
    await audit(ctx.db, a, { action: 'strike.appeal_decide', entity: 'strike', entityId: s.id, reason: req.body.reason, data: { accept: req.body.accept } });
    return { ok: true };
  });

  // ---------------------------------------------------------------- customers (§9.2 #4)
  r.get(`${P}/customers`, { schema: { querystring: z.object({ q: z.string().max(40).optional(), page: z.coerce.number().int().min(1).default(1) }) } }, async (req) => {
    await requireAdmin(req, ctx, ['support']);
    let rows = await ctx.db.select().from(users).where(eq(users.role, 'customer')).orderBy(desc(users.createdAt));
    if (req.query.q) {
      const q = req.query.q.trim();
      const idx = /^\+?\d{8,12}$/.test(q) ? ctx.crypto.blindIndex('phone', `+968${q.slice(-8)}`) : null;
      rows = rows.filter((u) => (idx && u.phoneIndex === idx) || (u.displayName ?? '').includes(q));
    }
    const bk = await ctx.db.select({ c: bookings.customerId, status: bookings.status, refund: bookings.refundTotal }).from(bookings);
    return {
      total: rows.length,
      rows: rows.slice((req.query.page - 1) * 50, req.query.page * 50).map((u) => ({
        id: u.id,
        name: u.displayName,
        status: u.status,
        createdAt: u.createdAt,
        bookings: bk.filter((b) => b.c === u.id).length,
        refunds: bk.filter((b) => b.c === u.id && b.refund > 0).length,
        notes: u.notes,
      })),
    };
  });
  r.post(`${P}/customers/:id/action`, { schema: { params: id, body: z.object({ action: z.enum(['block', 'unblock', 'anonymise', 'note']), reason: z.string().min(2).max(1000) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    await customerAction(ctx, a, req.params.id, req.body.action, req.body.reason);
    return { ok: true };
  });
  r.post(`${P}/customers/:id/reveal`, { schema: { params: id, body: z.object({ field: z.enum(['phone', 'email']), reason: z.string().min(3).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    return { value: await reveal(ctx, a, 'customer', req.params.id, req.body.field, req.body.reason) };
  });

  // ---------------------------------------------------------------- bookings (§9.2 #5, #6)
  r.get(`${P}/bookings`, { schema: { querystring: z.object({ status: z.string().optional(), q: z.string().max(20).optional(), needsAdmin: z.coerce.boolean().optional(), page: z.coerce.number().int().min(1).default(1) }) } }, async (req) => {
    await requireAdmin(req, ctx, ['support', 'finance']);
    let rows = await ctx.db.select().from(bookings).orderBy(desc(bookings.createdAt));
    if (req.query.status) rows = rows.filter((b) => b.status === req.query.status);
    if (req.query.needsAdmin) rows = rows.filter((b) => b.needsAdmin);
    if (req.query.q) rows = rows.filter((b) => b.code.includes(req.query.q!.toUpperCase()));
    const techs = await ctx.db.select({ id: technicians.userId, name: technicians.publicName }).from(technicians);
    return {
      total: rows.length,
      rows: rows.slice((req.query.page - 1) * 50, req.query.page * 50).map((b) => ({
        id: b.id,
        code: b.code,
        status: b.status,
        entryMode: b.entryMode,
        wilayat: b.wilayat,
        neighbourhood: b.neighbourhood,
        lat: b.lat,
        lng: b.lng,
        window: { start: b.windowStart, end: b.windowEnd },
        technician: techs.find((t) => t.id === b.technicianId)?.name ?? null,
        visitFee: b.visitFee,
        quoteTotal: b.quoteTotal,
        needsAdmin: b.needsAdmin,
        isRevisit: b.isRevisit,
        createdAt: b.createdAt,
      })),
    };
  });

  r.get(`${P}/bookings/:id`, { schema: { params: id } }, async (req) => {
    await requireAdmin(req, ctx, ['support', 'finance']);
    return adminBookingView(ctx, await loadBooking(ctx.db, req.params.id));
  });

  r.post(`${P}/bookings/:id/cancel`, { schema: { params: id, body: z.object({ reason: z.string().min(2).max(1000), chargeFeeBps: z.number().int().min(0).max(10000).optional() }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    await adminCancel(ctx, a, req.params.id, req.body);
    return { ok: true };
  });
  r.post(`${P}/bookings/:id/no-show`, { schema: { params: id, body: R } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    await markNoShow(ctx, a, req.params.id, req.body.reason);
    return { ok: true };
  });
  r.post(`${P}/bookings/:id/assign`, { schema: { params: id, body: z.object({ technicianId: z.string().uuid(), reason: z.string().min(2).max(1000) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    await assignTechnician(ctx, a, req.params.id, req.body.technicianId, req.body.reason);
    return { ok: true };
  });
  r.post(`${P}/bookings/:id/extend`, { schema: { params: id, body: z.object({ kind: z.enum(['auto_confirm', 'quote_expiry', 'accept_timeout']), minutes: z.number().int(), reason: z.string().min(2).max(1000) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    await extendTimer(ctx, a, req.params.id, req.body.kind, req.body.minutes, req.body.reason);
    return { ok: true };
  });
  r.post(`${P}/bookings/:id/note`, { schema: { params: id, body: R } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support', 'finance']);
    const b = await loadBooking(ctx.db, req.params.id);
    await ctx.db.update(bookings).set({ adminNotes: `${b.adminNotes ? b.adminNotes + '\n' : ''}[${new Date(ctx.clock.now()).toISOString().slice(0, 16)}] ${req.body.reason}` }).where(eq(bookings.id, b.id));
    await audit(ctx.db, a, { action: 'booking.note', entity: 'booking', entityId: b.id, reason: req.body.reason });
    return { ok: true };
  });
  r.post(`${P}/bookings/:id/clear-flag`, { schema: { params: id, body: R } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    await ctx.db.update(bookings).set({ needsAdmin: null }).where(eq(bookings.id, req.params.id));
    await audit(ctx.db, a, { action: 'booking.clear_flag', entity: 'booking', entityId: req.params.id, reason: req.body.reason });
    return { ok: true };
  });
  r.post(`${P}/bookings/:id/quote-release`, { schema: { params: id, body: z.object({ approve: z.boolean(), reason: z.string().min(2).max(1000) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    await releaseQuote(ctx, a, req.params.id, req.body.approve, req.body.reason);
    return { ok: true };
  });
  r.post(`${P}/bookings/:id/resend`, { schema: { params: id, body: z.object({ key: z.string().max(40), reason: z.string().min(2).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    const b = await loadBooking(ctx.db, req.params.id);
    await notify(ctx, ctx.db, { userId: b.customerId, key: req.body.key, vars: { code: b.code } });
    await audit(ctx.db, a, { action: 'booking.resend', entity: 'booking', entityId: b.id, reason: req.body.reason, data: { key: req.body.key } });
    return { ok: true };
  });
  /** D54: a part counts for failed-repair reimbursement only once its receipt is accepted here. */
  r.post(`${P}/bookings/:id/evidence`, { schema: { params: id, body: z.object({ lineIndex: z.number().int().min(0), evidenced: z.boolean(), reason: z.string().min(2).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance', 'support']);
    const { approvedQuote } = await import('../services/booking-core');
    const { quotes } = await import('../db/schema');
    const q = await approvedQuote(ctx.db, req.params.id);
    if (!q) throw notFound();
    const items = q.items.map((it, i) => (i === req.body.lineIndex && it.kind === 'part' ? { ...it, evidenced: req.body.evidenced } : it));
    if (JSON.stringify(items) === JSON.stringify(q.items)) throw badRequest('not_a_part_line');
    await ctx.db.update(quotes).set({ items }).where(eq(quotes.id, q.id));
    await audit(ctx.db, a, { action: 'booking.part_evidence', entity: 'booking', entityId: req.params.id, reason: req.body.reason, data: { line: req.body.lineIndex, evidenced: req.body.evidenced } });
    return { ok: true };
  });
  r.post(`${P}/bookings/:id/revisit-failed`, { schema: { params: id, body: R } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    await revisitFailed(ctx, a, req.params.id, req.body.reason);
    return { ok: true };
  });
  r.post(`${P}/bookings/:id/open-dispute`, { schema: { params: id, body: z.object({ reasonCode: z.string().max(30), reason: z.string().min(2).max(2000) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    const { openDispute } = await import('../services/bookings');
    await openDispute(ctx, { ...a, role: 'admin' }, req.params.id, { reasonCode: req.body.reasonCode, description: req.body.reason, evidence: [] });
    return { ok: true };
  });

  r.get(`${P}/dispatch`, async (req) => {
    await requireAdmin(req, ctx, ['support']);
    const rows = await ctx.db.select().from(bookings).where(and(eq(bookings.status, 'requested'), sql`${bookings.needsAdmin} is not null`)).orderBy(asc(bookings.windowStart));
    const techs = await ctx.db.select().from(technicians).where(inArray(technicians.status, ['active', 'approved_probation']));
    const wait = await ctx.db.select().from(areas);
    return {
      requests: rows.map((b) => ({
        id: b.id,
        code: b.code,
        wilayat: b.wilayat,
        neighbourhood: b.neighbourhood,
        window: { start: b.windowStart, end: b.windowEnd },
        problem: b.problem,
        candidates: techs.filter((t) => t.areas.some((a) => a.wilayat === b.wilayat)).map((t) => ({ id: t.userId, name: t.publicName, available: t.available })),
      })),
      waitlist: wait.map((a) => ({ wilayat: a.wilayat, nameAr: a.nameAr, count: a.waitlistCount, active: a.active })),
    };
  });

  // ---------------------------------------------------------------- disputes (§9.2 #7)
  r.get(`${P}/disputes`, async (req) => {
    await requireAdmin(req, ctx, ['support', 'finance']);
    const rows = await ctx.db.select().from(disputes).orderBy(asc(disputes.slaDueAt));
    const bk = rows.length ? await ctx.db.select({ id: bookings.id, code: bookings.code }).from(bookings).where(inArray(bookings.id, rows.map((d) => d.bookingId))) : [];
    return rows.map((d) => ({ ...d, code: bk.find((b) => b.id === d.bookingId)?.code, evidence: d.evidence.length }));
  });
  r.get(`${P}/disputes/:id`, { schema: { params: id } }, async (req) => {
    await requireAdmin(req, ctx, ['support', 'finance']);
    const d = (await ctx.db.select().from(disputes).where(eq(disputes.id, req.params.id)))[0];
    if (!d) throw notFound();
    const b = await loadBooking(ctx.db, d.bookingId);
    return { dispute: { ...d, evidence: d.evidence.map((f) => signedFileUrl(ctx, f)) }, booking: await adminBookingView(ctx, b), preview: await disputePreview(ctx, b.id) };
  });
  r.post(
    `${P}/disputes/:id/decide`,
    {
      schema: {
        params: id,
        body: z.object({
          decision: z.enum(['technician_full', 'customer_full', 'labor_only', 'split', 'repair_failed']),
          amounts: z.object({ refund: z.number().int().min(0), technician: z.number().int().min(0), platform: z.number().int().min(0) }).optional(),
          note: z.string().min(3).max(2000),
          confirm: z.literal(true),
        }),
      },
    },
    async (req) => {
      const a = await requireAdmin(req, ctx, ['finance']);
      await decideDispute(ctx, a, req.params.id, req.body);
      return { ok: true };
    },
  );
  r.post(`${P}/disputes/:id/status`, { schema: { params: id, body: z.object({ status: z.enum(['under_review']), reason: z.string().min(2).max(1000) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    await ctx.db.update(disputes).set({ status: req.body.status }).where(and(eq(disputes.id, req.params.id), eq(disputes.status, 'open')));
    await audit(ctx.db, a, { action: 'dispute.status', entity: 'dispute', entityId: req.params.id, reason: req.body.reason });
    return { ok: true };
  });

  // ---------------------------------------------------------------- payments (§9.2 #8)
  r.get(`${P}/payments`, { schema: { querystring: z.object({ status: z.string().optional(), page: z.coerce.number().int().min(1).default(1) }) } }, async (req) => {
    await requireAdmin(req, ctx, ['finance']);
    let rows = await ctx.db.select().from(payments).orderBy(desc(payments.createdAt));
    if (req.query.status) rows = rows.filter((p) => p.status === req.query.status);
    const bk = await ctx.db.select({ id: bookings.id, code: bookings.code }).from(bookings);
    const refs = await ctx.db.select().from(refunds).orderBy(desc(refunds.createdAt));
    return {
      total: rows.length,
      rows: rows.slice((req.query.page - 1) * 50, req.query.page * 50).map((p) => ({ ...p, checkoutUrl: undefined, code: bk.find((b) => b.id === p.bookingId)?.code })),
      refunds: refs.slice(0, 100).map((x) => ({ ...x, code: bk.find((b) => b.id === x.bookingId)?.code })),
    };
  });
  r.post(`${P}/payments/:id/sync`, { schema: { params: id } }, async (req) => {
    await requireAdmin(req, ctx, ['finance']);
    return { status: await syncPayment(ctx, req.params.id) };
  });
  r.post(`${P}/refunds/:id/retry`, { schema: { params: id, body: R } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    const x = (await ctx.db.select().from(refunds).where(eq(refunds.id, req.params.id)))[0];
    if (!x || x.status !== 'failed') throw conflict('invalid_transition');
    const p = (await ctx.db.select().from(payments).where(eq(payments.id, x.paymentId)))[0]!;
    const res = await ctx.providers.payments.refund({ providerPaymentId: p.providerPaymentId!, amount: x.amount, reason: x.reasonCode, paymentId: p.id });
    await ctx.db.update(refunds).set({ status: 'done', providerRef: res.providerRef }).where(eq(refunds.id, x.id));
    await audit(ctx.db, a, { action: 'refund.retry', entity: 'refund', entityId: x.id, reason: req.body.reason });
    return { ok: true };
  });
  /** Reconciliation: paste the provider's report (provider_ref, amount) and see matched / unmatched. */
  r.post(`${P}/payments/reconcile`, { schema: { body: z.object({ rows: z.array(z.object({ providerRef: z.string(), amount: z.number().int() })).max(5000) }) } }, async (req) => {
    await requireAdmin(req, ctx, ['finance']);
    const ours = await ctx.db.select().from(payments).where(inArray(payments.status, ['paid', 'refunded', 'partially_refunded']));
    const matched: string[] = [];
    const mismatched: { providerRef: string; ours: number | null; theirs: number }[] = [];
    for (const row of req.body.rows) {
      const p = ours.find((x) => x.providerRef === row.providerRef);
      if (p && p.amount === row.amount) matched.push(row.providerRef);
      else mismatched.push({ providerRef: row.providerRef, ours: p?.amount ?? null, theirs: row.amount });
    }
    const missing = ours.filter((p) => !req.body.rows.some((r2) => r2.providerRef === p.providerRef)).map((p) => ({ providerRef: p.providerRef, amount: p.amount }));
    return { matched: matched.length, mismatched, missingFromReport: missing };
  });

  // ---------------------------------------------------------------- payouts (§9.2 #9)
  r.get(`${P}/payouts`, async (req) => {
    await requireAdmin(req, ctx, ['finance']);
    return { due: await duePayouts(ctx), batches: await batches(ctx) };
  });
  r.post(`${P}/payouts/batches`, { schema: { body: R.extend({ confirm: z.literal(true) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    return { id: await createBatch(ctx, a, req.body.reason) };
  });
  r.get(`${P}/payouts/batches/:id/csv`, { schema: { params: id } }, async (req, reply) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    const csv = await batchCsv(ctx, a, req.params.id);
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="payouts-${req.params.id.slice(0, 8)}.csv"`);
    return reply.send('﻿' + csv);
  });
  r.post(`${P}/payouts/batches/:id/paid`, { schema: { params: id, body: z.object({ bankReference: z.string().min(2).max(80), reason: z.string().min(2).max(500), confirm: z.literal(true) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    await markBatchPaid(ctx, a, req.params.id, req.body.bankReference, req.body.reason);
    return { ok: true };
  });
  r.post(`${P}/payouts/:id/failed`, { schema: { params: id, body: R } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    await markPayoutFailed(ctx, a, req.params.id, req.body.reason);
    return { ok: true };
  });
  r.post(`${P}/payouts/hold`, { schema: { body: z.object({ technicianId: z.string().uuid(), hold: z.boolean(), reason: z.string().min(2).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    await setHold(ctx, a, req.body.technicianId, req.body.hold, req.body.reason);
    return { ok: true };
  });
  r.post(`${P}/payouts/adjustments`, { schema: { body: z.object({ technicianId: z.string().uuid(), amount: z.number().int(), reason: z.string().min(2).max(500), confirm: z.literal(true) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['finance']);
    return { id: await addAdjustment(ctx, a, req.body.technicianId, req.body.amount, req.body.reason) };
  });
  r.get(`${P}/payouts/statement`, { schema: { querystring: z.object({ technicianId: z.string().uuid(), month: z.string() }) } }, async (req) => {
    await requireAdmin(req, ctx, ['finance']);
    return monthlyStatement(ctx, req.query.technicianId, req.query.month);
  });

  // ---------------------------------------------------------------- ledger and reports (§9.2 #10)
  r.get(`${P}/reports`, { schema: { querystring: z.object({ from: z.string().optional(), to: z.string().optional() }) } }, async (req) => {
    await requireAdmin(req, ctx, ['finance']);
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00+04:00`) : new Date(0);
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59+04:00`) : new Date(ctx.clock.now() + 1);
    const entries = (await ctx.db.select().from(ledgerEntries)).filter((e) => e.createdAt >= from && e.createdAt <= to);
    const byAccount: Record<string, { debit: number; credit: number }> = {};
    const byDay: Record<string, Record<string, number>> = {};
    for (const e of entries) {
      const acc = (byAccount[e.account] ??= { debit: 0, credit: 0 });
      acc.debit += e.debit;
      acc.credit += e.credit;
      const day = new Date(e.createdAt.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
      const d = (byDay[day] ??= {});
      d[e.account] = (d[e.account] ?? 0) + e.credit - e.debit;
    }
    const bk = (await ctx.db.select().from(bookings)).filter((b) => b.updatedAt >= from && b.updatedAt <= to);
    const commissionByType: Record<string, number> = {};
    for (const b of bk) if (b.commissionAmount) commissionByType[b.commissionReason] = (commissionByType[b.commissionReason] ?? 0) + b.commissionAmount;
    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
    return {
      byAccount,
      byDay,
      commissionByType,
      balanced: totalDebit === totalCredit,
      totals: { debit: totalDebit, credit: totalCredit },
      balances: {
        held: await accountBalance(ctx.db, 'held_for_technicians'),
        payable: await accountBalance(ctx.db, 'technician_payable'),
        revenue: await accountBalance(ctx.db, 'platform_revenue'),
      },
      vat: { enabled: Boolean((await ctx.settings.all()).vat_invoices) },
    };
  });
  r.get(`${P}/ledger.csv`, async (req, reply) => {
    await requireAdmin(req, ctx, ['finance']);
    const rows = await ctx.db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.id));
    const csv = ['id,transaction,booking,technician,account,debit_baisa,credit_baisa,created_at', ...rows.map((e) => [e.id, e.transactionId, e.bookingId ?? '', e.technicianId ?? '', e.account, e.debit, e.credit, e.createdAt.toISOString()].join(','))].join('\n');
    reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="ledger.csv"');
    return reply.send(csv);
  });

  // ---------------------------------------------------------------- catalog and areas (§9.2 #11, #12)
  r.get(`${P}/catalog`, async (req) => {
    await requireAdmin(req, ctx, 'any');
    return ctx.db.select().from(serviceCatalog).orderBy(asc(serviceCatalog.sort));
  });
  r.post(
    `${P}/catalog`,
    {
      schema: {
        body: z.object({
          id: z.string().uuid().optional(),
          nameAr: z.string().min(1).max(80),
          nameEn: z.string().min(1).max(80),
          descriptionAr: z.string().max(500).nullish(),
          descriptionEn: z.string().max(500).nullish(),
          durationMin: z.number().int().min(5).max(1440).nullish(),
          priceGuideMin: z.number().int().min(0).nullish(),
          priceGuideMax: z.number().int().min(0).nullish(),
          active: z.boolean(),
          sort: z.number().int().optional(),
          reason: z.string().min(2).max(500),
        }),
      },
    },
    async (req) => {
      const a = await requireAdmin(req, ctx, ['owner']);
      const { reason: why, ...rest } = req.body;
      return { id: await upsertCatalog(ctx, a, rest, why) };
    },
  );
  r.get(`${P}/areas`, async (req) => {
    await requireAdmin(req, ctx, 'any');
    return ctx.db.select().from(areas).orderBy(asc(areas.sort));
  });
  r.patch(
    `${P}/areas/:wilayat`,
    {
      schema: {
        params: z.object({ wilayat: z.string().max(40) }),
        body: z.object({
          active: z.boolean().optional(),
          visitFeeOverride: z.number().int().min(0).nullable().optional(),
          neighbourhoods: z.array(z.object({ id: z.string().max(40), ar: z.string().max(60), en: z.string().max(60), lat: z.number(), lng: z.number(), radius: z.number().int().min(100).max(30000).optional() })).optional(),
          reason: z.string().min(2).max(500),
        }),
      },
    },
    async (req) => {
      const a = await requireAdmin(req, ctx, ['owner']);
      const { reason: why, ...rest } = req.body;
      await updateArea(ctx, a, req.params.wilayat, rest, why);
      return { ok: true };
    },
  );

  // ---------------------------------------------------------------- legal documents (§9.2 #13)
  r.get(`${P}/legal`, async (req) => {
    await requireAdmin(req, ctx, 'any');
    const rows = await ctx.db.select().from(legalDocuments).orderBy(asc(legalDocuments.type), desc(legalDocuments.createdAt));
    return { documents: rows, titles: TITLES, types: DOC_TYPES, outOfDate: await outOfDateDocuments(ctx), variables: SETTINGS.filter((s) => s.legal).map((s) => s.key) };
  });
  r.post(
    `${P}/legal/publish`,
    {
      schema: {
        body: z.object({
          type: z.enum(DOC_TYPES),
          language: z.enum(['ar', 'en']),
          title: z.string().min(2).max(120),
          body: z.string().min(10).max(100_000),
          requiresReacceptance: z.boolean(),
          changeSummary: z.string().min(2).max(2000),
          effectiveAt: z.string().optional(),
          lawyerApproved: z.boolean().default(false),
          reason: z.string().min(2).max(500),
          confirm: z.literal(true),
        }),
      },
    },
    async (req) => {
      const a = await requireAdmin(req, ctx, ['owner']);
      const docId = await publishVersion(ctx, a, { ...req.body, effectiveAt: req.body.effectiveAt ? new Date(req.body.effectiveAt) : null });
      if (req.body.requiresReacceptance) {
        const role = ['technician_agreement', 'code_of_conduct', 'privacy', 'cancellation_refund'].includes(req.body.type) ? 'technician' : 'customer';
        const targets = role === 'technician' ? await ctx.db.select({ id: technicians.userId }).from(technicians).where(inArray(technicians.status, ['active', 'approved_probation', 'paused'])) : [];
        for (const t of targets) await notify(ctx, ctx.db, { userId: t.id, key: 'terms_updated', vars: { doc: req.body.title } });
      }
      return { id: docId };
    },
  );
  r.get(`${P}/consents`, { schema: { querystring: z.object({ docType: z.string().optional(), version: z.string().optional(), userId: z.string().uuid().optional(), format: z.enum(['json', 'csv']).default('json') }) } }, async (req, reply) => {
    await requireAdmin(req, ctx, ['owner', 'support', 'verifier']);
    let rows = await ctx.db.select().from(consents).orderBy(desc(consents.acceptedAt));
    if (req.query.docType) rows = rows.filter((c) => c.docType === req.query.docType);
    if (req.query.version) rows = rows.filter((c) => c.version === req.query.version);
    if (req.query.userId) rows = rows.filter((c) => c.userId === req.query.userId);
    if (req.query.format === 'csv') {
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="consents.csv"');
      return reply.send(['user_id,doc_type,version,accepted_at,context,locale,text_sha256,withdrawn_at', ...rows.map((c) => [c.userId, c.docType, c.version, c.acceptedAt.toISOString(), c.context, c.locale, c.textSha256, c.withdrawnAt?.toISOString() ?? ''].join(','))].join('\n'));
    }
    return rows.slice(0, 500);
  });

  // ---------------------------------------------------------------- messaging (§9.2 #14)
  r.get(`${P}/templates`, async (req) => {
    await requireAdmin(req, ctx, ['owner', 'support']);
    return { templates: await ctx.db.select().from(notificationTemplates).orderBy(asc(notificationTemplates.key)), broadcasts: await ctx.db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).limit(50) };
  });
  r.patch(`${P}/templates/:key`, { schema: { params: z.object({ key: z.string().max(40) }), body: z.object({ bodyAr: z.string().min(2).max(500), bodyEn: z.string().min(2).max(500), reason: z.string().min(2).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['owner']);
    if (/\{(phone|address|iban)\}/i.test(req.body.bodyAr + req.body.bodyEn)) throw badRequest('sms_private_data');
    await ctx.db.update(notificationTemplates).set({ bodyAr: req.body.bodyAr, bodyEn: req.body.bodyEn, updatedBy: a.id, updatedAt: new Date(ctx.clock.now()) }).where(eq(notificationTemplates.key, req.params.key));
    await audit(ctx.db, a, { action: 'template.update', entity: 'template', entityId: req.params.key, reason: req.body.reason });
    return { ok: true };
  });
  r.post(`${P}/templates/:key/test`, { schema: { params: z.object({ key: z.string().max(40) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['owner', 'support']);
    await notify(ctx, ctx.db, { userId: a.id, key: req.params.key, vars: { code: 'KT-TEST01', name: 'محمد', area: 'الخوض', service: 'تنظيف', window: '—', visit_fee: '5.000', minutes: 15, link: ctx.config.PUBLIC_ORIGIN, hours: 24, amount: '1.000', ref: 'TEST', doc: 'test', days: 7, stars: 5, reason: 'test', what: 'test', detail: '', decision: 'test', date: '—', body: 'test' } });
    return { ok: true };
  });
  r.post(
    `${P}/broadcasts`,
    { schema: { body: z.object({ segment: z.enum(['all_technicians', 'technicians_wilayat', 'customers_open']), wilayat: z.string().optional(), bodyAr: z.string().min(2).max(300), bodyEn: z.string().max(300).default(''), reason: z.string().min(2).max(500), confirm: z.literal(true) }) } },
    async (req) => {
      const a = await requireAdmin(req, ctx, ['owner', 'support']);
      return broadcast(ctx, a, req.body, req.body.reason);
    },
  );

  // ---------------------------------------------------------------- reviews and support (§9.2 #15, #16)
  r.get(`${P}/reviews`, async (req) => {
    await requireAdmin(req, ctx, ['support']);
    const rows = await ctx.db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(300);
    const techs = await ctx.db.select({ id: technicians.userId, name: technicians.publicName }).from(technicians);
    return rows.map((r2) => ({ ...r2, technician: techs.find((t) => t.id === r2.technicianId)?.name }));
  });
  r.post(`${P}/reviews/:id/moderate`, { schema: { params: id, body: z.object({ hide: z.boolean(), reason: z.string().min(2).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    await moderateReview(ctx, a, req.params.id, req.body.hide, req.body.reason);
    return { ok: true };
  });
  r.get(`${P}/support`, async (req) => {
    await requireAdmin(req, ctx, ['support']);
    return ctx.db.select().from(supportTickets).orderBy(desc(supportTickets.updatedAt)).limit(300);
  });
  r.post(`${P}/support/:id/reply`, { schema: { params: id, body: z.object({ body: z.string().min(1).max(4000), status: z.enum(['open', 'answered', 'closed']).optional() }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['support']);
    await replyTicket(ctx, a, req.params.id, req.body.body, req.body.status);
    return { ok: true };
  });
  r.get(`${P}/messages/flagged`, async (req) => {
    await requireAdmin(req, ctx, ['support']);
    return ctx.db.select().from(messages).where(sql`${messages.flaggedReason} is not null`).orderBy(desc(messages.createdAt)).limit(200);
  });

  // ---------------------------------------------------------------- settings (§9.2 #17)
  r.get(`${P}/settings`, async (req) => {
    await requireAdmin(req, ctx, 'any');
    const values = await ctx.settings.all();
    const defaults = defaultSettings();
    const hist = await ctx.db.select().from(settingsHistory).orderBy(desc(settingsHistory.id)).limit(500);
    return SETTINGS.map((s) => ({ ...s, value: values[s.key], defaultValue: defaults[s.key], history: hist.filter((h) => h.key === s.key).slice(0, 10) }));
  });
  r.put(`${P}/settings/:key`, { schema: { params: z.object({ key: z.string().max(60) }), body: z.object({ value: z.unknown(), reason: z.string().min(2).max(500), confirm: z.literal(true) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['owner']);
    await changeSetting(ctx, a, req.params.key, req.body.value, req.body.reason);
    return { ok: true };
  });

  // staff accounts (owner only)
  r.get(`${P}/staff`, async (req) => {
    await requireAdmin(req, ctx, ['owner']);
    const rows = await ctx.db.select().from(adminAccounts);
    const us = await ctx.db.select().from(users).where(eq(users.role, 'admin'));
    return rows.map((a) => ({ id: a.userId, name: us.find((u) => u.id === a.userId)?.displayName, role: a.role, active: a.active, lastSignInAt: a.lastSignInAt, lastSignInDevice: a.lastSignInDevice, totpEnabled: a.totpEnabled, lockedUntil: a.lockedUntil }));
  });
  r.post(`${P}/staff`, { schema: { body: z.object({ email: z.string().email(), displayName: z.string().min(2).max(80), role: z.enum(['verifier', 'support', 'finance', 'owner']), temporaryPassword: z.string().min(12).max(200), reason: z.string().min(2).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['owner']);
    return { id: await createAdmin(ctx, { email: req.body.email, password: req.body.temporaryPassword, role: req.body.role, displayName: req.body.displayName, createdBy: a.id }) };
  });
  r.post(`${P}/staff/:id`, { schema: { params: id, body: z.object({ active: z.boolean().optional(), role: z.enum(['verifier', 'support', 'finance', 'owner']).optional(), resetTotp: z.boolean().optional(), newPassword: z.string().min(12).max(200).optional(), reason: z.string().min(2).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['owner']);
    if (req.params.id === a.id && req.body.active === false) throw conflict('cannot_disable_self');
    await ctx.db
      .update(adminAccounts)
      .set({
        ...(req.body.active != null ? { active: req.body.active } : {}),
        ...(req.body.role ? { role: req.body.role } : {}),
        ...(req.body.resetTotp ? { totpEnabled: false, totpSecretEnc: null, recoveryCodes: [] } : {}),
        ...(req.body.newPassword ? { passwordHash: await hashPassword(req.body.newPassword) } : {}),
      })
      .where(eq(adminAccounts.userId, req.params.id));
    if (req.body.active === false || req.body.resetTotp || req.body.newPassword) {
      const { logoutEverywhere } = await import('../services/auth');
      await logoutEverywhere(ctx, req.params.id, 'staff_change');
    }
    await audit(ctx.db, a, { action: 'staff.update', entity: 'admin', entityId: req.params.id, reason: req.body.reason, data: { active: req.body.active, role: req.body.role, resetTotp: req.body.resetTotp, password: Boolean(req.body.newPassword) } });
    return { ok: true };
  });

  // ---------------------------------------------------------------- security and audit (§9.2 #18)
  r.get(`${P}/security`, async (req) => {
    const a = await requireAdmin(req, ctx, 'any');
    const isOwner = a.adminRole === 'owner';
    const signins = await ctx.db.select().from(signInHistory).orderBy(desc(signInHistory.createdAt)).limit(200);
    const blocked = isOwner ? await ctx.db.select().from(blockedIdentities).orderBy(desc(blockedIdentities.createdAt)) : [];
    return {
      sessions: await listSessions(ctx, isOwner ? undefined : a.id),
      signIns: isOwner ? signins : signins.filter((s) => s.userId === a.id),
      blocked: blocked.map((b) => ({ id: b.id, kind: b.kind, reason: b.reason, createdAt: b.createdAt })),
    };
  });
  r.post(`${P}/security/sessions/:id/end`, { schema: { params: id, body: R } }, async (req) => {
    const a = await requireAdmin(req, ctx, 'any');
    const s = (await ctx.db.select().from(sessions).where(eq(sessions.id, req.params.id)))[0];
    if (!s) throw notFound();
    if (a.adminRole !== 'owner' && s.userId !== a.id) throw forbidden();
    await logout(ctx, s.id);
    await audit(ctx.db, a, { action: 'session.end', entity: 'session', entityId: s.id, reason: req.body.reason });
    return { ok: true };
  });
  r.get(`${P}/audit`, { schema: { querystring: z.object({ action: z.string().optional(), entity: z.string().optional(), entityId: z.string().optional(), page: z.coerce.number().int().min(1).default(1) }) } }, async (req) => {
    await requireAdmin(req, ctx, ['owner']);
    let rows = await ctx.db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(5000);
    if (req.query.action) rows = rows.filter((x) => x.action.includes(req.query.action!));
    if (req.query.entity) rows = rows.filter((x) => x.entity === req.query.entity);
    if (req.query.entityId) rows = rows.filter((x) => x.entityId === req.query.entityId);
    const staff = await ctx.db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.role, 'admin'));
    return { total: rows.length, rows: rows.slice((req.query.page - 1) * 100, req.query.page * 100).map((x) => ({ ...x, actorName: staff.find((s) => s.id === x.actorId)?.name ?? null })), chain: await verifyAudit(ctx.db) };
  });
  r.post(`${P}/blocked`, { schema: { body: z.object({ kind: z.enum(['phone', 'civil_id', 'iban']), value: z.string().max(40), reason: z.string().min(2).max(500) }) } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['owner']);
    const { normaliseOmanPhone, normaliseCivilId, normaliseOmanIban } = await import('@katf/shared');
    const v = req.body.kind === 'phone' ? normaliseOmanPhone(req.body.value) : req.body.kind === 'civil_id' ? normaliseCivilId(req.body.value) : normaliseOmanIban(req.body.value);
    if (!v) throw badRequest('invalid_value');
    await ctx.db.insert(blockedIdentities).values({ id: newId(), kind: req.body.kind, indexValue: ctx.crypto.blindIndex(req.body.kind, v), reason: req.body.reason, createdBy: a.id });
    await audit(ctx.db, a, { action: 'blocked.add', entity: 'blocked_identity', reason: req.body.reason, data: { kind: req.body.kind } });
    return { ok: true };
  });
  r.delete(`${P}/blocked/:id`, { schema: { params: id, body: R } }, async (req) => {
    const a = await requireAdmin(req, ctx, ['owner']);
    await ctx.db.delete(blockedIdentities).where(eq(blockedIdentities.id, req.params.id));
    await audit(ctx.db, a, { action: 'blocked.remove', entity: 'blocked_identity', entityId: req.params.id, reason: req.body.reason });
    return { ok: true };
  });
  r.get(`${P}/waitlist`, async (req) => {
    await requireAdmin(req, ctx, ['owner', 'support']);
    const rows = await ctx.db.select({ wilayat: waitlistEntries.wilayat, createdAt: waitlistEntries.createdAt }).from(waitlistEntries);
    return rows;
  });

  // admin-scoped signed files (evidence, documents are separate and logged)
  r.get(`${P}/files/:id`, { schema: { params: id, querystring: z.object({ exp: z.string(), sig: z.string() }) } }, async (req, reply) => {
    await requireAdmin(req, ctx, 'any');
    const f = await readSignedFile(ctx, req.params.id, req.query.exp, req.query.sig);
    reply.header('content-type', f.mime).header('cache-control', 'private, no-store');
    return reply.send(f.data);
  });

}
