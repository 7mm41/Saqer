/**
 * Admin operations (§9): disputes, technician and customer actions, break-glass reveals,
 * catalog and areas, settings with the legal-gate guard, overview metrics, document expiry.
 */
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { formatOMR, settleRepairFailed, maskPhone, maskIban, type QuoteLine, share, muscatDate } from '@katf/shared';
import type { Ctx, Actor } from '../ctx';
import {
  areas,
  blockedIdentities,
  bookings,
  broadcasts,
  disputes,
  messages,
  payableItems,
  payments,
  reviews,
  serviceCatalog,
  strikes,
  supportTickets,
  technicianBank,
  technicianDocuments,
  technicians,
  users,
  quotes,
  refunds,
} from '../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { audit } from './audit';
import { anyRequiredDraft } from './legal';
import { notify } from './notifications';
import { registerJob, schedule } from './scheduler';
import { approvedQuote, capturedTotal, loadBooking, settleCancellation, settleDecision, settleRepairFailedBooking, snap, transition } from './booking-core';
import { addStrike, confirmTx, trackingLink, techJobLink } from './bookings';
import { logoutEverywhere } from './auth';

// ---------------------------------------------------------------- settings with guards

export async function changeSetting(ctx: Ctx, admin: Actor, key: string, value: unknown, reason: string) {
  return ctx.db.transaction(async (tx) => {
    const r = await ctx.settings.set(tx, key, value, { id: admin.id, adminRole: admin.adminRole }, reason, async (k, v) => {
      if (k === 'legal_gate_cleared' && v === true && (await anyRequiredDraft(tx))) throw conflict('legal_drafts');
    });
    await audit(tx, admin, { action: 'settings.change', entity: 'setting', entityId: key, reason, before: { v: r.old }, after: { v: r.value } });
    return r;
  });
}

// ---------------------------------------------------------------- disputes (§9.2 #7)

export async function disputePreview(ctx: Ctx, bookingId: string, db: import('../db').DbOrTx = ctx.db) {
  const b = await loadBooking(db, bookingId);
  const captured = await capturedTotal(db, b.id);
  const q = await approvedQuote(db, b.id);
  const s = snap(b);
  const lines = (q?.items ?? []) as QuoteLine[];
  const commission = lines.reduce((sum, l) => sum + share(l.qty * l.unitPrice, b.commissionBps), 0);
  const labor = q?.laborTotal ?? 0;
  const failed = q ? settleRepairFailed({ visitFee: b.visitFee, lines, gatewayBps: Number(s.payment_gateway_fee_pct), failedRepairCommissionBps: Number(s.failed_repair_commission_pct) }) : null;
  return {
    captured,
    options: {
      technician_full: { refund: 0, technician: captured - commission, platform: commission },
      customer_full: { refund: captured, technician: 0, platform: 0 },
      labor_only: { refund: Math.min(labor, captured), technician: captured - Math.min(labor, captured), platform: 0 },
      repair_failed: failed ? { refund: failed.refund, technician: failed.technicianNet, platform: failed.commission } : null,
    },
  };
}

