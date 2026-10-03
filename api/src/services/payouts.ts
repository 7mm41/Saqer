/**
 * Payouts in manual_payout mode (§3, §9.2 #9): the admin builds a batch, exports a bank CSV,
 * then marks it paid with the bank reference, which posts technician_payable → payouts_out.
 */
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { formatOMR } from '@katf/shared';
import type { Ctx, Actor } from '../ctx';
import { adjustments, bookings, payableItems, payoutBatches, payouts, technicianBank, technicians } from '../db/schema';
import { badRequest, conflict, notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { audit } from './audit';
import { post } from './ledger';
import { notify } from './notifications';
import { transition, loadBooking } from './booking-core';

export async function duePayouts(ctx: Ctx) {
  const now = new Date(ctx.clock.now());
  const items = await ctx.db.select().from(payableItems).where(and(eq(payableItems.status, 'scheduled'), lte(payableItems.dueAt, now)));
  const banks = await ctx.db.select().from(technicianBank);
  const techs = await ctx.db.select().from(technicians);
  const by = new Map<string, { technicianId: string; name: string | null; amount: number; items: string[]; blocked: string | null }>();
  for (const it of items) {
    const g = by.get(it.technicianId) ?? { technicianId: it.technicianId, name: techs.find((t) => t.userId === it.technicianId)?.publicName ?? null, amount: 0, items: [], blocked: null };
    g.amount += it.amount;
    g.items.push(it.id);
    by.set(it.technicianId, g);
  }
  for (const g of by.values()) {
    const b = banks.find((x) => x.technicianId === g.technicianId);
    if (!b) g.blocked = 'no_bank';
    else if (b.lockedUntil && b.lockedUntil.getTime() > ctx.clock.now()) g.blocked = 'bank_locked';
    else if (!b.verifiedAt) g.blocked = 'bank_unverified';
    else if (g.amount <= 0) g.blocked = 'negative_balance';
  }
  return [...by.values()];
}

export async function createBatch(ctx: Ctx, admin: Actor, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  const groups = (await duePayouts(ctx)).filter((g) => !g.blocked);
  if (!groups.length) throw conflict('nothing_due');
  const batchId = newId();
  await ctx.db.transaction(async (tx) => {
    await tx.insert(payoutBatches).values({ id: batchId, createdBy: admin.id!, total: groups.reduce((s, g) => s + g.amount, 0) });
    for (const g of groups) {
      const pid = newId();
      await tx.insert(payouts).values({ id: pid, technicianId: g.technicianId, batchId, amount: g.amount, items: g.items });
      await tx.update(payableItems).set({ status: 'in_batch', payoutId: pid }).where(inArray(payableItems.id, g.items));
    }
    await audit(tx, admin, { action: 'payout.batch_create', entity: 'payout_batch', entityId: batchId, reason, data: { technicians: groups.length } });
  });
  return batchId;
}

/** Bank CSV (name, IBAN, amount, reference). Decrypts IBANs — finance/owner only, audited. */
export async function batchCsv(ctx: Ctx, admin: Actor, batchId: string) {
  const rows = await ctx.db.select().from(payouts).where(eq(payouts.batchId, batchId));
  if (!rows.length) throw notFound();
  const lines = ['name,iban,amount_omr,reference'];
  for (const p of rows) {
    const b = (await ctx.db.select().from(technicianBank).where(eq(technicianBank.technicianId, p.technicianId)))[0];
    if (!b) continue;
    const holder = ctx.crypto.decrypt(b.holderEnc).replace(/[",\n]/g, ' ');
    lines.push(`"${holder}",${ctx.crypto.decrypt(b.ibanEnc)},${formatOMR(p.amount)},KATF-${p.id.slice(0, 8).toUpperCase()}`);
  }
  await audit(ctx.db, admin, { action: 'payout.export_csv', entity: 'payout_batch', entityId: batchId, data: { rows: rows.length } });
  return lines.join('\n') + '\n';
}

export async function markBatchPaid(ctx: Ctx, admin: Actor, batchId: string, bankReference: string, reason: string) {
  if (!bankReference.trim() || !reason.trim()) throw badRequest('reason_required');
  const touched: string[] = [];
  await ctx.db.transaction(async (tx) => {
    const batch = (await tx.select().from(payoutBatches).where(eq(payoutBatches.id, batchId)).for('update'))[0];
    if (!batch) throw notFound();
    if (batch.status !== 'open') throw conflict('batch_closed');
    const now = new Date(ctx.clock.now());
    const rows = await tx.select().from(payouts).where(and(eq(payouts.batchId, batchId), eq(payouts.status, 'in_batch')));
    for (const p of rows) {
      await post(tx, {
        kind: 'payout',
        idempotencyKey: `payout:${p.id}`,
        technicianId: p.technicianId,
        createdBy: admin.id,
        lines: [
          { account: 'technician_payable', debit: p.amount, technicianId: p.technicianId },
          { account: 'payouts_out', credit: p.amount },
        ],
      });
      await tx.update(payouts).set({ status: 'paid', bankReference, paidAt: now, paidBy: admin.id }).where(eq(payouts.id, p.id));
      const items = await tx.select().from(payableItems).where(inArray(payableItems.id, p.items));
      await tx.update(payableItems).set({ status: 'paid' }).where(inArray(payableItems.id, p.items));
      for (const it of items) if (it.bookingId) touched.push(it.bookingId);
      await notify(ctx, tx, { userId: p.technicianId, key: 'payout_sent', vars: { amount: formatOMR(p.amount), ref: bankReference } });
    }
    await tx.update(payoutBatches).set({ status: 'paid', bankReference, paidAt: now, paidBy: admin.id }).where(eq(payoutBatches.id, batchId));
    await audit(tx, admin, { action: 'payout.batch_paid', entity: 'payout_batch', entityId: batchId, reason, data: { bankReference } });
    for (const id of [...new Set(touched)]) {
      const b = await loadBooking(tx, id, true);
      if (b.status === 'settled') await transition(ctx, tx, b, 'payout_paid', admin);
    }
  });
}

export async function markPayoutFailed(ctx: Ctx, admin: Actor, payoutId: string, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  await ctx.db.transaction(async (tx) => {
    const p = (await tx.select().from(payouts).where(eq(payouts.id, payoutId)))[0];
    if (!p || p.status !== 'in_batch') throw conflict('invalid_transition');
    await tx.update(payouts).set({ status: 'failed' }).where(eq(payouts.id, payoutId));
    await tx.update(payableItems).set({ status: 'scheduled', payoutId: null }).where(inArray(payableItems.id, p.items));
    await audit(tx, admin, { action: 'payout.failed', entity: 'payout', entityId: payoutId, reason });
  });
}

export async function setHold(ctx: Ctx, admin: Actor, technicianId: string, hold: boolean, reason: string) {
  if (!reason.trim()) throw badRequest('reason_required');
  await ctx.db
    .update(payableItems)
    .set({ status: hold ? 'held' : 'scheduled', holdReason: hold ? reason : null })
    .where(and(eq(payableItems.technicianId, technicianId), inArray(payableItems.status, hold ? ['scheduled'] : ['held'])));
  await audit(ctx.db, admin, { action: hold ? 'payout.hold' : 'payout.release', entity: 'technician', entityId: technicianId, reason });
}

/** +/- adjustment with a reason; posted to the ledger and to the next payout. */
export async function addAdjustment(ctx: Ctx, admin: Actor, technicianId: string, amount: number, reason: string) {
  if (!Number.isSafeInteger(amount) || amount === 0) throw badRequest('invalid_amount');
  if (!reason.trim()) throw badRequest('reason_required');
  const id = newId();
  await ctx.db.transaction(async (tx) => {
    await tx.insert(adjustments).values({ id, technicianId, amount, reason, createdBy: admin.id! });
    await post(tx, {
      kind: 'adjustment',
      idempotencyKey: `adjustment:${id}`,
      technicianId,
      createdBy: admin.id,
      memo: reason,
      lines:
        amount > 0
          ? [
              { account: 'platform_revenue', debit: amount },
              { account: 'technician_payable', credit: amount, technicianId },
            ]
          : [
              { account: 'technician_payable', debit: -amount, technicianId },
              { account: 'platform_revenue', credit: -amount },
            ],
    });
    await tx.insert(payableItems).values({ id: newId(), technicianId, adjustmentId: id, amount, dueAt: new Date(ctx.clock.now()), status: 'scheduled', holdReason: 'adjustment' });
    await audit(tx, admin, { action: 'payout.adjustment', entity: 'technician', entityId: technicianId, reason, data: { amount } });
  });
  return id;
}

export async function batches(ctx: Ctx) {
  const rows = await ctx.db.select().from(payoutBatches).orderBy(sql`${payoutBatches.createdAt} desc`).limit(100);
  const out = [];
  for (const b of rows) {
    const ps = await ctx.db.select().from(payouts).where(eq(payouts.batchId, b.id));
    const techs = ps.length ? await ctx.db.select({ id: technicians.userId, name: technicians.publicName }).from(technicians).where(inArray(technicians.userId, ps.map((p) => p.technicianId))) : [];
    out.push({ ...b, payouts: ps.map((p) => ({ ...p, name: techs.find((t) => t.id === p.technicianId)?.name ?? null })) });
  }
  return out;
}

export async function monthlyStatement(ctx: Ctx, technicianId: string, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('invalid_month');
  const start = new Date(`${month}-01T00:00:00+04:00`);
  const [y, m] = month.split('-').map(Number) as [number, number];
  const end = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01T00:00:00+04:00`);
  const rows = await ctx.db
    .select()
    .from(bookings)
    .where(and(eq(bookings.technicianId, technicianId), inArray(bookings.status, ['settled', 'paid_out', 'closed_visit_only', 'customer_absent', 'refunded_partial', 'repair_failed_closed', 'cancelled_by_customer'])));
  const jobs = rows.filter((b) => b.updatedAt >= start && b.updatedAt < end && (b.technicianNet ?? 0) !== 0);
  const adj = (await ctx.db.select().from(adjustments).where(eq(adjustments.technicianId, technicianId))).filter((a) => a.createdAt >= start && a.createdAt < end);
  const pays = (await ctx.db.select().from(payouts).where(and(eq(payouts.technicianId, technicianId), eq(payouts.status, 'paid')))).filter((p) => p.paidAt && p.paidAt >= start && p.paidAt < end);
  return {
    month,
    jobs: jobs.map((b) => ({ code: b.code, date: b.windowStart, status: b.status, customerPaid: (b.quoteTotal ?? b.visitFee) - b.refundTotal, commission: b.commissionAmount ?? 0, net: b.technicianNet ?? 0 })),
    adjustments: adj.map((a) => ({ amount: a.amount, reason: a.reason, date: a.createdAt })),
    payouts: pays.map((p) => ({ amount: p.amount, reference: p.bankReference, date: p.paidAt })),
    totals: {
      net: jobs.reduce((s, b) => s + (b.technicianNet ?? 0), 0) + adj.reduce((s, a) => s + a.amount, 0),
      commission: jobs.reduce((s, b) => s + (b.commissionAmount ?? 0), 0),
      paid: pays.reduce((s, p) => s + p.amount, 0),
    },
  };
}
