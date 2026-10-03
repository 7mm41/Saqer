/**
 * Booking core: state transitions, settlements, refunds and payable items.
 * Every status change goes through `transition`, which enforces the table in @katf/shared.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  findTransition,
  settleCompleted,
  settleRepairFailed,
  settleVisitOnly,
  cancelSplit,
  share,
  type Actor as MachineActor,
  type BookingEvent,
  type BookingStatus,
  type QuoteLine,
} from '@katf/shared';
import type { Ctx, Actor } from '../ctx';
import type { DbOrTx } from '../db';
import { bookingEvents, bookings, payableItems, payments, quotes, refunds, technicians } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { post } from './ledger';

export type Booking = typeof bookings.$inferSelect;

export async function loadBooking(tx: DbOrTx, id: string, lock = false): Promise<Booking> {
  const q = tx.select().from(bookings).where(eq(bookings.id, id));
  const r = lock ? await q.for('update') : await q;
  if (!r[0]) throw notFound();
  return r[0];
}

export async function loadByCode(tx: DbOrTx, code: string): Promise<Booking> {
  const r = await tx.select().from(bookings).where(eq(bookings.code, code.toUpperCase()));
  if (!r[0]) throw notFound();
  return r[0];
}

export const snap = (b: Booking) => b.settingsSnapshot as Record<string, number & string & boolean>;

/**
 * Move a booking through the state machine. Uses a compare-and-set on (id, status, version)
 * so two concurrent actions cannot both win (e.g. two technicians accepting at once).
 */
export async function transition(
  ctx: Ctx,
  tx: DbOrTx,
  b: Booking,
  event: BookingEvent,
  actor: Actor,
  patch: Partial<typeof bookings.$inferInsert> = {},
  ev: { note?: string | null; lat?: number | null; lng?: number | null; mediaFileId?: string | null; data?: Record<string, unknown> } = {},
): Promise<Booking> {
  const t = findTransition(b.status as BookingStatus, event, actor.role as MachineActor);
  if (!t) throw conflict('invalid_transition', { from: b.status, event });
  const now = new Date(ctx.clock.now());
  const timeline = { ...b.timeline, [t.to]: now.toISOString() };
  const updated = await tx
    .update(bookings)
    .set({ ...patch, status: t.to, version: b.version + 1, timeline, updatedAt: now })
    .where(and(eq(bookings.id, b.id), eq(bookings.status, b.status), eq(bookings.version, b.version)))
    .returning();
  if (!updated[0]) throw conflict('conflict');
  await tx.insert(bookingEvents).values({
    bookingId: b.id,
    type: event,
    actorId: actor.id,
    actorRole: actor.adminRole ? `admin:${actor.adminRole}` : actor.role,
    fromStatus: b.status,
    toStatus: t.to,
    lat: ev.lat ?? null,
    lng: ev.lng ?? null,
    mediaFileId: ev.mediaFileId ?? null,
    note: ev.note ?? null,
    data: ev.data ?? null,
  });
  return updated[0];
}

/** Record a non-status event (call made, note added, timer extended …). */
export async function logEvent(tx: DbOrTx, bookingId: string, actor: Actor, type: string, ev: { note?: string | null; data?: Record<string, unknown>; mediaFileId?: string | null; lat?: number | null; lng?: number | null } = {}) {
  await tx.insert(bookingEvents).values({
    bookingId,
    type,
    actorId: actor.id,
    actorRole: actor.adminRole ? `admin:${actor.adminRole}` : actor.role,
    note: ev.note ?? null,
    data: ev.data ?? null,
    mediaFileId: ev.mediaFileId ?? null,
    lat: ev.lat ?? null,
    lng: ev.lng ?? null,
  });
}

export async function paidPayments(tx: DbOrTx, bookingId: string) {
  return tx
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), inArray(payments.status, ['paid', 'partially_refunded'])));
}

export async function capturedTotal(tx: DbOrTx, bookingId: string) {
  return (await paidPayments(tx, bookingId)).reduce((s, p) => s + p.amount, 0);
}