export async function decideDispute(
  ctx: Ctx,
  admin: Actor,
  disputeId: string,
  i: { decision: 'technician_full' | 'customer_full' | 'labor_only' | 'split' | 'repair_failed'; amounts?: { refund: number; technician: number; platform: number }; note: string },
) {
  if (!i.note.trim()) throw badRequest('reason_required');
  await ctx.db.transaction(async (tx) => {
    const d = (await tx.select().from(disputes).where(eq(disputes.id, disputeId)).for('update'))[0];
    if (!d) throw notFound();
    const appeal = d.status === 'appealed';
    if (!['open', 'under_review', 'appealed'].includes(d.status)) throw conflict('dispute_closed');
    if (appeal && d.decidedBy === admin.id) throw forbidden('second_reviewer_required');
    const b = await loadBooking(tx, d.bookingId, true);
    const preview = await disputePreview(ctx, b.id, tx);
    let amounts: { refund: number; technician: number; platform: number } | null;
    if (b.status === 'disputed') {
      if (i.decision === 'technician_full') {
        await confirmTx(ctx, tx, b, admin, 'decide_confirm');
        amounts = preview.options.technician_full;
      } else if (i.decision === 'repair_failed') {
        const next = await transition(ctx, tx, b, 'decide_repair_failed', admin);
        // the job was never settled: settle as if confirmed, then apply the failed-repair correction
        const { settleConfirmed } = await import('./booking-core');
        await settleConfirmed(ctx, tx, next);
        await settleRepairFailedBooking(ctx, tx, await loadBooking(tx, b.id, true), admin.id);
        amounts = preview.options.repair_failed;
      } else {
        amounts =
          i.decision === 'customer_full' ? preview.options.customer_full : i.decision === 'labor_only' ? preview.options.labor_only : (i.amounts ?? null);
        if (!amounts) throw badRequest('amounts_required');
        const ev = amounts.refund === preview.captured ? 'decide_refund_full' : 'decide_refund_partial';
        const next = await transition(ctx, tx, b, ev, admin);
        await settleDecision(ctx, tx, next, amounts, admin.id!);
      }
    } else if (appeal) {
      // after an appeal the money already moved: record the second reviewer's decision; corrections go through adjustments
      amounts = i.amounts ?? null;
    } else throw conflict('invalid_transition');
    await tx
      .update(disputes)
      .set({ status: appeal ? 'closed' : 'decided', decision: i.decision, decisionAmounts: amounts ?? undefined, decisionNote: i.note, decidedBy: appeal ? d.decidedBy : admin.id, secondReviewer: appeal ? admin.id : null, decidedAt: new Date(ctx.clock.now()) })
      .where(eq(disputes.id, d.id));
    await audit(tx, admin, { action: appeal ? 'dispute.appeal_decide' : 'dispute.decide', entity: 'dispute', entityId: d.id, reason: i.note, data: { decision: i.decision, amounts } });
    await notify(ctx, tx, { userId: b.customerId, key: 'dispute_decided', vars: { code: b.code }, link: trackingLink(ctx, b) });
    if (b.technicianId) await notify(ctx, tx, { userId: b.technicianId, key: 'dispute_decided', vars: { code: b.code }, link: techJobLink(ctx, b) });
  });
}

export async function appealDispute(ctx: Ctx, actor: Actor & { id: string }, disputeId: string, text: string) {
  const s = await ctx.settings.all();
  await ctx.db.transaction(async (tx) => {
    const d = (await tx.select().from(disputes).where(eq(disputes.id, disputeId)))[0];
    if (!d) throw notFound();
    const b = await loadBooking(tx, d.bookingId);
    if (actor.id !== b.customerId && actor.id !== b.technicianId) throw notFound();
    if (d.status !== 'decided' || d.appealUsed) throw conflict('no_appeal');
    if (!d.decidedAt || ctx.clock.now() > d.decidedAt.getTime() + Number(s.appeal_days) * 86_400_000) throw conflict('appeal_window_closed');
    await tx.update(disputes).set({ status: 'appealed', appealUsed: true, appealText: text.slice(0, 2000), appealBy: actor.id }).where(eq(disputes.id, d.id));
  });
}

// ---------------------------------------------------------------- bookings (§9.2 #5, #6)

export async function adminCancel(ctx: Ctx, admin: Actor, bookingId: string, i: { reason: string; chargeFeeBps?: number }) {
  if (!i.reason.trim()) throw badRequest('reason_required');
  await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, bookingId, true);
    const next = await transition(ctx, tx, b, 'admin_cancel', admin, { cancelReason: i.reason, cancelledBy: 'admin' });
    await settleCancellation(ctx, tx, next, i.chargeFeeBps ?? 0, 'admin_cancel', admin.id);
    await tx.update(payments).set({ status: 'failed' }).where(and(eq(payments.bookingId, b.id), eq(payments.status, 'pending')));
    await audit(tx, admin, { action: 'booking.cancel', entity: 'booking', entityId: b.id, reason: i.reason });
    await notify(ctx, tx, { userId: b.customerId, key: 'booking_cancelled', vars: { code: b.code, detail: i.reason }, link: trackingLink(ctx, b) });
    if (b.technicianId) await notify(ctx, tx, { userId: b.technicianId, key: 'booking_cancelled', vars: { code: b.code, detail: '' } });
  });
}

export async function markNoShow(ctx: Ctx, admin: Actor, bookingId: string, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, bookingId, true);
    const next = await transition(ctx, tx, b, 'mark_no_show', admin, { cancelReason: 'no_show', cancelledBy: 'technician' });
    await settleCancellation(ctx, tx, next, 0, 'no_show', admin.id);
    if (b.technicianId) await addStrike(ctx, tx, b.technicianId, 'no_show', b.id, admin, reason);
    await audit(tx, admin, { action: 'booking.no_show', entity: 'booking', entityId: b.id, reason });
    await notify(ctx, tx, { userId: b.customerId, key: 'booking_cancelled', vars: { code: b.code, detail: 'لم يحضر الفني. سنرد لك كامل المبلغ.' }, link: trackingLink(ctx, b) });
  });
}

