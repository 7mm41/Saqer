/**
 * Booking flows (§5, §7.3, §8.3, §8.4): customer actions, technician actions, payments and timers.
 */
import { and, desc, eq, gte, inArray, lt, sql, gt, isNull } from 'drizzle-orm';
import {
  chooseCommissionBps,
  customerCancelTier,
  cancelFeeBpsForTier,
  distanceMeters,
  generateSlots,
  quoteTotals,
  formatOMR,
  formatWindow,
  formatDateShort,
  label,
  BOOKING_PROBLEMS,
  NEIGHBOURHOOD_RADIUS_M,
  ACTIVE_STATUSES,
  muscatDate,
  type QuoteLine,
  type EntryMode,
} from '@katf/shared';
import type { Ctx, Actor } from '../ctx';
import { SYSTEM } from '../ctx';
import type { DbOrTx } from '../db';
import { addresses, areas, bookings, callLogs, disputes, payments, quotes, serviceCatalog, strikes, technicians, users, reviews, bookingOffers } from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { bookingCode, newId } from '../lib/ids';
import { audit } from './audit';
import { assertAcceptsCurrent, pendingAcceptances, recordConsents, REQUIRED } from './legal';
import { notify, notifyAdmins } from './notifications';
import { cancelJobs, registerJob, schedule } from './scheduler';
import {
  approvedQuote,
  capturedTotal,
  loadBooking,
  logEvent,
  postCapture,
  settleCancellation,
  settleConfirmed,
  settleRepairFailedBooking,
  settleVisitOnlyBooking,
  snap,
  transition,
  type Booking,
} from './booking-core';
import { captureMeta } from './files';
import { isOwnUrl } from '../lib/urls';

const MIN = 60_000;
const HOUR = 3_600_000;

// ---------------------------------------------------------------- helpers

export function trackingToken(ctx: Ctx, bookingId: string) {
  return ctx.crypto.sign(`track:${bookingId}`, 'url');
}
export function trackingLink(ctx: Ctx, b: Booking) {
  return `${ctx.config.PUBLIC_ORIGIN}/b/${b.code}?t=${trackingToken(ctx, b.id)}`;
}
export function techJobLink(ctx: Ctx, b: Booking) {
  return `${ctx.config.TECH_ORIGIN}/tech/jobs/${b.id}`;
}

async function techRow(tx: DbOrTx, id: string) {
  return (await tx.select().from(technicians).where(eq(technicians.userId, id)))[0] ?? null;
}

export function firstName(full: string | null | undefined) {
  return (full ?? '').trim().split(/\s+/)[0] ?? '';
}

async function publish(ctx: Ctx, b: Booking, type: string) {
  await ctx.bus.publish({ bookingId: b.id, status: b.status, type, at: ctx.clock.now() });
}

const isBookable = (t: typeof technicians.$inferSelect, now: number) =>
  ['active', 'approved_probation'].includes(t.status) && t.available && !(t.vacationUntil && t.vacationUntil.getTime() > now);

/** Active jobs of a technician that overlap a window. */
async function overlapping(tx: DbOrTx, technicianId: string, start: Date, end: Date, excludeId?: string) {
  const rows = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.technicianId, technicianId),
        inArray(bookings.status, ['accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote_sent', 'repair_payment_pending', 'in_progress']),
        lt(bookings.windowStart, end),
        gt(bookings.windowEnd, start),
      ),
    );
  return rows.filter((r) => r.id !== excludeId);
}

async function jobsOnDay(tx: DbOrTx, technicianId: string, day: string) {
  const rows = await tx
    .select({ start: bookings.windowStart })
    .from(bookings)
    .where(and(eq(bookings.technicianId, technicianId), inArray(bookings.status, [...ACTIVE_STATUSES])));
  return rows.filter((r) => muscatDate(r.start.getTime()) === day).length;
}

// ---------------------------------------------------------------- availability

export async function areaFor(tx: DbOrTx, wilayat: string) {
  return (await tx.select().from(areas).where(eq(areas.wilayat, wilayat)))[0] ?? null;
}

export async function checkCoverage(tx: DbOrTx, i: { wilayat: string; neighbourhood: string; lat: number; lng: number }) {
  const area = await areaFor(tx, i.wilayat);
  if (!area?.active) return { ok: false as const, reason: 'outside_coverage' };
  const n = area.neighbourhoods.find((x) => x.id === i.neighbourhood);
  if (!n) return { ok: false as const, reason: 'outside_coverage' };
  const d = distanceMeters({ lat: i.lat, lng: i.lng }, n);
  if (d > (n.radius ?? NEIGHBOURHOOD_RADIUS_M)) return { ok: false as const, reason: 'pin_outside_area' };
  return { ok: true as const, area };
}

function servesArea(t: typeof technicians.$inferSelect, wilayat: string, neighbourhood?: string) {
  return t.areas.some((a) => a.wilayat === wilayat && (!neighbourhood || a.neighbourhoods.length === 0 || a.neighbourhoods.includes(neighbourhood)));
}

