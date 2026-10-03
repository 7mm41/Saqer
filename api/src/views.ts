/**
 * What each side may see (§7, §8.4, §12). The technician sees the exact address and the
 * customer's first name only after accepting; customers see only the technician's public card.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { label, BOOKING_PROBLEMS, trackingStep, techStep, settleVisitOnly, share } from '@katf/shared';
import type { Ctx } from './ctx';
import { areas, bookingEvents, callLogs, disputes, ledgerEntries, messages, payments, quotes, refunds, reviews, technicians, users, bookings } from './db/schema';
import { signedFileUrl } from './services/files';
import { cancelPreview, currentQuote, firstName } from './services/bookings';
import { capturedTotal, snap, type Booking } from './services/booking-core';

const url = (ctx: Ctx, id?: string | null, ttl = 600) => (id ? signedFileUrl(ctx, id, ttl) : null);
const urls = (ctx: Ctx, ids?: string[] | null) => (ids ?? []).map((id) => ({ id, url: url(ctx, id)! }));

async function areaNames(ctx: Ctx, b: Booking) {
  const a = (await ctx.db.select().from(areas).where(eq(areas.wilayat, b.wilayat)))[0];
  const n = a?.neighbourhoods.find((x) => x.id === b.neighbourhood);
  return { wilayat: { ar: a?.nameAr ?? b.wilayat, en: a?.nameEn ?? b.wilayat }, neighbourhood: { ar: n?.ar ?? b.neighbourhood, en: n?.en ?? b.neighbourhood } };
}

export async function techCard(ctx: Ctx, technicianId: string | null) {
  if (!technicianId) return null;
  const t = (await ctx.db.select().from(technicians).where(eq(technicians.userId, technicianId)))[0];
  if (!t) return null;
  return {
    name: t.publicName,
    photoUrl: url(ctx, t.photoFileId, 3600),
    rating: t.ratingCount ? Math.round((t.ratingSum * 10) / t.ratingCount) / 10 : null,
    ratingCount: t.ratingCount,
    jobs: t.jobsCompleted,
    verified: true,
    slug: t.bookingSlug,
  };
}

function quoteView(ctx: Ctx, q: typeof quotes.$inferSelect | null, b: Booking, captured: number) {
  if (!q) return null;
  return {
    id: q.id,
    version: q.version,
    status: q.status,
    items: q.items.map((i) => ({ kind: i.kind, label: i.label, qty: i.qty, unitPrice: i.unitPrice, amount: i.qty * i.unitPrice })),
    total: q.total,
    laborTotal: q.laborTotal,
    partsTotal: q.partsTotal,
    visitFee: b.visitFee,
    alreadyPaid: captured,
    due: Math.max(0, q.total - captured),
    validUntil: q.validUntil,
    warrantyDays: Number(snap(b).warranty_days),
  };
}

export async function customerBookingView(ctx: Ctx, b: Booking) {
  const captured = await capturedTotal(ctx.db, b.id);
  const q = await currentQuote(ctx.db, b.id);
  const s = snap(b);
  const accepted = !['pending_payment', 'requested', 'expired', 'expired_unpaid'].includes(b.status) || Boolean(b.timeline.accepted);
  const preview = await cancelPreview(ctx, b);
  const dispute = (await ctx.db.select().from(disputes).where(eq(disputes.bookingId, b.id)).orderBy(desc(disputes.createdAt)))[0] ?? null;
  const myReview = (await ctx.db.select().from(reviews).where(and(eq(reviews.bookingId, b.id), eq(reviews.direction, 'customer_to_technician'))))[0] ?? null;
  const pendingPayment = (await ctx.db.select().from(payments).where(and(eq(payments.bookingId, b.id), eq(payments.status, 'pending'))).orderBy(desc(payments.createdAt)))[0] ?? null;
  const confirmedAt = b.timeline.confirmed ? Date.parse(b.timeline.confirmed) : null;
  const now = ctx.clock.now();
  const revisits = await ctx.db.select({ id: bookings.id, code: bookings.code, status: bookings.status }).from(bookings).where(eq(bookings.parentBookingId, b.id));
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    step: trackingStep(b.status as never),
    isRevisit: b.isRevisit,
    entryMode: b.entryMode,
    problem: { id: b.problem, ar: label(BOOKING_PROBLEMS, b.problem, 'ar'), en: label(BOOKING_PROBLEMS, b.problem, 'en') },
    units: b.units,
    problemText: b.problemText,
    media: urls(ctx, b.problemMedia),
    window: { start: b.windowStart, end: b.windowEnd },
    area: await areaNames(ctx, b),
    address: { ...b.address, notesEnc: undefined, notes: ctx.crypto.decrypt(b.address.notesEnc ?? null) },
    technician: accepted ? await techCard(ctx, b.technicianId) : null,
    etaMinutes: b.etaMinutes,
    timeline: b.timeline,
    arrivalPhotoUrl: b.arrival?.photoFileId ? url(ctx, b.arrival.photoFileId) : null,
    diagnosis: b.diagnosis ? { faults: b.diagnosis.faults, notes: b.diagnosis.notes, photos: urls(ctx, b.diagnosis.photos) } : null,
    quote: q && q.status !== 'pending_admin' ? quoteView(ctx, q, b, captured) : null,
    completion: b.completion
      ? { before: urls(ctx, b.completion.before), after: urls(ctx, b.completion.after), notes: b.completion.notes, parts: b.completion.parts.map((p) => p.label) }
      : null,
    autoConfirmAt: b.timeline.completed_pending_confirmation ? Date.parse(b.timeline.completed_pending_confirmation) + Number(s.auto_confirm_hours) * 3_600_000 : null,
    money: { visitFee: b.visitFee, quoteTotal: b.quoteTotal, paid: captured, refunded: b.refundTotal },
    pendingPayment: pendingPayment ? { id: pendingPayment.id, amount: pendingPayment.amount, kind: pendingPayment.kind, checkoutUrl: pendingPayment.checkoutUrl } : null,
    cancel: preview,
    dispute: dispute ? { id: dispute.id, status: dispute.status, reasonCode: dispute.reasonCode, slaDueAt: dispute.slaDueAt, decision: dispute.decision, decisionAmounts: dispute.decisionAmounts, appealUsed: dispute.appealUsed } : null,
    review: myReview ? { rating: myReview.rating } : null,
    can: {
      cancel: preview.allowed,
      approve: b.status === 'quote_sent',
      pay: b.status === 'repair_payment_pending' || b.status === 'pending_payment',
      confirm: b.status === 'completed_pending_confirmation',
      dispute: b.status === 'completed_pending_confirmation',
      rate: ['settled', 'paid_out', 'confirmed'].includes(b.status) && !b.isRevisit && !myReview && confirmedAt != null && now < confirmedAt + Number(s.review_window_days) * 86_400_000,
      revisit:
        ['settled', 'paid_out', 'confirmed'].includes(b.status) &&
        !b.isRevisit &&
        confirmedAt != null &&
        now < confirmedAt + Number(s.warranty_days) * 86_400_000 &&
        revisits.length < Number(s.max_free_revisits),
      rebook: ['settled', 'paid_out', 'confirmed'].includes(b.status) && Boolean(b.technicianId),
      call: accepted && ['accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote_sent', 'repair_payment_pending', 'in_progress', 'completed_pending_confirmation'].includes(b.status),
      receipt: ['settled', 'paid_out', 'confirmed', 'closed_visit_only', 'customer_absent', 'refunded_partial', 'refunded_full', 'cancelled_by_customer', 'repair_failed_closed'].includes(b.status),
    },
    warrantyEndsAt: confirmedAt ? confirmedAt + Number(s.warranty_days) * 86_400_000 : null,
    revisits,
    policy: {
      freeCancelMinutes: Number(s.free_cancel_minutes),
      lateCancelFeePct: Number(s.late_cancel_fee_pct),
      onTheWayCancelFeePct: Number(s.on_the_way_cancel_fee_pct),
      disputeSlaHours: Number(s.dispute_sla_hours),
      autoConfirmHours: Number(s.auto_confirm_hours),
      warrantyDays: Number(s.warranty_days),
    },
  };
}

export async function techBookingView(ctx: Ctx, b: Booking, technicianId: string) {
  const captured = await capturedTotal(ctx.db, b.id);
  const s = snap(b);
  const accepted = b.technicianId === technicianId && b.status !== 'requested';
  const customer = accepted ? (await ctx.db.select().from(users).where(eq(users.id, b.customerId)))[0] : null;
  const q = await currentQuote(ctx.db, b.id);
  const visitOnly = settleVisitOnly({ visitFee: b.visitFee, visitShareBps: Number(s.visit_only_platform_share_pct), gatewayBps: 0 });
  const calls = accepted ? await ctx.db.select().from(callLogs).where(and(eq(callLogs.bookingId, b.id), eq(callLogs.callerRole, 'technician'))) : [];
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    step: techStep(b.status as never),
    isRevisit: b.isRevisit,
    entryMode: b.entryMode,
    problem: { id: b.problem, ar: label(BOOKING_PROBLEMS, b.problem, 'ar'), en: label(BOOKING_PROBLEMS, b.problem, 'en') },
    units: b.units,
    problemText: b.problemText,
    media: urls(ctx, b.problemMedia),
    window: { start: b.windowStart, end: b.windowEnd },
    area: await areaNames(ctx, b),
    // exact location and customer first name only after acceptance (§7.2)
    approx: { lat: Math.round(b.lat * 100) / 100, lng: Math.round(b.lng * 100) / 100 },
    location: accepted ? { lat: b.lat, lng: b.lng } : null,
    address: accepted ? { ...b.address, notesEnc: undefined, notes: ctx.crypto.decrypt(b.address.notesEnc ?? null) } : null,
    customerFirstName: accepted ? firstName(customer?.displayName) : null,
    acceptDeadline: b.acceptDeadline,
    money: {
      visitFee: b.visitFee,
      commissionBps: b.commissionBps,
      commissionReason: b.commissionReason,
      visitOnlyNet: visitOnly.technicianNet,
      quoteTotal: b.quoteTotal,
      expectedNet: b.quoteTotal ? b.quoteTotal - share(b.quoteTotal, b.commissionBps) : null,
      technicianNet: b.technicianNet,
      paid: captured,
      payoutDueAt: b.payoutDueAt,
    },
    quote: q ? quoteView(ctx, q, b, captured) : null,
    diagnosis: b.diagnosis ? { ...b.diagnosis, photos: urls(ctx, b.diagnosis.photos) } : null,
    completion: b.completion ? { ...b.completion, before: urls(ctx, b.completion.before), after: urls(ctx, b.completion.after) } : null,
    arrival: b.arrival,
    timeline: b.timeline,
    etaMinutes: b.etaMinutes,
    callAttempts: calls.length,
    waitUntil: b.timeline.arrived ? Date.parse(b.timeline.arrived) + Number(s.customer_wait_minutes) * 60_000 : null,
    freeCancelUntil: Date.parse(b.timeline.requested ?? b.createdAt.toISOString()) + Number(s.free_cancel_minutes) * 60_000,
    policy: {
      geofenceMeters: Number(s.arrival_geofence_meters),
      warrantyDays: Number(s.warranty_days),
      quoteExpiryMinutes: Number(s.quote_expiry_minutes),
      strikeHours: Number(s.technician_cancel_strike_hours),
      probationMaxQuote: Number(s.probation_max_quote),
    },
  };
}

export async function adminBookingView(ctx: Ctx, b: Booking) {
  const events = await ctx.db.select().from(bookingEvents).where(eq(bookingEvents.bookingId, b.id)).orderBy(asc(bookingEvents.id));
  const qs = await ctx.db.select().from(quotes).where(eq(quotes.bookingId, b.id)).orderBy(asc(quotes.version));
  const pays = await ctx.db.select().from(payments).where(eq(payments.bookingId, b.id));
  const refs = await ctx.db.select().from(refunds).where(eq(refunds.bookingId, b.id));
  const ledger = await ctx.db.select().from(ledgerEntries).where(eq(ledgerEntries.bookingId, b.id)).orderBy(asc(ledgerEntries.id));
  const calls = await ctx.db.select().from(callLogs).where(eq(callLogs.bookingId, b.id));
  const msgs = await ctx.db.select().from(messages).where(eq(messages.bookingId, b.id)).orderBy(asc(messages.createdAt));
  const ds = await ctx.db.select().from(disputes).where(eq(disputes.bookingId, b.id));
  const customer = (await ctx.db.select().from(users).where(eq(users.id, b.customerId)))[0];
  return {
    ...b,
    settingsSnapshot: undefined,
    address: { ...b.address, notesEnc: undefined, notes: ctx.crypto.decrypt(b.address.notesEnc ?? null) },
    area: await areaNames(ctx, b),
    customer: { id: b.customerId, name: customer?.displayName ?? null, status: customer?.status ?? null },
    technician: await techCard(ctx, b.technicianId),
    media: urls(ctx, b.problemMedia),
    arrivalPhotoUrl: url(ctx, b.arrival?.photoFileId),
    diagnosis: b.diagnosis ? { ...b.diagnosis, photos: urls(ctx, b.diagnosis.photos) } : null,
    completion: b.completion
      ? { ...b.completion, before: urls(ctx, b.completion.before), after: urls(ctx, b.completion.after), parts: b.completion.parts.map((p) => ({ label: p.label, receiptUrl: url(ctx, p.receiptFileId) })) }
      : null,
    events: events.map((e) => ({ ...e, mediaUrl: url(ctx, e.mediaFileId) })),
    quotes: qs,
    payments: pays.map((p) => ({ ...p, checkoutUrl: undefined })),
    refunds: refs,
    ledger,
    calls,
    messages: msgs,
    disputes: ds.map((d) => ({ ...d, evidence: urls(ctx, d.evidence) })),
    policy: snap(b),
  };
}

export async function techListItem(ctx: Ctx, b: Booking) {
  const a = await areaNames(ctx, b);
  return { id: b.id, code: b.code, status: b.status, problem: label(BOOKING_PROBLEMS, b.problem, 'ar'), problemEn: label(BOOKING_PROBLEMS, b.problem, 'en'), window: { start: b.windowStart, end: b.windowEnd }, area: a, visitFee: b.visitFee, net: b.technicianNet, isRevisit: b.isRevisit };
}