/** Manual dispatch / reassign (§9.2 #6): assign a technician to a requested booking. */
export async function assignTechnician(ctx: Ctx, admin: Actor, bookingId: string, technicianId: string, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  await ctx.db.transaction(async (tx) => {
    const b = await loadBooking(tx, bookingId, true);
    const t = (await tx.select().from(technicians).where(eq(technicians.userId, technicianId)))[0];
    if (!t || !['active', 'approved_probation'].includes(t.status)) throw conflict('technician_unavailable');
    let cur = b;
    if (b.status === 'accepted') cur = await transition(ctx, tx, b, 'reassign', admin, { technicianId: null });
    if (cur.status !== 'requested') throw conflict('invalid_transition');
    const s = snap(cur);
    const deadline = new Date(ctx.clock.now() + Number(s.technician_accept_timeout_minutes) * 60_000);
    const { chooseCommissionBps } = await import('@katf/shared');
    const commission = chooseCommissionBps({
      entryMode: cur.entryMode as 'marketplace',
      isRepeatPair: false,
      standardBps: Number(s.commission_pct),
      ownCustomerBps: Number(s.own_customer_commission_pct),
      repeatCustomerBps: Number(s.repeat_customer_commission_pct),
      overrideBps: t.commissionOverrideBps,
    });
    await tx
      .update(bookings)
      .set({ technicianId, needsAdmin: null, acceptDeadline: deadline, commissionBps: cur.entryMode === 'direct_link' && cur.technicianId === technicianId ? cur.commissionBps : commission.bps, commissionReason: commission.reason })
      .where(eq(bookings.id, cur.id));
    await schedule(tx, 'accept_timeout', cur.id, deadline, {}, `accept_timeout:${cur.id}:${deadline.getTime()}`);
    await audit(tx, admin, { action: 'booking.assign', entity: 'booking', entityId: cur.id, reason, data: { technicianId } });
    await notify(ctx, tx, { userId: technicianId, key: 'new_request', vars: { area: cur.neighbourhood, service: cur.problem, window: '', visit_fee: formatOMR(cur.visitFee), minutes: Number(s.technician_accept_timeout_minutes) }, link: techJobLink(ctx, cur), alsoSms: true });
  });
}

export async function extendTimer(ctx: Ctx, admin: Actor, bookingId: string, kind: 'auto_confirm' | 'quote_expiry' | 'accept_timeout', minutes: number, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 7 * 24 * 60) throw badRequest('invalid_minutes');
  const { cancelJobs } = await import('./scheduler');
  await ctx.db.transaction(async (tx) => {
    await cancelJobs(tx, kind, bookingId);
    const due = ctx.clock.now() + minutes * 60_000;
    await schedule(tx, kind, bookingId, due, {}, `${kind}:${bookingId}:${due}`);
    if (kind === 'quote_expiry') await tx.update(quotes).set({ validUntil: new Date(due) }).where(and(eq(quotes.bookingId, bookingId), eq(quotes.status, 'sent')));
    await audit(tx, admin, { action: 'booking.extend_timer', entity: 'booking', entityId: bookingId, reason, data: { kind, minutes } });
  });
}

// ---------------------------------------------------------------- technicians (§9.2 #3)