export async function availableSlots(ctx: Ctx, i: { technicianId?: string | null; wilayat?: string; neighbourhood?: string }) {
  const s = await ctx.settings.all();
  const now = ctx.clock.now();
  const base = {
    now,
    days: Number(s.booking_days_ahead),
    slotMinutes: Number(s.slot_length_minutes),
    weekendEnabled: Boolean(s.weekend_slots_enabled),
    leadMinutes: 60,
  };
  const candidates = i.technicianId
    ? [await techRow(ctx.db, i.technicianId)].filter(Boolean)
    : (await ctx.db.select().from(technicians).where(inArray(technicians.status, ['active', 'approved_probation']))).filter((t) => !i.wilayat || servesArea(t, i.wilayat, i.neighbourhood));
  const out = new Map<number, { start: number; end: number; technicians: number }>();
  for (const t of candidates as (typeof technicians.$inferSelect)[]) {
    if (!isBookable(t, now)) continue;
    const slots = generateSlots({ ...base, dayStart: t.workingHours.from, dayEnd: t.workingHours.to, workingDays: t.workingDays });
    for (const slot of slots) {
      if ((await overlapping(ctx.db, t.userId, new Date(slot.start), new Date(slot.end))).length) continue;
      if ((await jobsOnDay(ctx.db, t.userId, muscatDate(slot.start))) >= t.maxJobsPerDay) continue;
      const cur = out.get(slot.start) ?? { ...slot, technicians: 0 };
      cur.technicians++;
      out.set(slot.start, cur);
    }
  }
  if (!i.technicianId && !s.marketplace_dispatch && candidates.length === 0) {
    // Phase 1 without technicians in the area: still offer working-hours slots; admin dispatches manually.
    for (const slot of generateSlots({ ...base, dayStart: String(s.work_day_start), dayEnd: String(s.work_day_end) })) out.set(slot.start, { ...slot, technicians: 0 });
  }
  return [...out.values()].sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------- create + pay

export interface CreateBookingInput {
  technicianSlug?: string | null;
  repeatOf?: string | null;
  problem: string;
  units: { type: string; brand?: string; count: number }[];
  problemText?: string | null;
  mediaIds: string[];
  urgency: 'today' | 'day';
  address: { wilayat: string; neighbourhood: string; wayNo?: string | null; buildingNo?: string | null; flatNo?: string | null; landmark?: string | null; notes?: string | null; label?: string | null };
  lat: number;
  lng: number;
  saveAddress: boolean;
  windowStart: number;
  windowEnd: number;
  name: string;
  email?: string | null;
  acceptedDocIds: string[];
  locale: 'ar' | 'en';
  returnUrl: string;
}

export async function createBooking(ctx: Ctx, customer: Actor & { id: string }, i: CreateBookingInput, meta: { ip?: string | null; ua?: string | null }) {
  const s = await ctx.settings.all();
  if (s.maintenance_mode) throw conflict('maintenance');
  if (!BOOKING_PROBLEMS.some((p) => p.id === i.problem)) throw badRequest('invalid_problem');
  if ((i.problemText ?? '').length > Number(s.problem_text_max_chars)) throw badRequest('too_long');
  if (i.mediaIds.length > Number(s.max_booking_media)) throw badRequest('too_many_files');
  if (!i.name.trim()) throw badRequest('required', { field: 'name' });
  await assertAcceptsCurrent(ctx.db, REQUIRED.customer, i.acceptedDocIds);
  const cov = await checkCoverage(ctx.db, { ...i.address, lat: i.lat, lng: i.lng });
  if (!cov.ok) throw badRequest(cov.reason === 'pin_outside_area' ? 'pin_outside_area' : 'outside_coverage');
  const now = ctx.clock.now();

  // Which technician (direct link) and which entry mode
  let tech: typeof technicians.$inferSelect | null = null;
  let entryMode: EntryMode = 'marketplace';
  if (i.technicianSlug) {
    tech = (await ctx.db.select().from(technicians).where(eq(technicians.bookingSlug, i.technicianSlug)))[0] ?? null;
    if (!tech || !isBookable(tech, now)) throw conflict('technician_unavailable');
    entryMode = 'direct_link';
  }
  if (i.repeatOf) {
    const prev = await loadBooking(ctx.db, i.repeatOf);
    if (prev.customerId !== customer.id || !prev.technicianId) throw forbidden();
    tech = await techRow(ctx.db, prev.technicianId);
    if (!tech || !isBookable(tech, now)) throw conflict('technician_unavailable');
    entryMode = 'repeat';
  }
  const slots = await availableSlots(ctx, { technicianId: tech?.userId ?? null, wilayat: i.address.wilayat, neighbourhood: i.address.neighbourhood });
  if (!slots.some((x) => x.start === i.windowStart && x.end === i.windowEnd)) throw conflict('slot_unavailable');

  let isRepeatPair = false;
  if (tech) {
    const prior = await ctx.db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.customerId, customer.id), eq(bookings.technicianId, tech.userId), inArray(bookings.status, ['confirmed', 'settled', 'paid_out'])))
      .limit(1);
    isRepeatPair = prior.length > 0;
  }
  const commission = chooseCommissionBps({
    entryMode,
    isRepeatPair,
    standardBps: Number(s.commission_pct),
    ownCustomerBps: Number(s.own_customer_commission_pct),
    repeatCustomerBps: Number(s.repeat_customer_commission_pct),
    overrideBps: tech?.commissionOverrideBps ?? null,
  });
  const visitFee = cov.area.visitFeeOverride ?? Number(s.visit_fee);

  const id = newId();
  const paymentId = newId();
  const code = bookingCode(String(s.booking_code_prefix || 'KT'));
  const snapshot = await ctx.settings.snapshot();
  const result = await ctx.db.transaction(async (tx) => {
    await tx.update(users).set({ displayName: i.name.trim().slice(0, 80), locale: i.locale, ...(i.email ? { emailEnc: ctx.crypto.encrypt(i.email.trim().toLowerCase()) } : {}) }).where(eq(users.id, customer.id));
    if (i.saveAddress)
      await tx.insert(addresses).values({
        id: newId(),
        userId: customer.id,
        label: i.address.label ?? null,
        wilayat: i.address.wilayat,
        neighbourhood: i.address.neighbourhood,
        wayNo: i.address.wayNo ?? null,
        buildingNo: i.address.buildingNo ?? null,
        flatNo: i.address.flatNo ?? null,
        landmark: i.address.landmark ?? null,
        lat: i.lat,
        lng: i.lng,
        notesEnc: ctx.crypto.encrypt(i.address.notes ?? null),
      });
    await tx.insert(bookings).values({
      id,
      code,
      customerId: customer.id,
      technicianId: tech?.userId ?? null,
      entryMode,
      problem: i.problem,
      units: i.units,
      problemText: i.problemText ?? null,
      problemMedia: i.mediaIds,
      urgency: i.urgency,
      address: {
        wilayat: i.address.wilayat,
        neighbourhood: i.address.neighbourhood,
        wayNo: i.address.wayNo ?? null,
        buildingNo: i.address.buildingNo ?? null,
        flatNo: i.address.flatNo ?? null,
        landmark: i.address.landmark ?? null,
        notesEnc: ctx.crypto.encrypt(i.address.notes ?? null),
      },
      wilayat: i.address.wilayat,
      neighbourhood: i.address.neighbourhood,
      lat: i.lat,
      lng: i.lng,
      windowStart: new Date(i.windowStart),
      windowEnd: new Date(i.windowEnd),
      status: 'pending_payment',
      visitFee,
      commissionBps: commission.bps,
      commissionReason: commission.reason,
      settingsSnapshot: snapshot,
      timeline: { pending_payment: new Date(now).toISOString() },
      trackingTokenHash: null,
    });
    await recordConsents(tx, { userId: customer.id, docIds: i.acceptedDocIds, context: 'booking', ipHash: ctx.crypto.hashIp(meta.ip), userAgent: meta.ua ?? null, locale: i.locale, bookingId: id });
    await tx.insert(payments).values({ id: paymentId, bookingId: id, kind: 'visit_fee', provider: ctx.providers.payments.name, amount: visitFee, status: 'pending' });
    await schedule(tx, 'payment_expiry', id, now + Number(s.payment_expiry_minutes) * MIN);
    return { id, code };
  });
  const checkout = await startCheckout(ctx, paymentId, i.returnUrl, i.locale);
  return { ...result, checkoutUrl: checkout.url, trackingToken: trackingToken(ctx, id) };
}

/** Create the provider's hosted checkout for an existing pending payment. */
export async function startCheckout(ctx: Ctx, paymentId: string, returnUrl: string, locale: 'ar' | 'en' = 'ar') {
  // payment providers send the customer back here; only our own origins (exact match) are allowed
  if (!isOwnUrl(ctx, returnUrl)) throw badRequest('bad_return_url');
  const p = (await ctx.db.select().from(payments).where(eq(payments.id, paymentId)))[0];
  if (!p || p.status !== 'pending') throw conflict('payment_not_pending');
  const s = await ctx.settings.all();
  if (ctx.providers.payments.live && !s.legal_gate_cleared) throw conflict('payments_disabled');
  const b = await loadBooking(ctx.db, p.bookingId);
  const sep = returnUrl.includes('?') ? '&' : '?';
  const res = await ctx.providers.payments.createCheckout({
    paymentId,
    amount: p.amount,
    description: `${String(s.app_name_en)} ${b.code} ${p.kind === 'visit_fee' ? 'visit' : 'repair'}`,
    successUrl: `${returnUrl}${sep}payment=${paymentId}&result=success&lang=${locale}`,
    cancelUrl: `${returnUrl}${sep}payment=${paymentId}&result=cancel&lang=${locale}`,
  });
  await ctx.db.update(payments).set({ providerRef: res.providerRef, checkoutUrl: res.url, updatedAt: new Date(ctx.clock.now()) }).where(eq(payments.id, paymentId));
  return res;
}

/** Re-check a payment with the provider and apply the result. Idempotent. */
export async function syncPayment(ctx: Ctx, paymentId: string) {
  const p = (await ctx.db.select().from(payments).where(eq(payments.id, paymentId)))[0];
  if (!p) throw notFound();
  if (p.status !== 'pending' || !p.providerRef) return p.status;
  const st = await ctx.providers.payments.fetchStatus(p.providerRef);
  if (st.status === 'paid') {
    if (st.amount != null && st.amount !== p.amount) {
      ctx.log.error({ payment: p.id }, 'amount mismatch from provider');
      throw conflict('amount_mismatch');
    }
    await onPaymentPaid(ctx, p.id, st.providerPaymentId ?? null);
    return 'paid';
  }
  if (st.status === 'failed' || st.status === 'cancelled') {
    await ctx.db.update(payments).set({ status: 'failed', updatedAt: new Date(ctx.clock.now()) }).where(and(eq(payments.id, p.id), eq(payments.status, 'pending')));
    return 'failed';
  }
  return 'pending';
}