export async function approvedQuote(tx: DbOrTx, bookingId: string) {
  const r = await tx
    .select()
    .from(quotes)
    .where(and(eq(quotes.bookingId, bookingId), eq(quotes.status, 'approved')))
    .orderBy(sql`${quotes.version} desc`)
    .limit(1);
  return r[0] ?? null;
}

/** Ledger postings when a payment is captured, plus the gateway-fee estimate (M-07). */
export async function postCapture(ctx: Ctx, tx: DbOrTx, b: Booking, paymentId: string, amount: number) {
  const fee = share(amount, Number(snap(b).payment_gateway_fee_pct));
  await post(tx, {
    kind: 'capture',
    idempotencyKey: `capture:${paymentId}`,
    bookingId: b.id,
    lines: [
      { account: 'customer_receipts', debit: amount },
      { account: 'held_for_technicians', credit: amount },
      { account: 'gateway_fees', debit: fee },
      { account: 'customer_receipts', credit: fee },
    ],
  });
}

async function technicianIsNew(tx: DbOrTx, technicianId: string, b: Booking) {
  const t = (await tx.select({ jobs: technicians.jobsCompleted }).from(technicians).where(eq(technicians.userId, technicianId)))[0];
  return (t?.jobs ?? 0) < Number(snap(b).new_technician_payout_jobs);
}

async function addPayable(ctx: Ctx, tx: DbOrTx, b: Booking, amount: number, kind: string) {
  if (!b.technicianId || amount === 0) return null;
  const s = snap(b);
  const delayH = (await technicianIsNew(tx, b.technicianId, b)) ? Number(s.new_technician_payout_delay_hours) : Number(s.payout_delay_hours);
  const dueAt = new Date(ctx.clock.now() + delayH * 3600_000);
  await tx.insert(payableItems).values({ id: newId(), technicianId: b.technicianId, bookingId: b.id, amount, dueAt, status: 'scheduled', holdReason: kind });
  return dueAt;
}

/** Completed + confirmed job (examples A/B). */
export async function settleConfirmed(ctx: Ctx, tx: DbOrTx, b: Booking) {
  if (b.isRevisit) {
    await post(tx, { kind: 'settle_revisit', idempotencyKey: `settle:${b.id}`, bookingId: b.id, lines: [] });
    return { technicianNet: 0, commission: 0, dueAt: null as Date | null };
  }
  const q = await approvedQuote(tx, b.id);
  if (!q) throw conflict('no_approved_quote');
  const s = snap(b);
  const r = settleCompleted({ visitFee: b.visitFee, lines: q.items as QuoteLine[], commissionBps: b.commissionBps, gatewayBps: Number(s.payment_gateway_fee_pct) });
  await post(tx, {
    kind: 'settle',
    idempotencyKey: `settle:${b.id}`,
    bookingId: b.id,
    technicianId: b.technicianId,
    lines: [
      { account: 'held_for_technicians', debit: r.total },
      { account: 'technician_payable', credit: r.technicianNet, technicianId: b.technicianId },
      { account: 'platform_revenue', credit: r.commission },
    ],
  });
  const dueAt = await addPayable(ctx, tx, b, r.technicianNet, 'job');
  await tx
    .update(bookings)
    .set({ commissionAmount: r.commission, technicianNet: r.technicianNet, gatewayFee: r.gatewayFee, platformNet: r.platformNet, payoutDueAt: dueAt })
    .where(eq(bookings.id, b.id));
  return { technicianNet: r.technicianNet, commission: r.commission, dueAt };
}