export async function technicianAction(
  ctx: Ctx,
  admin: Actor,
  technicianId: string,
  i: { action: 'suspend' | 'unsuspend' | 'ban' | 'pause' | 'unpause' | 'commission' | 'add_strike' | 'remove_strike' | 'reset_device' | 'message' | 'approve_edit' | 'reject_edit' | 'verify_bank' | 'note' | 'approve_document' | 'reject_document'; reason: string; value?: unknown },
) {
  if (!i.reason.trim()) throw badRequest('reason_required');
  await ctx.db.transaction(async (tx) => {
    const t = (await tx.select().from(technicians).where(eq(technicians.userId, technicianId)))[0];
    if (!t) throw notFound();
    const set = (patch: Partial<typeof technicians.$inferInsert>) => tx.update(technicians).set({ ...patch, updatedAt: new Date(ctx.clock.now()) }).where(eq(technicians.userId, technicianId));
    switch (i.action) {
      case 'suspend':
        await set({ status: 'suspended', available: false, pausedReason: i.reason });
        break;
      case 'unsuspend':
        await set({ status: t.probationJobsLeft > 0 ? 'approved_probation' : 'active', pausedReason: null });
        break;
      case 'ban': {
        await set({ status: 'banned', available: false, pausedReason: i.reason });
        const u = (await tx.select().from(users).where(eq(users.id, technicianId)))[0];
        if (u?.phoneIndex) await tx.insert(blockedIdentities).values({ id: newId(), kind: 'phone', indexValue: u.phoneIndex, reason: i.reason, createdBy: admin.id });
        if (t.civilIdIndex) await tx.insert(blockedIdentities).values({ id: newId(), kind: 'civil_id', indexValue: t.civilIdIndex, reason: i.reason, createdBy: admin.id });
        const bank = (await tx.select().from(technicianBank).where(eq(technicianBank.technicianId, technicianId)))[0];
        if (bank) await tx.insert(blockedIdentities).values({ id: newId(), kind: 'iban', indexValue: bank.ibanIndex, reason: i.reason, createdBy: admin.id });
        await logoutEverywhere(ctx, technicianId, 'banned', tx);
        break;
      }
      case 'pause':
        await set({ status: 'paused', pausedReason: i.reason });
        break;
      case 'unpause':
        await set({ status: t.probationJobsLeft > 0 ? 'approved_probation' : 'active', pausedReason: null });
        break;
      case 'commission': {
        const v = i.value == null ? null : Number(i.value);
        if (v != null && (!Number.isInteger(v) || v < 0 || v > 5000)) throw badRequest('invalid_value');
        await set({ commissionOverrideBps: v });
        break;
      }
      case 'add_strike':
        await addStrike(ctx, tx, technicianId, String(i.value ?? 'other'), null, admin, i.reason);
        break;
      case 'remove_strike':
        await tx.update(strikes).set({ removedAt: new Date(ctx.clock.now()), removedReason: i.reason, appealStatus: 'accepted' }).where(and(eq(strikes.id, String(i.value)), eq(strikes.technicianId, technicianId)));
        break;
      case 'reset_device':
        await logoutEverywhere(ctx, technicianId, 'reset_device', tx);
        break;
      case 'message':
        await notify(ctx, tx, { userId: technicianId, key: 'admin_alert', vars: { what: String(i.value ?? '') } });
        break;
      case 'approve_edit':
      case 'reject_edit': {
        const { profileEditRequests } = await import('../db/schema');
        const req = (await tx.select().from(profileEditRequests).where(and(eq(profileEditRequests.id, String(i.value)), eq(profileEditRequests.technicianId, technicianId))))[0];
        if (!req || req.status !== 'pending') throw notFound();
        await tx.update(profileEditRequests).set({ status: i.action === 'approve_edit' ? 'approved' : 'rejected', reviewedBy: admin.id }).where(eq(profileEditRequests.id, req.id));
        if (i.action === 'approve_edit') await set(req.changes as Partial<typeof technicians.$inferInsert>);
        break;
      }
      case 'verify_bank':
        await tx.update(technicianBank).set({ verifiedAt: new Date(ctx.clock.now()) }).where(eq(technicianBank.technicianId, technicianId));
        break;
      case 'approve_document':
      case 'reject_document':
        await tx
          .update(technicianDocuments)
          .set({ status: i.action === 'approve_document' ? 'approved' : 'rejected', reviewedBy: admin.id, rejectReason: i.action === 'reject_document' ? i.reason : null })
          .where(and(eq(technicianDocuments.id, String(i.value)), eq(technicianDocuments.technicianId, technicianId)));
        if (i.action === 'approve_document' && t.status === 'paused' && t.pausedReason === 'document_expired') await set({ status: t.probationJobsLeft > 0 ? 'approved_probation' : 'active', pausedReason: null });
        break;
      case 'note':
        await set({ internalNotes: `${t.internalNotes ? t.internalNotes + '\n' : ''}[${new Date(ctx.clock.now()).toISOString().slice(0, 10)}] ${i.reason}` });
        break;
    }
    await audit(tx, admin, { action: `technician.${i.action}`, entity: 'technician', entityId: technicianId, reason: i.reason, data: i.value != null ? { value: typeof i.value === 'string' ? i.value.slice(0, 80) : i.value } : undefined });
  });
}