export async function onPaymentPaid(ctx: Ctx, paymentId: string, providerPaymentId: string | null) {
  let after: Booking | null = null;
  let event = '';
  await ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(payments)
      .set({ status: 'paid', paidAt: new Date(ctx.clock.now()), providerPaymentId, updatedAt: new Date(ctx.clock.now()) })
      .where(and(eq(payments.id, paymentId), eq(payments.status, 'pending')))
      .returning();
    const p = updated[0];
    if (!p) return; // already handled
    const b = await loadBooking(tx, p.bookingId, true);
    await postCapture(ctx, tx, b, p.id, p.amount);
    await notify(ctx, tx, { userId: b.customerId, key: 'payment_received', vars: { code: b.code }, link: trackingLink(ctx, b) });
    if (p.kind === 'visit_fee') {
      if (b.status !== 'pending_payment') {
        // paid after expiry or cancellation: give it straight back
        const { refund } = await import('./booking-core');
        await refund(ctx, tx, b, p.amount, 'late_payment', null, true);
        return;
      }
      after = await transition(ctx, tx, b, 'visit_paid', SYSTEM, {});
      event = 'visit_paid';
      await cancelJobs(tx, 'payment_expiry', b.id);
      await afterRequested(ctx, tx, after);
    } else if (p.kind === 'repair') {
      if (b.status !== 'repair_payment_pending') {
        const { refund } = await import('./booking-core');
        await refund(ctx, tx, b, p.amount, 'late_payment', null, true);
        return;
      }
      after = await transition(ctx, tx, b, 'repair_paid', SYSTEM, {});
      event = 'repair_paid';
      await cancelJobs(tx, 'repair_payment_timeout', b.id);
      await notify(ctx, tx, { userId: b.technicianId!, key: 'quote_decision', vars: { code: b.code, decision: 'وافق ودفع — ابدأ العمل' }, link: techJobLink(ctx, b) });
    }
  });
  if (after) await publish(ctx, after, event);
}

/** A booking just became `requested`: offer it to the technician (direct) or dispatch it. */
async function afterRequested(ctx: Ctx, tx: DbOrTx, b: Booking) {
  const s = snap(b);
  const now = ctx.clock.now();
  await notify(ctx, tx, { userId: b.customerId, key: 'booking_confirmed', vars: { code: b.code }, link: trackingLink(ctx, b) });
  if (b.technicianId) {
    const deadline = new Date(now + Number(s.technician_accept_timeout_minutes) * MIN);
    await tx.update(bookings).set({ acceptDeadline: deadline }).where(eq(bookings.id, b.id));
    await schedule(tx, 'accept_timeout', b.id, deadline);
    await offerNotify(ctx, tx, b, b.technicianId);
  } else if ((await ctx.settings.all()).marketplace_dispatch) {
    await dispatchBatch(ctx, tx, b, 1);
  } else {
    await tx.update(bookings).set({ needsAdmin: 'dispatch' }).where(eq(bookings.id, b.id));
    await notifyAdmins(ctx, tx, ['owner', 'support'], `طلب ${b.code} بحاجة إلى تعيين فنّي`);
  }
  await schedule(tx, 'request_final_expiry', b.id, b.windowStart.getTime());
}

async function offerNotify(ctx: Ctx, tx: DbOrTx, b: Booking, technicianId: string) {
  const s = snap(b);
  const area = await areaFor(tx, b.wilayat);
  const n = area?.neighbourhoods.find((x) => x.id === b.neighbourhood);
  await notify(ctx, tx, {
    userId: technicianId,
    key: 'new_request',
    vars: {
      area: n?.ar ?? b.neighbourhood,
      service: label(BOOKING_PROBLEMS, b.problem, 'ar'),
      window: formatWindow(b.windowStart.getTime(), b.windowEnd.getTime(), 'ar'),
      visit_fee: formatOMR(b.visitFee),
      minutes: Number(s.technician_accept_timeout_minutes),
    },
    link: techJobLink(ctx, b),
    alsoSms: true,
  });
}

/** Marketplace (flag): offer to the next batch of matching technicians; first accept wins. */
async function dispatchBatch(ctx: Ctx, tx: DbOrTx, b: Booking, batch: number) {
  const s = snap(b);
  const now = ctx.clock.now();
  const already = (await tx.select({ t: bookingOffers.technicianId }).from(bookingOffers).where(eq(bookingOffers.bookingId, b.id))).map((r) => r.t);
  const all = await tx.select().from(technicians).where(inArray(technicians.status, ['active', 'approved_probation']));
  const pick: string[] = [];
  for (const t of all.sort((a, z) => z.ratingSum / Math.max(1, z.ratingCount) - a.ratingSum / Math.max(1, a.ratingCount))) {
    if (pick.length >= Number(s.dispatch_batch_size)) break;
    if (already.includes(t.userId) || !isBookable(t, now) || !servesArea(t, b.wilayat, b.neighbourhood)) continue;
    if ((await overlapping(tx, t.userId, b.windowStart, b.windowEnd)).length) continue;
    if ((await pendingAcceptances(tx, t.userId, 'technician')).length) continue;
    pick.push(t.userId);
  }
  if (!pick.length) {
    await tx.update(bookings).set({ needsAdmin: 'dispatch' }).where(eq(bookings.id, b.id));
    await notifyAdmins(ctx, tx, ['owner', 'support'], `لم يقبل أحد الطلب ${b.code}`);
    return;
  }
  const expiresAt = new Date(now + Number(s.technician_accept_timeout_minutes) * MIN);
  for (const tid of pick) {
    await tx.insert(bookingOffers).values({ id: newId(), bookingId: b.id, technicianId: tid, batch, expiresAt });
    await offerNotify(ctx, tx, b, tid);
  }
  await tx.update(bookings).set({ acceptDeadline: expiresAt }).where(eq(bookings.id, b.id));
  await schedule(tx, 'accept_timeout', b.id, expiresAt, { batch });
}

// ---------------------------------------------------------------- technician actions

async function asTechBooking(ctx: Ctx, tx: DbOrTx, actor: Actor, bookingId: string) {
  const b = await loadBooking(tx, bookingId, true);
  if (actor.role === 'technician' && b.technicianId !== actor.id) throw notFound();
  return b;
}

export async function acceptBooking(ctx: Ctx, actor: Actor & { id: string }, bookingId: string) {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, bookingId, true);
    const t = await techRow(tx, actor.id);
    if (!t) throw forbidden();
    if (b.technicianId && b.technicianId !== actor.id) throw notFound();
    if (!b.technicianId) {
      const offer = (await tx.select().from(bookingOffers).where(and(eq(bookingOffers.bookingId, b.id), eq(bookingOffers.technicianId, actor.id), eq(bookingOffers.status, 'offered'))))[0];
      if (!offer) throw notFound();
    }
    if (!isBookable(t, ctx.clock.now())) throw conflict('technician_unavailable');
    if ((await pendingAcceptances(tx, actor.id, 'technician')).length) throw conflict('terms_required');
    if ((await overlapping(tx, actor.id, b.windowStart, b.windowEnd, b.id)).length) throw conflict('overlap');
    const next = await transition(ctx, tx, b, 'accept', actor, { technicianId: actor.id, needsAdmin: null });
    await tx.update(bookingOffers).set({ status: 'accepted', respondedAt: new Date(ctx.clock.now()) }).where(and(eq(bookingOffers.bookingId, b.id), eq(bookingOffers.technicianId, actor.id)));
    await tx.update(bookingOffers).set({ status: 'withdrawn' }).where(and(eq(bookingOffers.bookingId, b.id), eq(bookingOffers.status, 'offered')));
    await cancelJobs(tx, 'accept_timeout', b.id);
    await cancelJobs(tx, 'request_final_expiry', b.id);
    const s = snap(b);
    await schedule(tx, 'arrival_grace', b.id, b.windowEnd.getTime() + Number(s.arrival_grace_minutes) * MIN);
    await notify(ctx, tx, {
      userId: b.customerId,
      key: 'tech_accepted',
      vars: { name: t.publicName ?? '', code: b.code, window: formatWindow(b.windowStart.getTime(), b.windowEnd.getTime(), 'ar') },
      link: trackingLink(ctx, b),
    });
    return next;
  });
  await publish(ctx, after, 'accept');
  return after;
}

