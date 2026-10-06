/**
 * Double-entry ledger (§5). Every transaction balances; the database checks it again at commit.
 * Entries are never edited; corrections are new transactions.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { ledgerEntries, ledgerTransactions } from '../db/schema';
import { newId } from '../lib/ids';

export const ACCOUNTS = [
  'customer_receipts',
  'held_for_technicians',
  'technician_payable',
  'platform_revenue',
  'gateway_fees',
  'refunds_out',
  'payouts_out',
] as const;
export type Account = (typeof ACCOUNTS)[number];

export interface Line {
  account: Account;
  debit?: number;
  credit?: number;
  technicianId?: string | null;
}

export async function post(
  tx: DbOrTx,
  t: { kind: string; idempotencyKey: string; bookingId?: string | null; technicianId?: string | null; memo?: string; createdBy?: string | null; lines: Line[] },
): Promise<{ id: string; created: boolean }> {
  const lines = t.lines.filter((l) => (l.debit ?? 0) !== 0 || (l.credit ?? 0) !== 0);
  let d = 0;
  let c = 0;
  for (const l of lines) {
    if (!Number.isSafeInteger(l.debit ?? 0) || !Number.isSafeInteger(l.credit ?? 0)) throw new Error('ledger amounts must be integers');
    if ((l.debit ?? 0) < 0 || (l.credit ?? 0) < 0) throw new Error('ledger amounts must be non-negative');
    d += l.debit ?? 0;
    c += l.credit ?? 0;
  }
  if (d !== c) throw new Error(`unbalanced ledger transaction ${t.kind}: ${d} != ${c}`);
  const id = newId();
  const inserted = await tx
    .insert(ledgerTransactions)
    .values({ id, kind: t.kind, idempotencyKey: t.idempotencyKey, bookingId: t.bookingId ?? null, technicianId: t.technicianId ?? null, memo: t.memo ?? null, createdBy: t.createdBy ?? null })
    .onConflictDoNothing()
    .returning({ id: ledgerTransactions.id });
  if (!inserted.length) {
    const existing = await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(eq(ledgerTransactions.idempotencyKey, t.idempotencyKey));
    return { id: existing[0]!.id, created: false };
  }
  if (lines.length)
    await tx.insert(ledgerEntries).values(
      lines.map((l) => ({
        transactionId: id,
        bookingId: t.bookingId ?? null,
        technicianId: l.technicianId ?? (l.account === 'technician_payable' ? t.technicianId ?? null : null),
        account: l.account,
        debit: l.debit ?? 0,
        credit: l.credit ?? 0,
      })),
    );
  return { id, created: true };
}

export async function bookingBalance(tx: DbOrTx, bookingId: string) {
  const r = await tx
    .select({ d: sql<string>`coalesce(sum(${ledgerEntries.debit}),0)`, c: sql<string>`coalesce(sum(${ledgerEntries.credit}),0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.bookingId, bookingId));
  return { debit: Number(r[0]?.d ?? 0), credit: Number(r[0]?.c ?? 0) };
}

/** Net balance of an account (credit - debit), optionally for one technician or booking. */
export async function accountBalance(tx: DbOrTx, account: Account, filter: { technicianId?: string; bookingId?: string } = {}) {
  const conds = [eq(ledgerEntries.account, account)];
  if (filter.technicianId) conds.push(eq(ledgerEntries.technicianId, filter.technicianId));
  if (filter.bookingId) conds.push(eq(ledgerEntries.bookingId, filter.bookingId));
  const r = await tx
    .select({ v: sql<string>`coalesce(sum(${ledgerEntries.credit}) - sum(${ledgerEntries.debit}),0)` })
    .from(ledgerEntries)
    .where(and(...conds));
  return Number(r[0]?.v ?? 0);
}