/** Break-glass reveal of one masked field (§9.1): needs a reason, writes the audit log. */
export async function reveal(ctx: Ctx, admin: Actor, entity: 'technician' | 'customer', id: string, field: string, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  if (admin.adminRole === 'support' && ['iban', 'civil_id', 'dob'].includes(field)) throw forbidden();
  if (admin.adminRole === 'finance' && ['civil_id', 'dob', 'references', 'emergency'].includes(field)) throw forbidden();
  let value: unknown;
  const u = (await ctx.db.select().from(users).where(eq(users.id, id)))[0];
  if (!u) throw notFound();
  const t = entity === 'technician' ? (await ctx.db.select().from(technicians).where(eq(technicians.userId, id)))[0] : null;
  const bank = entity === 'technician' ? (await ctx.db.select().from(technicianBank).where(eq(technicianBank.technicianId, id)))[0] : null;
  switch (field) {
    case 'phone':
      value = ctx.crypto.decrypt(u.phoneEnc);
      break;
    case 'email':
      value = ctx.crypto.decrypt(u.emailEnc);
      break;
    case 'full_name':
      value = t ? ctx.crypto.decrypt(t.fullNameArEnc) : null;
      break;
    case 'civil_id':
      value = t ? ctx.crypto.decrypt(t.civilIdEnc) : null;
      break;
    case 'dob':
      value = t ? ctx.crypto.decrypt(t.dobEnc) : null;
      break;
    case 'cr_number':
      value = t ? ctx.crypto.decrypt(t.crNumberEnc) : null;
      break;
    case 'iban':
      value = bank ? ctx.crypto.decrypt(bank.ibanEnc) : null;
      break;
    case 'holder':
      value = bank ? ctx.crypto.decrypt(bank.holderEnc) : null;
      break;
    case 'references':
      value = t ? ctx.crypto.decryptJson(t.referencesEnc) : null;
      break;
    case 'emergency':
      value = t ? ctx.crypto.decryptJson(t.emergencyContactEnc) : null;
      break;
    default:
      throw badRequest('unknown_field');
  }
  await audit(ctx.db, admin, { action: 'break_glass.reveal', entity, entityId: id, reason, data: { field } });
  return value;
}

/** Masked identity summary shown by default. */
export async function maskedIdentity(ctx: Ctx, technicianId: string) {
  const u = (await ctx.db.select().from(users).where(eq(users.id, technicianId)))[0];
  const t = (await ctx.db.select().from(technicians).where(eq(technicians.userId, technicianId)))[0];
  const bank = (await ctx.db.select().from(technicianBank).where(eq(technicianBank.technicianId, technicianId)))[0];
  if (!u || !t) throw notFound();
  const civil = t.civilIdEnc ? ctx.crypto.decrypt(t.civilIdEnc) : null;
  const name = t.fullNameArEnc ? ctx.crypto.decrypt(t.fullNameArEnc) : null;
  return {
    phone: u.phoneEnc ? maskPhone(ctx.crypto.decrypt(u.phoneEnc)) : null,
    fullNameMasked: name ? name.split(/\s+/).map((p, i) => (i === 0 ? p : `${p[0]}…`)).join(' ') : null,
    civilId: civil ? `••••${civil.slice(-2)}` : null,
    iban: bank ? maskIban(ctx.crypto.decrypt(bank.ibanEnc)) : null,
    bankName: bank?.bankName ?? null,
    holderMatches: bank ? !bank.nameMismatch : null,
    bankVerified: Boolean(bank?.verifiedAt),
    bankLockedUntil: bank?.lockedUntil ?? null,
  };
}

// ---------------------------------------------------------------- customers (§9.2 #4, §8.5)

export async function customerAction(ctx: Ctx, admin: Actor, customerId: string, action: 'block' | 'unblock' | 'anonymise' | 'note', reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  await ctx.db.transaction(async (tx) => {
    const u = (await tx.select().from(users).where(and(eq(users.id, customerId), eq(users.role, 'customer'))))[0];
    if (!u) throw notFound();
    if (action === 'block') {
      await tx.update(users).set({ status: 'blocked' }).where(eq(users.id, customerId));
      await logoutEverywhere(ctx, customerId, 'blocked', tx);
    } else if (action === 'unblock') await tx.update(users).set({ status: 'active' }).where(eq(users.id, customerId));
    else if (action === 'anonymise') await anonymiseCustomer(ctx, tx, customerId);
    else await tx.update(users).set({ notes: `${u.notes ? u.notes + '\n' : ''}${reason}` }).where(eq(users.id, customerId));
    await audit(tx, admin, { action: `customer.${action}`, entity: 'customer', entityId: customerId, reason });
  });
}