export async function declineBooking(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, reason: string | null) {
  await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, bookingId, true);
    if (b.status !== 'requested') throw conflict('invalid_transition');
    if (b.technicianId === actor.id) {
      await tx.update(bookings).set({ technicianId: null, needsAdmin: 'dispatch' }).where(eq(bookings.id, b.id));
      await logEvent(tx, b.id, actor, 'decline', { note: reason });
      await cancelJobs(tx, 'accept_timeout', b.id);
      await notifyAdmins(ctx, tx, ['owner', 'support'], `اعتذر الفني عن الطلب ${b.code}`);
      return;
    }
    const offer = (await tx.select().from(bookingOffers).where(and(eq(bookingOffers.bookingId, b.id), eq(bookingOffers.technicianId, actor.id), eq(bookingOffers.status, 'offered'))))[0];
    if (!offer) throw notFound();
    await tx.update(bookingOffers).set({ status: 'declined', declineReason: reason, respondedAt: new Date(ctx.clock.now()) }).where(eq(bookingOffers.id, offer.id));
    const open = await tx.select({ id: bookingOffers.id }).from(bookingOffers).where(and(eq(bookingOffers.bookingId, b.id), eq(bookingOffers.status, 'offered')));
    if (!open.length) await dispatchBatch(ctx, tx, b, offer.batch + 1);
  });
}

export async function startTravel(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, etaMinutes: number) {
  if (![10, 20, 30, 45, 60, 90].includes(etaMinutes)) throw badRequest('invalid_eta');
  const after = await ctx.db.transaction(async (tx) => {
    const b = await asTechBooking(ctx, tx, actor, bookingId);
    const next = await transition(ctx, tx, b, 'start_travel', actor, { etaMinutes });
    const t = await techRow(tx, actor.id);
    await notify(ctx, tx, { userId: b.customerId, key: 'on_the_way', vars: { name: t?.publicName ?? '' }, link: trackingLink(ctx, b) });
    return next;
  });
  await publish(ctx, after, 'start_travel');
  return after;
}

export async function arrive(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, i: { lat: number; lng: number; photoFileId: string; override?: boolean; overrideReason?: string | null; simulated?: boolean }) {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await asTechBooking(ctx, tx, actor, bookingId);
    const s = snap(b);
    if (!i.photoFileId) throw badRequest('photo_required');
    const distance = Math.round(distanceMeters({ lat: i.lat, lng: i.lng }, { lat: b.lat, lng: b.lng }));
    const inside = distance <= Number(s.arrival_geofence_meters);
    if (!inside && !i.override) throw badRequest('outside_geofence', { distance });
    const flags: string[] = [];
    if (!inside) flags.push('arrival_override');
    if (i.simulated) flags.push('simulated_location');
    const photoMeta = await captureMeta(ctx, i.photoFileId, tx);
    if (photoMeta?.lat != null && photoMeta.lng != null && distanceMeters({ lat: photoMeta.lat, lng: photoMeta.lng }, { lat: b.lat, lng: b.lng }) > 1000) flags.push('photo_gps_mismatch');
    const next = await transition(
      ctx,
      tx,
      b,
      'arrive',
      actor,
      { arrival: { lat: i.lat, lng: i.lng, distance, photoFileId: i.photoFileId, override: !inside, simulated: Boolean(i.simulated) }, needsAdmin: flags.length ? flags.join(',') : b.needsAdmin },
      { lat: i.lat, lng: i.lng, mediaFileId: i.photoFileId, note: i.overrideReason ?? null, data: { distance, flags } },
    );
    await cancelJobs(tx, 'arrival_grace', b.id);
    const t = await techRow(tx, actor.id);
    await notify(ctx, tx, { userId: b.customerId, key: 'arrived', vars: { name: t?.publicName ?? '' }, link: trackingLink(ctx, b) });
    if (flags.length) await notifyAdmins(ctx, tx, ['owner', 'support'], `وصول بحاجة لمراجعة في ${b.code}: ${flags.join(', ')}`);
    return next;
  });
  await publish(ctx, after, 'arrive');
  return after;
}

export async function logCall(ctx: Ctx, actor: Actor & { id: string }, bookingId: string) {
  const b = await loadBooking(ctx.db, bookingId);
  if (actor.role === 'technician' && b.technicianId !== actor.id) throw notFound();
  if (actor.role === 'customer' && b.customerId !== actor.id) throw notFound();
  if (!['accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote_sent', 'repair_payment_pending', 'in_progress', 'completed_pending_confirmation'].includes(b.status)) throw conflict('invalid_transition');
  await ctx.db.insert(callLogs).values({ id: newId(), bookingId, callerRole: actor.role, callerId: actor.id, createdAt: new Date(ctx.clock.now()) });
  await logEvent(ctx.db, bookingId, actor, 'call');
  const otherId = actor.role === 'technician' ? b.customerId : b.technicianId;
  const other = otherId ? (await ctx.db.select().from(users).where(eq(users.id, otherId)))[0] : null;
  return { phone: other ? ctx.crypto.decrypt(other.phoneEnc) : null };
}

export async function customerAbsent(ctx: Ctx, actor: Actor & { id: string }, bookingId: string) {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await asTechBooking(ctx, tx, actor, bookingId);
    const s = snap(b);
    const arrivedAt = b.timeline.arrived ? Date.parse(b.timeline.arrived) : ctx.clock.now();
    if (ctx.clock.now() - arrivedAt < Number(s.customer_wait_minutes) * MIN) throw conflict('wait_longer', { minutes: Number(s.customer_wait_minutes) });
    const calls = await tx
      .select({ id: callLogs.id })
      .from(callLogs)
      .where(and(eq(callLogs.bookingId, b.id), eq(callLogs.callerRole, 'technician'), gte(callLogs.createdAt, new Date(arrivedAt))));
    if (calls.length < 2) throw conflict('call_attempts_required', { needed: 2 });
    const next = await transition(ctx, tx, b, 'customer_absent', actor, {});
    await settleVisitOnlyBooking(ctx, tx, next);
    await notify(ctx, tx, { userId: b.customerId, key: 'booking_cancelled', vars: { code: b.code, detail: 'لم نتمكن من الوصول إليك. يُحتسب رسم الزيارة فقط.' }, link: trackingLink(ctx, b) });
    return next;
  });
  await publish(ctx, after, 'customer_absent');
  return after;
}

export async function startDiagnosis(ctx: Ctx, actor: Actor & { id: string }, bookingId: string) {
  const after = await ctx.db.transaction(async (tx) => transition(ctx, tx, await asTechBooking(ctx, tx, actor, bookingId), 'start_diagnosis', actor));
  await publish(ctx, after, 'start_diagnosis');
  return after;
}

export interface QuoteInput {
  faults: string[];
  notes?: string | null;
  photos: string[];
  durationMin?: number | null;
  items: { kind: 'labor' | 'part' | 'other'; label: string; qty: number; unitPrice: number; catalogId?: string | null }[];
}