/** Quote rejected / expired / customer absent (example C, D50). */
export async function settleVisitOnlyBooking(ctx: Ctx, tx: DbOrTx, b: Booking) {
  const s = snap(b);
  const r = settleVisitOnly({ visitFee: b.visitFee, visitShareBps: Number(s.visit_only_platform_share_pct), gatewayBps: Number(s.payment_gateway_fee_pct) });
  await post(tx, {
    kind: 'settle_visit_only',
    idempotencyKey: `settle:${b.id}`,
    bookingId: b.id,
    technicianId: b.technicianId,
    lines: [
      { account: 'held_for_technicians', debit: b.visitFee },
      { account: 'technician_payable', credit: r.technicianNet, technicianId: b.technicianId },
      { account: 'platform_revenue', credit: r.platformShare },
    ],
  });
  const dueAt = await addPayable(ctx, tx, b, r.technicianNet, 'visit_only');
  await tx
    .update(bookings)
    .set({ commissionAmount: r.platformShare, technicianNet: r.technicianNet, gatewayFee: r.gatewayFee, platformNet: r.platformNet, payoutDueAt: dueAt, quoteTotal: b.quoteTotal })
    .where(eq(bookings.id, b.id));
  // Any money captured beyond the visit fee (e.g. an approved quote that was then abandoned) goes back.
  const captured = await capturedTotal(tx, b.id);
  if (captured > b.visitFee) await refund(ctx, tx, b, captured - b.visitFee, 'visit_only_excess', null, true);
  return r;
}

/** Cancellation with a fee split (example F) or a full refund (example E). */
export async function settleCancellation(ctx: Ctx, tx: DbOrTx, b: Booking, feeBps: number, reason: string, decidedBy: string | null) {
  const captured = await capturedTotal(tx, b.id);
  if (captured === 0) return { fee: 0, refund: 0, technicianShare: 0, platformShare: 0 };
  const s = snap(b);
  const r = cancelSplit({ visitFee: b.visitFee, feeBps, visitShareBps: Number(s.visit_only_platform_share_pct) });
  const extra = captured - b.visitFee; // only non-zero if cancelled after a repair payment (admin)
  const refundAmount = r.refund + Math.max(0, extra);
  await post(tx, {
    kind: 'settle_cancel',
    idempotencyKey: `settle:${b.id}`,
    bookingId: b.id,
    technicianId: b.technicianId,
    lines: [
      { account: 'held_for_technicians', debit: captured },
      { account: 'technician_payable', credit: r.technicianShare, technicianId: b.technicianId },
      { account: 'platform_revenue', credit: r.platformShare },
      { account: 'refunds_out', credit: refundAmount },
    ],
  });
  if (r.technicianShare > 0) await addPayable(ctx, tx, b, r.technicianShare, 'cancel_fee');
  if (refundAmount > 0) await refund(ctx, tx, b, refundAmount, reason, decidedBy, false);
  await tx.update(bookings).set({ technicianNet: r.technicianShare, commissionAmount: r.platformShare }).where(eq(bookings.id, b.id));
  return { fee: r.fee, refund: refundAmount, technicianShare: r.technicianShare, platformShare: r.platformShare };
}

/** Repair failed after the free revisit (example D, D54): correct the parent's settlement. */
export async function settleRepairFailedBooking(ctx: Ctx, tx: DbOrTx, parent: Booking, decidedBy: string | null) {
  const q = await approvedQuote(tx, parent.id);
  if (!q) throw conflict('no_approved_quote');
  const s = snap(parent);
  const r = settleRepairFailed({ visitFee: parent.visitFee, lines: q.items as QuoteLine[], gatewayBps: Number(s.payment_gateway_fee_pct), failedRepairCommissionBps: Number(s.failed_repair_commission_pct) });
  const wasTech = parent.technicianNet ?? 0;
  const wasPlatform = parent.commissionAmount ?? 0;
  const techDelta = wasTech - r.technicianNet; // amount to take back from the technician
  const platformDelta = wasPlatform - r.commission;
  await post(tx, {
    kind: 'repair_failed',
    idempotencyKey: `repair_failed:${parent.id}`,
    bookingId: parent.id,
    technicianId: parent.technicianId,
    lines: [
      { account: 'technician_payable', debit: Math.max(0, techDelta), technicianId: parent.technicianId },
      { account: 'technician_payable', credit: Math.max(0, -techDelta), technicianId: parent.technicianId },
      { account: 'platform_revenue', debit: Math.max(0, platformDelta) },
      { account: 'platform_revenue', credit: Math.max(0, -platformDelta) },
      { account: 'refunds_out', credit: r.refund },
    ],
  });
  if (techDelta !== 0 && parent.technicianId)
    await tx.insert(payableItems).values({ id: newId(), technicianId: parent.technicianId, bookingId: parent.id, amount: -techDelta, dueAt: new Date(ctx.clock.now()), status: 'scheduled', holdReason: 'repair_failed' });
  if (r.refund > 0) await refund(ctx, tx, parent, r.refund, 'repair_failed', decidedBy, false);
  await tx.update(bookings).set({ technicianNet: r.technicianNet, commissionAmount: r.commission, platformNet: r.platformNet }).where(eq(bookings.id, parent.id));
  return r;
}