export async function anonymiseCustomer(ctx: Ctx, tx: Parameters<Parameters<typeof ctx.db.transaction>[0]>[0] | typeof ctx.db, customerId: string) {
  const open = await tx.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.customerId, customerId), inArray(bookings.status, ['pending_payment', 'requested', 'accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote_sent', 'repair_payment_pending', 'in_progress', 'completed_pending_confirmation', 'disputed'])));
  if (open.length) throw conflict('open_jobs');
  // personal fields go; financial records (bookings, payments, ledger) stay as the law requires
  await tx.update(users).set({ status: 'deleted', phoneEnc: null, phoneIndex: null, emailEnc: null, emailIndex: null, displayName: null, deletedAt: new Date(ctx.clock.now()) }).where(eq(users.id, customerId));
  const { addresses } = await import('../db/schema');
  await tx.delete(addresses).where(eq(addresses.userId, customerId));
  await tx.update(bookings).set({ address: { wilayat: '', neighbourhood: '' }, problemText: null }).where(eq(bookings.customerId, customerId));
  await logoutEverywhere(ctx, customerId, 'deleted', tx);
}

// ---------------------------------------------------------------- catalog and areas (D33)

export async function upsertCatalog(ctx: Ctx, admin: Actor, i: { id?: string; nameAr: string; nameEn: string; descriptionAr?: string | null; descriptionEn?: string | null; durationMin?: number | null; priceGuideMin?: number | null; priceGuideMax?: number | null; active: boolean; sort?: number }, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  if (i.priceGuideMin != null && i.priceGuideMax != null && i.priceGuideMin > i.priceGuideMax) throw badRequest('invalid_band');
  const id = i.id ?? newId();
  const values = { nameAr: i.nameAr, nameEn: i.nameEn, descriptionAr: i.descriptionAr ?? null, descriptionEn: i.descriptionEn ?? null, durationMin: i.durationMin ?? null, priceGuideMin: i.priceGuideMin ?? null, priceGuideMax: i.priceGuideMax ?? null, active: i.active, sort: i.sort ?? 0, updatedAt: new Date(ctx.clock.now()) };
  if (i.id) await ctx.db.update(serviceCatalog).set(values).where(eq(serviceCatalog.id, i.id));
  else await ctx.db.insert(serviceCatalog).values({ id, ...values });
  await audit(ctx.db, admin, { action: 'catalog.upsert', entity: 'service', entityId: id, reason });
  return id;
}

export async function updateArea(ctx: Ctx, admin: Actor, wilayat: string, i: { active?: boolean; visitFeeOverride?: number | null; neighbourhoods?: { id: string; ar: string; en: string; lat: number; lng: number; radius?: number }[] }, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  const patch: Partial<typeof areas.$inferInsert> = { updatedAt: new Date(ctx.clock.now()) };
  if (i.active != null) patch.active = i.active;
  if ('visitFeeOverride' in i) patch.visitFeeOverride = i.visitFeeOverride ?? null;
  if (i.neighbourhoods) patch.neighbourhoods = i.neighbourhoods;
  await ctx.db.update(areas).set(patch).where(eq(areas.wilayat, wilayat));
  await audit(ctx.db, admin, { action: 'area.update', entity: 'area', entityId: wilayat, reason });
}

// ---------------------------------------------------------------- overview (§9.2 #1)