export async function sendQuote(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, i: QuoteInput) {
  let published: Booking | null = null;
  const res = await ctx.db.transaction(async (tx) => {
    const b = await asTechBooking(ctx, tx, actor, bookingId);
    if (b.isRevisit) throw conflict('revisit_has_no_quote');
    if (!['diagnosing', 'in_progress'].includes(b.status)) throw conflict('invalid_transition');
    if (b.status === 'diagnosing' && (i.faults.length === 0 || i.photos.length < 2)) throw badRequest('diagnosis_incomplete');
    if (i.items.length === 0 || i.items.length > 30) throw badRequest('invalid_items');
    for (const it of i.items) {
      if (!Number.isSafeInteger(it.qty) || it.qty < 1 || it.qty > 100) throw badRequest('invalid_qty');
      if (!Number.isSafeInteger(it.unitPrice) || it.unitPrice < 0 || it.unitPrice > 10_000_000) throw badRequest('invalid_price');
      if (!it.label.trim() || it.label.length > 120) throw badRequest('invalid_label');
    }
    const totals = quoteTotals(i.items as QuoteLine[]);
    if (totals.total < b.visitFee) throw badRequest('quote_below_visit_fee');
    const prevApproved = await approvedQuote(tx, b.id);
    if (prevApproved && totals.total <= prevApproved.total) throw badRequest('extra_quote_must_increase');
    // price-guide bands: flag (never block) lines outside the owner's band (§7.3)
    const catalog = await tx.select().from(serviceCatalog);
    let outOfBand = false;
    const items = i.items.map((it) => {
      const c = it.catalogId ? catalog.find((x) => x.id === it.catalogId) : null;
      const oob = Boolean(c && c.priceGuideMin != null && c.priceGuideMax != null && (it.unitPrice < c.priceGuideMin || it.unitPrice > c.priceGuideMax));
      if (oob) outOfBand = true;
      return { kind: it.kind, label: it.label.trim(), qty: it.qty, unitPrice: it.unitPrice, outOfBand: oob };
    });
    const t = await techRow(tx, actor.id);
    const s = snap(b);
    const needsAdmin = t?.status === 'approved_probation' && totals.total > Number(s.probation_max_quote);
    const version = ((await tx.select({ v: sql<number>`coalesce(max(${quotes.version}),0)` }).from(quotes).where(eq(quotes.bookingId, b.id)))[0]?.v ?? 0) + 1;
    await tx.update(quotes).set({ status: 'superseded' }).where(and(eq(quotes.bookingId, b.id), inArray(quotes.status, ['sent', 'pending_admin'])));
    const quoteId = newId();
    const now = ctx.clock.now();
    const validUntil = new Date(now + Number(s.quote_expiry_minutes) * MIN);
    await tx.insert(quotes).values({
      id: quoteId,
      bookingId: b.id,
      version: Number(version),
      items,
      total: totals.total,
      laborTotal: totals.labor,
      partsTotal: totals.parts,
      validUntil: needsAdmin ? null : validUntil,
      status: needsAdmin ? 'pending_admin' : 'sent',
      needsAdminApproval: needsAdmin,
      outOfBand,
      releasedAt: needsAdmin ? null : new Date(now),
    });
    if (b.status === 'diagnosing')
      await tx.update(bookings).set({ diagnosis: { faults: i.faults, notes: i.notes ?? undefined, photos: i.photos, durationMin: i.durationMin ?? undefined } }).where(eq(bookings.id, b.id));
    if (outOfBand) await logEvent(tx, b.id, actor, 'quote_out_of_band', { data: { quoteId } });
    if (needsAdmin) {
      await tx.update(bookings).set({ needsAdmin: 'quote_approval' }).where(eq(bookings.id, b.id));
      await notify(ctx, tx, { userId: actor.id, key: 'quote_pending_approval', vars: { code: b.code }, link: techJobLink(ctx, b) });
      await notifyAdmins(ctx, tx, ['owner', 'support'], `عرض سعر لفني تحت التجربة بحاجة لموافقة: ${b.code}`);
      await logEvent(tx, b.id, actor, 'quote_held_for_admin', { data: { quoteId, total: totals.total } });
      return { quoteId, status: 'pending_admin' as const };
    }
    const b2 = await loadBooking(tx, b.id, true);
    published = await releaseQuoteTx(ctx, tx, b2, actor, quoteId, validUntil);
    return { quoteId, status: 'sent' as const };
  });
  if (published) await publish(ctx, published, 'send_quote');
  return res;
}

async function releaseQuoteTx(ctx: Ctx, tx: DbOrTx, b: Booking, actor: Actor, quoteId: string, validUntil: Date) {
  const s = snap(b);
  const next = await transition(ctx, tx, b, 'send_quote', actor.role === 'admin' ? { ...actor, role: 'technician' } : actor, { needsAdmin: null }, { data: { quoteId } });
  const half = Math.floor((Number(s.quote_expiry_minutes) * MIN) / 2);
  await schedule(tx, 'quote_reminder', b.id, validUntil.getTime() - half, { quoteId });
  await schedule(tx, 'quote_expiry', b.id, validUntil.getTime(), { quoteId });
  await notify(ctx, tx, { userId: b.customerId, key: 'quote_ready', vars: { code: b.code, link: trackingLink(ctx, b) }, link: trackingLink(ctx, b) });
  return next;
}

/** Admin releases a probation technician's quote (M-12 / D56): the timer starts now. */
export async function releaseQuote(ctx: Ctx, admin: Actor, bookingId: string, approve: boolean, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  let after: Booking | null = null;
  await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, bookingId, true);
    const q = (await tx.select().from(quotes).where(and(eq(quotes.bookingId, b.id), eq(quotes.status, 'pending_admin'))))[0];
    if (!q) throw notFound();
    await audit(tx, admin, { action: approve ? 'quote.release' : 'quote.return', entity: 'booking', entityId: b.id, reason });
    if (!approve) {
      await tx.update(quotes).set({ status: 'rejected' }).where(eq(quotes.id, q.id));
      await tx.update(bookings).set({ needsAdmin: null }).where(eq(bookings.id, b.id));
      await notify(ctx, tx, { userId: b.technicianId!, key: 'admin_alert', vars: { what: `أعدنا عرض الطلب ${b.code} لتعديله: ${reason}` }, link: techJobLink(ctx, b) });
      return;
    }
    const validUntil = new Date(ctx.clock.now() + Number(snap(b).quote_expiry_minutes) * MIN);
    await tx.update(quotes).set({ status: 'sent', validUntil, releasedAt: new Date(ctx.clock.now()) }).where(eq(quotes.id, q.id));
    after = await releaseQuoteTx(ctx, tx, b, { ...admin, role: 'technician', id: b.technicianId }, q.id, validUntil);
  });
  if (after) await publish(ctx, after, 'send_quote');
}

export async function currentQuote(tx: DbOrTx, bookingId: string) {
  const r = await tx
    .select()
    .from(quotes)
    .where(and(eq(quotes.bookingId, bookingId), inArray(quotes.status, ['sent', 'approved', 'pending_admin'])))
    .orderBy(desc(quotes.version))
    .limit(1);
  return r[0] ?? null;
}

// ---------------------------------------------------------------- customer actions on quotes

async function asCustomerBooking(tx: DbOrTx, actor: Actor, bookingId: string) {
  const b = await loadBooking(tx, bookingId, true);
  if (actor.role === 'customer' && b.customerId !== actor.id) throw notFound();
  return b;
}

export async function approveQuote(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, quoteId: string, returnUrl: string, locale: 'ar' | 'en') {
  let paymentId: string | null = null;
  let after: Booking | null = null;
  await ctx.db.transaction(async (tx) => {
    const b = await asCustomerBooking(tx, actor, bookingId);
    const q = (await tx.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.bookingId, b.id))))[0];
    if (!q || q.status !== 'sent') throw conflict('quote_not_open');
    if (q.validUntil && q.validUntil.getTime() < ctx.clock.now()) throw conflict('quote_expired');
    const prev = await approvedQuote(tx, b.id);
    if (prev) await tx.update(quotes).set({ status: 'superseded' }).where(eq(quotes.id, prev.id));
    await tx.update(quotes).set({ status: 'approved' }).where(eq(quotes.id, q.id));
    await cancelJobs(tx, 'quote_expiry', b.id);
    await cancelJobs(tx, 'quote_reminder', b.id);
    const due = q.total - (await capturedTotal(tx, b.id));
    after = await transition(ctx, tx, b, 'approve_quote', actor, { quoteTotal: q.total, laborTotal: q.laborTotal, partsTotal: q.partsTotal }, { data: { quoteId } });
    if (due <= 0) {
      after = await transition(ctx, tx, after, 'resume_work', SYSTEM, {});
    } else {
      paymentId = newId();
      await tx.insert(payments).values({ id: paymentId, bookingId: b.id, kind: 'repair', provider: ctx.providers.payments.name, amount: due, status: 'pending' });
      await schedule(tx, 'repair_payment_timeout', b.id, ctx.clock.now() + Number(snap(b).repair_payment_timeout_minutes) * MIN);
    }
  });
  if (after) await publish(ctx, after, 'approve_quote');
  if (paymentId) return { checkoutUrl: (await startCheckout(ctx, paymentId, returnUrl, locale)).url };
  return { checkoutUrl: null };
}