/** Dispute decision with explicit amounts that must add up to everything captured. */
export async function settleDecision(ctx: Ctx, tx: DbOrTx, b: Booking, amounts: { refund: number; technician: number; platform: number }, decidedBy: string) {
  const captured = await capturedTotal(tx, b.id);
  if (amounts.refund + amounts.technician + amounts.platform !== captured || [amounts.refund, amounts.technician, amounts.platform].some((v) => !Number.isSafeInteger(v) || v < 0))
    throw conflict('amounts_must_match', { captured });
  await post(tx, {
    kind: 'settle_dispute',
    idempotencyKey: `settle:${b.id}`,
    bookingId: b.id,
    technicianId: b.technicianId,
    lines: [
      { account: 'held_for_technicians', debit: captured },
      { account: 'technician_payable', credit: amounts.technician, technicianId: b.technicianId },
      { account: 'platform_revenue', credit: amounts.platform },
      { account: 'refunds_out', credit: amounts.refund },
    ],
  });
  if (amounts.technician > 0) await addPayable(ctx, tx, b, amounts.technician, 'dispute');
  if (amounts.refund > 0) await refund(ctx, tx, b, amounts.refund, 'dispute', decidedBy, false);
  await tx.update(bookings).set({ technicianNet: amounts.technician, commissionAmount: amounts.platform }).where(eq(bookings.id, b.id));
}

/**
 * Send money back to the customer through the provider, newest payment first.
 * `postLedger` is true only when the caller has not already booked the refund in the ledger.
 */
export async function refund(ctx: Ctx, tx: DbOrTx, b: Booking, amount: number, reason: string, decidedBy: string | null, postLedger: boolean) {
  if (amount <= 0) return;
  if (postLedger)
    await post(tx, { kind: 'refund', idempotencyKey: `refund:${b.id}:${reason}:${amount}`, bookingId: b.id, lines: [{ account: 'held_for_technicians', debit: amount }, { account: 'refunds_out', credit: amount }] });
  let left = amount;
  const paid = (await paidPayments(tx, b.id)).sort((a, z) => (z.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
  for (const p of paid) {
    if (left <= 0) break;
    const available = p.amount - p.refundedAmount;
    const take = Math.min(available, left);
    if (take <= 0) continue;
    left -= take;
    const id = newId();
    let providerRef: string | null = null;
    let status = 'pending';
    try {
      if (p.providerPaymentId) {
        providerRef = (await ctx.providers.payments.refund({ providerPaymentId: p.providerPaymentId, amount: take, reason, paymentId: p.id })).providerRef;
        status = 'done';
      }
    } catch (e) {
      ctx.log.error({ err: String((e as Error).message), booking: b.code }, 'refund failed; admin must retry');
      status = 'failed';
    }
    await tx.insert(refunds).values({ id, bookingId: b.id, paymentId: p.id, amount: take, reasonCode: reason, decidedBy, providerRef, status });
    const refunded = p.refundedAmount + take;
    await tx
      .update(payments)
      .set({ refundedAmount: refunded, status: refunded >= p.amount ? 'refunded' : 'partially_refunded', updatedAt: new Date(ctx.clock.now()) })
      .where(eq(payments.id, p.id));
  }
  await tx.update(bookings).set({ refundTotal: sql`${bookings.refundTotal} + ${amount}` }).where(eq(bookings.id, b.id));
}