export async function overview(ctx: Ctx) {
  const now = ctx.clock.now();
  const today = muscatDate(now);
  const all = await ctx.db.select().from(bookings);
  const todays = all.filter((b) => muscatDate(b.createdAt.getTime()) === today);
  const byStatus: Record<string, number> = {};
  for (const b of todays) byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
  const paid = await ctx.db.select().from(payments).where(inArray(payments.status, ['paid', 'partially_refunded', 'refunded']));
  const paidToday = paid.filter((p) => p.paidAt && muscatDate(p.paidAt.getTime()) === today);
  const refundRows = await ctx.db.select().from(refunds);
  const openDisputes = await ctx.db.select().from(disputes).where(inArray(disputes.status, ['open', 'under_review', 'appealed']));
  const apps = await ctx.db.select({ id: technicians.userId, at: technicians.applicationSubmittedAt }).from(technicians).where(inArray(technicians.status, ['submitted', 'in_review']));
  const due = await ctx.db.select().from(payableItems).where(and(eq(payableItems.status, 'scheduled'), lte(payableItems.dueAt, new Date(now))));
  const in30 = new Date(now + 30 * 86_400_000).toISOString().slice(0, 10);
  const expiring = await ctx.db.select({ id: technicianDocuments.id }).from(technicianDocuments).where(and(eq(technicianDocuments.status, 'approved'), lte(technicianDocuments.expiresAt, in30)));
  const failedPayments = await ctx.db.select({ id: payments.id }).from(payments).where(eq(payments.status, 'failed'));
  const flagged = await ctx.db.select({ id: messages.id }).from(messages).where(sql`${messages.flaggedReason} is not null`);
  const needsAdmin = all.filter((b) => b.needsAdmin);

  // experiment panel (§9.2 #1)
  const completed = all.filter((b) => ['settled', 'paid_out'].includes(b.status) && !b.isRevisit);
  const paidServices = all.filter((b) => ['settled', 'paid_out', 'closed_visit_only', 'customer_absent', 'refunded_partial', 'repair_failed_closed'].includes(b.status) && !b.isRevisit);
  const margin = paidServices.length ? Math.floor(paidServices.reduce((s, b) => s + (b.platformNet ?? 0), 0) / paidServices.length) : 0;
  const disputesAll = await ctx.db.select({ id: disputes.id }).from(disputes);
  const rebook = new Map<string, Set<string>>();
  for (const b of completed) {
    if (!b.technicianId) continue;
    const set = rebook.get(b.technicianId) ?? new Set<string>();
    set.add(b.customerId);
    rebook.set(b.technicianId, set);
  }
  let techsWithRepeat = 0;
  for (const [tid] of rebook) {
    const custs = all.filter((b) => b.technicianId === tid && ['settled', 'paid_out'].includes(b.status));
    const counts = new Map<string, number>();
    for (const c of custs) counts.set(c.customerId, (counts.get(c.customerId) ?? 0) + 1);
    if ([...counts.values()].some((n) => n > 1)) techsWithRepeat++;
  }
  const paidOut = all.filter((b) => b.status === 'paid_out' && b.timeline.confirmed && b.timeline.paid_out);
  const avgPayoutH = paidOut.length ? Math.round(paidOut.reduce((s, b) => s + (Date.parse(b.timeline.paid_out!) - Date.parse(b.timeline.confirmed!)), 0) / paidOut.length / 3_600_000) : null;

  return {
    today: { byStatus, bookings: todays.length, gmv: paidToday.reduce((s, p) => s + p.amount, 0), refunds: refundRows.filter((r) => muscatDate(r.createdAt.getTime()) === today).reduce((s, r) => s + r.amount, 0) },
    commissionToDate: all.reduce((s, b) => s + (b.commissionAmount ?? 0), 0),
    openDisputes: openDisputes.map((d) => ({ id: d.id, bookingId: d.bookingId, slaDueAt: d.slaDueAt, status: d.status })),
    applicationsWaiting: apps.length,
    oldestApplication: apps.map((a) => a.at).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null,
    payoutsDue: { technicians: new Set(due.map((d) => d.technicianId)).size, amount: due.reduce((s, d) => s + d.amount, 0) },
    documentsExpiring: expiring.length,
    alerts: { failedPayments: failedPayments.length, needsAdmin: needsAdmin.length },
    experiment: {
      paidServices: paidServices.length,
      target: Number((await ctx.settings.all()).experiment_target_paid_services),
      techniciansWithRepeatCustomers: techsWithRepeat,
      techniciansWithJobs: rebook.size,
      averagePlatformMargin: margin,
      averageHoursToPayout: avgPayoutH,
      disputeRate: paidServices.length ? Math.round((disputesAll.length * 1000) / paidServices.length) / 10 : 0,
      flaggedChats: flagged.length,
    },
  };
}

// ---------------------------------------------------------------- reviews, support, broadcasts

export async function moderateReview(ctx: Ctx, admin: Actor, reviewId: string, hide: boolean, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  await ctx.db.update(reviews).set({ moderationStatus: hide ? 'hidden' : 'visible', hiddenReason: hide ? reason : null }).where(eq(reviews.id, reviewId));
  await audit(ctx.db, admin, { action: hide ? 'review.hide' : 'review.show', entity: 'review', entityId: reviewId, reason });
}