/** Customer rejects (or the timer expires): back to the approved scope if there is one, else visit-only (example C). */
async function closeQuote(ctx: Ctx, tx: DbOrTx, b: Booking, actor: Actor, how: 'reject_quote' | 'quote_expired' | 'repair_payment_timeout') {
  await tx.update(quotes).set({ status: how === 'reject_quote' ? 'rejected' : 'expired' }).where(and(eq(quotes.bookingId, b.id), eq(quotes.status, 'sent')));
  await cancelJobs(tx, 'quote_expiry', b.id);
  await cancelJobs(tx, 'quote_reminder', b.id);
  await cancelJobs(tx, 'repair_payment_timeout', b.id);
  const prev = await approvedQuote(tx, b.id);
  const lastPaidApproved = prev && b.status === 'quote_sent' && b.timeline.in_progress;
  if (lastPaidApproved) {
    const next = await transition(ctx, tx, b, 'resume_work', actor.role === 'customer' ? actor : SYSTEM, {});
    return next;
  }
  if (how === 'repair_payment_timeout' && prev) await tx.update(quotes).set({ status: 'expired' }).where(eq(quotes.id, prev.id));
  const next = await transition(ctx, tx, b, how, actor, {});
  await settleVisitOnlyBooking(ctx, tx, next);
  if (b.technicianId) await notify(ctx, tx, { userId: b.technicianId, key: 'quote_decision', vars: { code: b.code, decision: 'رفض العرض — أنهِ الزيارة' }, link: techJobLink(ctx, b) });
  return next;
}

export async function rejectQuote(ctx: Ctx, actor: Actor & { id: string }, bookingId: string) {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await asCustomerBooking(tx, actor, bookingId);
    if (b.status !== 'quote_sent') throw conflict('invalid_transition');
    return closeQuote(ctx, tx, b, actor, 'reject_quote');
  });
  await publish(ctx, after, 'reject_quote');
  return after;
}

export async function completeJob(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, i: { before: string[]; after: string[]; notes?: string | null; parts: { label: string; receiptFileId?: string | null }[] }) {
  if (i.before.length < 1 || i.after.length < 1) throw badRequest('photos_required');
  const after = await ctx.db.transaction(async (tx) => {
    const b = await asTechBooking(ctx, tx, actor, bookingId);
    const s = snap(b);
    const next = await transition(ctx, tx, b, 'complete', actor, {
      completion: { before: i.before, after: i.after, notes: i.notes ?? undefined, parts: i.parts.map((p) => ({ label: p.label, receiptFileId: p.receiptFileId ?? undefined })) },
    });
    const hours = Number(s.auto_confirm_hours);
    const now = ctx.clock.now();
    await schedule(tx, 'confirm_reminder', b.id, now + (hours / 2) * HOUR, { n: 1 });
    await schedule(tx, 'confirm_reminder', b.id, now + Math.max(hours - 2, hours * 0.9) * HOUR, { n: 2 });
    await schedule(tx, 'auto_confirm', b.id, now + hours * HOUR);
    await notify(ctx, tx, { userId: b.customerId, key: 'work_completed', vars: { code: b.code, hours, link: trackingLink(ctx, b) }, link: trackingLink(ctx, b) });
    return next;
  });
  await publish(ctx, after, 'complete');
  return after;
}

async function confirmTx(ctx: Ctx, tx: DbOrTx, b: Booking, actor: Actor, event: 'confirm' | 'auto_confirm' | 'decide_confirm') {
  const confirmed = await transition(ctx, tx, b, event, actor, {});
  await cancelJobs(tx, 'auto_confirm', b.id);
  await cancelJobs(tx, 'confirm_reminder', b.id);
  const r = await settleConfirmed(ctx, tx, confirmed);
  const settled = await transition(ctx, tx, await loadBooking(tx, b.id, true), 'settle', SYSTEM, {});
  if (b.technicianId) {
    const t = await techRow(tx, b.technicianId);
    if (t) {
      const left = Math.max(0, t.probationJobsLeft - (b.isRevisit ? 0 : 1));
      await tx
        .update(technicians)
        .set({
          jobsCompleted: t.jobsCompleted + (b.isRevisit ? 0 : 1),
          probationJobsLeft: left,
          status: t.status === 'approved_probation' && left === 0 ? 'active' : t.status,
        })
        .where(eq(technicians.userId, t.userId));
    }
    if (!b.isRevisit)
      await notify(ctx, tx, { userId: b.technicianId, key: 'job_confirmed_tech', vars: { code: b.code, date: r.dueAt ? formatDateShort(r.dueAt.getTime(), 'ar') : '' }, link: techJobLink(ctx, b) });
  }
  return settled;
}

export async function confirmJob(ctx: Ctx, actor: Actor & { id: string }, bookingId: string) {
  const after = await ctx.db.transaction(async (tx) => confirmTx(ctx, tx, await asCustomerBooking(tx, actor, bookingId), actor, 'confirm'));
  await publish(ctx, after, 'confirm');
  return after;
}

export async function openDispute(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, i: { reasonCode: string; description?: string | null; evidence: string[] }) {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await asCustomerBooking(tx, actor, bookingId);
    const s = snap(b);
    const next = await transition(ctx, tx, b, 'open_dispute', actor, {}, { note: i.reasonCode });
    await cancelJobs(tx, 'auto_confirm', b.id);
    await cancelJobs(tx, 'confirm_reminder', b.id);
    const slaDueAt = new Date(ctx.clock.now() + Number(s.dispute_sla_hours) * HOUR);
    await tx.insert(disputes).values({ id: newId(), bookingId: b.id, openedBy: actor.id, reasonCode: i.reasonCode, description: i.description ?? null, evidence: i.evidence, slaDueAt });
    const vars = { code: b.code, hours: Number(s.dispute_sla_hours) };
    await notify(ctx, tx, { userId: b.customerId, key: 'dispute_opened', vars, link: trackingLink(ctx, b) });
    if (b.technicianId) await notify(ctx, tx, { userId: b.technicianId, key: 'dispute_opened', vars, link: techJobLink(ctx, b) });
    await notifyAdmins(ctx, tx, ['owner', 'support'], `بلاغ جديد على الطلب ${b.code}`);
    return next;
  });
  await publish(ctx, after, 'open_dispute');
  return after;
}

// ---------------------------------------------------------------- cancellation

export async function cancelPreview(ctx: Ctx, b: Booking, db: DbOrTx = ctx.db) {
  const s = snap(b);
  const tier = customerCancelTier({
    status: b.status,
    bookedAt: Date.parse(b.timeline.requested ?? b.timeline.pending_payment ?? b.createdAt.toISOString()),
    now: ctx.clock.now(),
    freeCancelMinutes: Number(s.free_cancel_minutes),
    windowEnd: b.windowEnd.getTime(),
    arrivalGraceMinutes: Number(s.arrival_grace_minutes),
  });
  const feeBps = cancelFeeBpsForTier(tier, { lateCancelFeeBps: Number(s.late_cancel_fee_pct), onTheWayCancelFeeBps: Number(s.on_the_way_cancel_fee_pct) });
  const captured = await capturedTotal(db, b.id);
  const { cancelSplit } = await import('@katf/shared');
  const r = cancelSplit({ visitFee: captured ? b.visitFee : 0, feeBps, visitShareBps: Number(s.visit_only_platform_share_pct) });
  return { tier, feeBps, fee: r.fee, refund: captured ? captured - r.fee : 0, allowed: tier !== 'not_allowed' };
}

export async function cancelByCustomer(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, reason: string | null) {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await asCustomerBooking(tx, actor, bookingId);
    const preview = await cancelPreview(ctx, b, tx);
    if (!preview.allowed) throw conflict('invalid_transition');
    const next = await transition(ctx, tx, b, 'customer_cancel', actor, { cancelReason: reason ?? preview.tier, cancelledBy: 'customer' }, { data: { tier: preview.tier } });
    await settleCancellation(ctx, tx, next, preview.feeBps, `customer_cancel:${preview.tier}`, actor.id);
    for (const k of ['payment_expiry', 'accept_timeout', 'request_final_expiry', 'arrival_grace']) await cancelJobs(tx, k, b.id);
    await tx.update(payments).set({ status: 'failed' }).where(and(eq(payments.bookingId, b.id), eq(payments.status, 'pending')));
    if (preview.tier === 'technician_late' && b.technicianId) await addStrike(ctx, tx, b.technicianId, 'late_arrival', b.id, SYSTEM);
    if (b.technicianId && ['accepted', 'on_the_way'].includes(b.status))
      await notify(ctx, tx, { userId: b.technicianId, key: 'booking_cancelled', vars: { code: b.code, detail: preview.fee ? `يُحتسب لك جزء من رسم الإلغاء.` : '' }, link: techJobLink(ctx, b) });
    if (preview.refund > 0) await notify(ctx, tx, { userId: b.customerId, key: 'refund_issued', vars: { amount: formatOMR(preview.refund), code: b.code }, link: trackingLink(ctx, b) });
    return next;
  });
  await publish(ctx, after, 'customer_cancel');
  return after;
}

export async function cancelByTechnician(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, reason: string) {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await asTechBooking(ctx, tx, actor, bookingId);
    const s = snap(b);
    const next = await transition(ctx, tx, b, 'technician_cancel', actor, { cancelReason: reason, cancelledBy: 'technician' });
    await settleCancellation(ctx, tx, next, 0, 'technician_cancel', null);
    for (const k of ['arrival_grace']) await cancelJobs(tx, k, b.id);
    const strike = b.windowStart.getTime() - ctx.clock.now() < Number(s.technician_cancel_strike_hours) * HOUR;
    if (strike) await addStrike(ctx, tx, actor.id, 'late_cancel', b.id, SYSTEM);
    await notify(ctx, tx, { userId: b.customerId, key: 'booking_cancelled', vars: { code: b.code, detail: 'اعتذر الفني. سنرد لك كامل المبلغ.' }, link: trackingLink(ctx, b) });
    await notifyAdmins(ctx, tx, ['owner', 'support'], `ألغى الفني الطلب ${b.code}`);
    return next;
  });
  await publish(ctx, after, 'technician_cancel');
  return after;
}

export async function addStrike(ctx: Ctx, tx: DbOrTx, technicianId: string, reasonCode: string, bookingId: string | null, actor: Actor, note?: string | null) {
  const s = await ctx.settings.all();
  const expiresAt = new Date(ctx.clock.now() + Number(s.strikes_window_days) * 86_400_000);
  await tx.insert(strikes).values({ id: newId(), technicianId, reasonCode, bookingId, note: note ?? null, expiresAt, createdBy: actor.id, createdAt: new Date(ctx.clock.now()) });
  const active = await tx.select({ id: strikes.id }).from(strikes).where(and(eq(strikes.technicianId, technicianId), isNull(strikes.removedAt), gt(strikes.expiresAt, new Date(ctx.clock.now()))));
  await tx.update(technicians).set({ strikesCount: active.length }).where(eq(technicians.userId, technicianId));
  await notify(ctx, tx, { userId: technicianId, key: 'strike_issued', vars: { reason: reasonCode, days: Number(s.appeal_days) } });
  if (active.length >= Number(s.strikes_for_suspension_review)) await notifyAdmins(ctx, tx, ['owner', 'support'], `فني وصل إلى ${active.length} مخالفات — للمراجعة`);
}

// ---------------------------------------------------------------- warranty revisit (D38)

export async function createRevisit(ctx: Ctx, actor: Actor & { id: string }, parentId: string, i: { windowStart: number; windowEnd: number; note?: string | null }) {
  const res = await ctx.db.transaction(async (tx) => {
    const parent = await asCustomerBooking(tx, actor, parentId);
    const s = snap(parent);
    if (!['settled', 'paid_out', 'confirmed'].includes(parent.status) || parent.isRevisit) throw conflict('not_eligible');
    const confirmedAt = Date.parse(parent.timeline.confirmed ?? '');
    if (!confirmedAt || ctx.clock.now() > confirmedAt + Number(s.warranty_days) * 86_400_000) throw conflict('warranty_expired');
    const used = await tx.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.parentBookingId, parent.id), eq(bookings.isRevisit, true)));
    if (used.length >= Number(s.max_free_revisits)) throw conflict('no_revisits_left');
    if (!parent.technicianId) throw conflict('not_eligible');
    const id = newId();
    const code = bookingCode(String(s.booking_code_prefix || 'KT'));
    const now = ctx.clock.now();
    await tx.insert(bookings).values({
      ...parent,
      id,
      code,
      parentBookingId: parent.id,
      isRevisit: true,
      entryMode: 'repeat',
      problemText: i.note ?? parent.problemText,
      windowStart: new Date(i.windowStart),
      windowEnd: new Date(i.windowEnd),
      status: 'requested',
      version: 0,
      visitFee: 0,
      quoteTotal: null,
      laborTotal: null,
      partsTotal: null,
      commissionBps: 0,
      commissionReason: 'revisit',
      commissionAmount: null,
      technicianNet: null,
      gatewayFee: null,
      platformNet: null,
      refundTotal: 0,
      etaMinutes: null,
      arrival: null,
      diagnosis: null,
      completion: null,
      timeline: { requested: new Date(now).toISOString() },
      payoutDueAt: null,
      needsAdmin: null,
      cancelReason: null,
      cancelledBy: null,
      acceptDeadline: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    });
    const child = await loadBooking(tx, id);
    await logEvent(tx, id, actor, 'revisit_requested', { data: { parent: parent.code } });
    await afterRequested(ctx, tx, child);
    return { id, code };
  });
  return res;
}

/** Revisit could not fix the fault: close the child and correct the parent (example D). */
export async function revisitFailed(ctx: Ctx, actor: Actor & { id: string }, childId: string, note: string) {
  await ctx.db.transaction(async (tx) => {
    const child = await loadBooking(tx, childId, true);
    if (actor.role === 'technician' && child.technicianId !== actor.id) throw notFound();
    if (!child.isRevisit || !child.parentBookingId) throw conflict('not_revisit');
    await transition(ctx, tx, child, 'revisit_failed', actor, {}, { note });
    const parent = await loadBooking(tx, child.parentBookingId, true);
    await transition(ctx, tx, parent, 'decide_repair_failed', actor.role === 'admin' ? actor : SYSTEM, {}, { note });
    await settleRepairFailedBooking(ctx, tx, parent, actor.id);
    await notify(ctx, tx, { userId: parent.customerId, key: 'booking_cancelled', vars: { code: parent.code, detail: 'تعذّر الإصلاح. نرد لك أجر العمل دون ثمن القطع الموثّقة.' }, link: trackingLink(ctx, parent) });
  });
}

export async function startRevisitWork(ctx: Ctx, actor: Actor & { id: string }, bookingId: string) {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await asTechBooking(ctx, tx, actor, bookingId);
    if (!b.isRevisit) throw conflict('not_revisit');
    return transition(ctx, tx, b, 'start_revisit_work', actor);
  });
  await publish(ctx, after, 'start_revisit_work');
  return after;
}

// ---------------------------------------------------------------- reviews