export async function broadcast(ctx: Ctx, admin: Actor, i: { segment: 'all_technicians' | 'technicians_wilayat' | 'customers_open'; wilayat?: string; bodyAr: string; bodyEn: string }, reason: string) {
  if (!reason.trim() || !i.bodyAr.trim()) throw badRequest('reason_required');
  let ids: string[] = [];
  if (i.segment === 'customers_open') {
    const rows = await ctx.db.select({ id: bookings.customerId }).from(bookings).where(inArray(bookings.status, ['requested', 'accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote_sent', 'in_progress', 'completed_pending_confirmation']));
    ids = [...new Set(rows.map((r) => r.id))];
  } else {
    const rows = await ctx.db.select().from(technicians).where(inArray(technicians.status, ['active', 'approved_probation', 'paused']));
    ids = rows.filter((t) => i.segment === 'all_technicians' || t.areas.some((a) => a.wilayat === i.wilayat)).map((t) => t.userId);
  }
  await ctx.db.transaction(async (tx) => {
    for (const id of ids) await notify(ctx, tx, { userId: id, key: 'broadcast', vars: { body: i.bodyAr } });
    await tx.insert(broadcasts).values({ id: newId(), segment: i.segment, bodyAr: i.bodyAr, bodyEn: i.bodyEn, sentCount: ids.length, createdBy: admin.id! });
    await audit(tx, admin, { action: 'broadcast.send', entity: 'broadcast', reason, data: { segment: i.segment, count: ids.length } });
  });
  return { sent: ids.length };
}

export async function replyTicket(ctx: Ctx, admin: Actor, ticketId: string, body: string, status?: string) {
  const t = (await ctx.db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)))[0];
  if (!t) throw notFound();
  const msgs = [...t.messages, { by: admin.id!, role: 'admin', body: body.slice(0, 4000), at: new Date(ctx.clock.now()).toISOString() }];
  await ctx.db.update(supportTickets).set({ messages: msgs, status: status ?? 'answered', assignee: t.assignee ?? admin.id, updatedAt: new Date(ctx.clock.now()) }).where(eq(supportTickets.id, ticketId));
  await notify(ctx, ctx.db, { userId: t.userId, key: 'admin_alert', vars: { what: 'وصلك رد من الدعم.' } });
}

// ---------------------------------------------------------------- document expiry (§6)

registerJob('daily_documents', async (ctx) => {
  const s = await ctx.settings.all();
  const now = ctx.clock.now();
  const today = new Date(now + 4 * 3600_000).toISOString().slice(0, 10);
  const docs = await ctx.db.select().from(technicianDocuments).where(and(eq(technicianDocuments.status, 'approved'), sql`${technicianDocuments.expiresAt} is not null`));
  for (const d of docs) {
    const daysLeft = Math.round((Date.parse(d.expiresAt!) - Date.parse(today)) / 86_400_000);
    for (const r of s.doc_expiry_reminder_days as number[]) {
      if (daysLeft === r && !d.remindersSent.includes(r)) {
        await notify(ctx, ctx.db, { userId: d.technicianId, key: 'doc_expiring', vars: { doc: d.type, days: r } });
        await ctx.db.update(technicianDocuments).set({ remindersSent: [...d.remindersSent, r] }).where(eq(technicianDocuments.id, d.id));
      }
    }
    if (daysLeft <= 0) {
      await ctx.db.update(technicianDocuments).set({ status: 'expired' }).where(eq(technicianDocuments.id, d.id));
      await ctx.db
        .update(technicians)
        .set({ status: 'paused', pausedReason: 'document_expired' })
        .where(and(eq(technicians.userId, d.technicianId), inArray(technicians.status, ['active', 'approved_probation'])));
    }
  }
  // schedule tomorrow's run (07:00 Muscat)
  const next = Date.parse(`${new Date(now + 4 * 3600_000 + 86_400_000).toISOString().slice(0, 10)}T03:00:00Z`);
  await schedule(ctx.db, 'daily_documents', 'all', next);
});

registerJob('dispute_sla', async (ctx, job) => {
  const d = (await ctx.db.select().from(disputes).where(eq(disputes.id, job.entityId)))[0];
  if (!d || !['open', 'under_review'].includes(d.status)) return;
  const { notifyAdmins } = await import('./notifications');
  await notifyAdmins(ctx, ctx.db, ['owner', 'support'], `تجاوز البلاغ مدة الفصل المستهدفة`);
});

export async function ensureDailyJobs(ctx: Ctx) {
  await schedule(ctx.db, 'daily_documents', 'all', ctx.clock.now() + 60_000, {}, `daily_documents:boot:${muscatDate(ctx.clock.now())}`);
}