export async function rateBooking(ctx: Ctx, actor: Actor & { id: string }, bookingId: string, i: { rating: number; tags: string[]; comment?: string | null }) {
  if (!Number.isInteger(i.rating) || i.rating < 1 || i.rating > 5) throw badRequest('invalid_rating');
  await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, bookingId, true);
    const s = snap(b);
    const isCustomer = actor.role === 'customer' && b.customerId === actor.id;
    const isTech = actor.role === 'technician' && b.technicianId === actor.id;
    if (!isCustomer && !isTech) throw notFound();
    if (!['settled', 'paid_out', 'confirmed'].includes(b.status) || b.isRevisit) throw conflict('not_eligible');
    const confirmedAt = Date.parse(b.timeline.confirmed ?? '');
    if (ctx.clock.now() > confirmedAt + Number(s.review_window_days) * 86_400_000) throw conflict('review_window_closed');
    await tx.insert(reviews).values({
      id: newId(),
      bookingId: b.id,
      technicianId: b.technicianId!,
      customerId: b.customerId,
      direction: isCustomer ? 'customer_to_technician' : 'technician_to_customer',
      rating: i.rating,
      tags: i.tags.slice(0, 5),
      comment: i.comment?.slice(0, 500) ?? null,
      visibility: isCustomer ? 'public' : 'admin_only',
    });
    if (isCustomer && b.technicianId) {
      await tx
        .update(technicians)
        .set({ ratingSum: sql`${technicians.ratingSum} + ${i.rating}`, ratingCount: sql`${technicians.ratingCount} + 1` })
        .where(eq(technicians.userId, b.technicianId));
      await notify(ctx, tx, { userId: b.technicianId, key: 'review_received', vars: { stars: i.rating, code: b.code } });
      const t = await techRow(tx, b.technicianId);
      if (t && t.ratingCount >= Number(s.rating_review_min_jobs) && (t.ratingSum * 10) / t.ratingCount < Number(s.rating_review_threshold))
        await notifyAdmins(ctx, tx, ['owner', 'support'], `تقييم فني دون الحد بعد ${t.ratingCount} طلبات`);
    }
  });
}

// ---------------------------------------------------------------- timers

registerJob('payment_expiry', async (ctx, job) => {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, job.entityId, true);
    if (b.status !== 'pending_payment') return null;
    await tx.update(payments).set({ status: 'failed' }).where(and(eq(payments.bookingId, b.id), eq(payments.status, 'pending')));
    return transition(ctx, tx, b, 'payment_expired', SYSTEM);
  });
  if (after) await publish(ctx, after, 'payment_expired');
});

registerJob('accept_timeout', async (ctx, job) => {
  await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, job.entityId, true);
    if (b.status !== 'requested') return;
    if (b.technicianId && b.entryMode !== 'marketplace') {
      // direct link: hand to the admin dispatch queue (Phase 1)
      await notify(ctx, tx, { userId: b.technicianId, key: 'request_expired_tech' });
      await tx.update(bookings).set({ technicianId: null, needsAdmin: 'dispatch' }).where(eq(bookings.id, b.id));
      await logEvent(tx, b.id, SYSTEM, 'accept_timeout');
      await notifyAdmins(ctx, tx, ['owner', 'support'], `لم يقبل الفني الطلب ${b.code} في الوقت`);
      return;
    }
    const offers = await tx.select().from(bookingOffers).where(and(eq(bookingOffers.bookingId, b.id), eq(bookingOffers.status, 'offered')));
    for (const o of offers) {
      await tx.update(bookingOffers).set({ status: 'expired' }).where(eq(bookingOffers.id, o.id));
      await notify(ctx, tx, { userId: o.technicianId, key: 'request_expired_tech' });
    }
    await dispatchBatch(ctx, tx, b, Number(job.payload.batch ?? 1) + 1);
  });
});

registerJob('request_final_expiry', async (ctx, job) => {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, job.entityId, true);
    if (b.status !== 'requested') return null;
    const next = await transition(ctx, tx, b, 'request_expired', SYSTEM, { needsAdmin: null });
    await settleCancellation(ctx, tx, next, 0, 'no_technician', null);
    await notify(ctx, tx, { userId: b.customerId, key: 'booking_cancelled', vars: { code: b.code, detail: 'لم يتوفر فنّي في الموعد. سنرد لك كامل المبلغ.' }, link: trackingLink(ctx, b) });
    return next;
  });
  if (after) await publish(ctx, after, 'request_expired');
});

registerJob('arrival_grace', async (ctx, job) => {
  const b = await loadBooking(ctx.db, job.entityId);
  if (!['accepted', 'on_the_way'].includes(b.status)) return;
  await notify(ctx, ctx.db, { userId: b.customerId, key: 'technician_late', vars: { code: b.code, link: trackingLink(ctx, b) }, link: trackingLink(ctx, b) });
  await notifyAdmins(ctx, ctx.db, ['owner', 'support'], `الفني متأخر عن الطلب ${b.code}`);
});

registerJob('quote_reminder', async (ctx, job) => {
  const b = await loadBooking(ctx.db, job.entityId);
  if (b.status !== 'quote_sent') return;
  await notify(ctx, ctx.db, { userId: b.customerId, key: 'quote_ready', vars: { code: b.code, link: trackingLink(ctx, b) }, link: trackingLink(ctx, b) });
});

registerJob('quote_expiry', async (ctx, job) => {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, job.entityId, true);
    if (b.status !== 'quote_sent') return null;
    const q = (await tx.select().from(quotes).where(and(eq(quotes.bookingId, b.id), eq(quotes.status, 'sent'))))[0];
    if (q?.validUntil && q.validUntil.getTime() > ctx.clock.now()) return null;
    return closeQuote(ctx, tx, b, SYSTEM, 'quote_expired');
  });
  if (after) await publish(ctx, after, 'quote_expired');
});

registerJob('repair_payment_timeout', async (ctx, job) => {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, job.entityId, true);
    if (b.status !== 'repair_payment_pending') return null;
    await tx.update(payments).set({ status: 'failed' }).where(and(eq(payments.bookingId, b.id), eq(payments.status, 'pending'), eq(payments.kind, 'repair')));
    const prevPaid = b.timeline.in_progress; // extra-work quote: continue with the scope already paid
    if (prevPaid) {
      const q = (await tx.select().from(quotes).where(and(eq(quotes.bookingId, b.id), eq(quotes.status, 'approved'))).orderBy(desc(quotes.version)))[0];
      if (q) await tx.update(quotes).set({ status: 'expired' }).where(eq(quotes.id, q.id));
      const prior = (await tx.select().from(quotes).where(and(eq(quotes.bookingId, b.id), eq(quotes.status, 'superseded'))).orderBy(desc(quotes.version)))[0];
      if (prior) await tx.update(quotes).set({ status: 'approved' }).where(eq(quotes.id, prior.id));
      return transition(ctx, tx, b, 'resume_work', SYSTEM, { quoteTotal: prior?.total ?? b.quoteTotal });
    }
    const next = await transition(ctx, tx, b, 'repair_payment_timeout', SYSTEM);
    await settleVisitOnlyBooking(ctx, tx, next);
    return next;
  });
  if (after) await publish(ctx, after, 'repair_payment_timeout');
});

registerJob('confirm_reminder', async (ctx, job) => {
  const b = await loadBooking(ctx.db, job.entityId);
  if (b.status !== 'completed_pending_confirmation') return;
  await notify(ctx, ctx.db, { userId: b.customerId, key: 'confirm_reminder', vars: { code: b.code, link: trackingLink(ctx, b) }, link: trackingLink(ctx, b) });
});

registerJob('auto_confirm', async (ctx, job) => {
  const after = await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, job.entityId, true);
    if (b.status !== 'completed_pending_confirmation') return null;
    const done = await confirmTx(ctx, tx, b, SYSTEM, 'auto_confirm');
    await notify(ctx, tx, { userId: b.customerId, key: 'auto_confirmed', vars: { code: b.code }, link: trackingLink(ctx, b) });
    return done;
  });
  if (after) await publish(ctx, after, 'auto_confirm');
});

export { confirmTx };
