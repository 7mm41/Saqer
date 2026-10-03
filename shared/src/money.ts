/**
 * Money for Katf. Every amount is an integer number of baisa (1 OMR = 1000 baisa).
 * Every percentage is an integer number of basis points (15% = 1500 bps).
 * No floating-point arithmetic is used anywhere in this file.
 *
 * Rounding rule (D6): the platform's share of each line is rounded half up;
 * the technician's share is the line minus the platform's share, so every
 * split sums exactly and any remainder goes to the platform.
 */

export type Baisa = number;
export type Bps = number;

export const BAISA_PER_OMR = 1000;
export const BPS_100 = 10_000;

function assertInt(n: number, what: string): void {
  if (!Number.isSafeInteger(n)) throw new Error(`${what} must be a safe integer, got ${n}`);
}

/** Share of `amount` at `bps`, rounded half up. Both inputs must be non-negative integers. */
export function share(amount: Baisa, bps: Bps): Baisa {
  assertInt(amount, 'amount');
  assertInt(bps, 'bps');
  if (amount < 0 || bps < 0) throw new Error('share() takes non-negative values');
  return Math.floor((amount * bps + BPS_100 / 2) / BPS_100);
}

/** Split a line between platform (rounded half up) and technician (the rest). */
export function split(amount: Baisa, platformBps: Bps): { platform: Baisa; technician: Baisa } {
  const platform = share(amount, platformBps);
  return { platform, technician: amount - platform };
}

/** "5.000" — always three decimals, Latin digits. */
export function formatOMR(amount: Baisa): string {
  assertInt(amount, 'amount');
  const neg = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / BAISA_PER_OMR);
  const frac = String(abs % BAISA_PER_OMR).padStart(3, '0');
  return `${neg ? '-' : ''}${whole}.${frac}`;
}

/** Parse "5", "5.5", "5.000" into baisa without using floats. Returns null when invalid. */
export function parseOMR(input: string): Baisa | null {
  const s = input.trim().replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const m = /^(\d{1,7})(?:[.,](\d{1,3}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? '').padEnd(3, '0') || '0');
  return whole * BAISA_PER_OMR + frac;
}

/** "15" or "12.5" percent → bps. */
export function parsePercent(input: string): Bps | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return bps > BPS_100 ? null : bps;
}

/** 1500 → "15", 1250 → "12.5" */
export function formatPercent(bps: Bps): string {
  const whole = Math.floor(bps / 100);
  const frac = bps % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

// ---------------------------------------------------------------- quotes

export type QuoteLineKind = 'labor' | 'part' | 'other';
export interface QuoteLine {
  kind: QuoteLineKind;
  label: string;
  qty: number;
  unitPrice: Baisa;
  /** receipt photo accepted by admin (for failed-repair reimbursement, D54) */
  evidenced?: boolean;
}

export function lineAmount(line: QuoteLine): Baisa {
  assertInt(line.qty, 'qty');
  assertInt(line.unitPrice, 'unitPrice');
  return line.qty * line.unitPrice;
}

export function quoteTotal(lines: QuoteLine[]): Baisa {
  return lines.reduce((s, l) => s + lineAmount(l), 0);
}

export function quoteTotals(lines: QuoteLine[]): { total: Baisa; labor: Baisa; parts: Baisa; other: Baisa } {
  let labor = 0;
  let parts = 0;
  let other = 0;
  for (const l of lines) {
    const a = lineAmount(l);
    if (l.kind === 'labor') labor += a;
    else if (l.kind === 'part') parts += a;
    else other += a;
  }
  return { total: labor + parts + other, labor, parts, other };
}

/** Commission is calculated per line and summed (D6). */
export function commissionOnLines(lines: QuoteLine[], bps: Bps): Baisa {
  return lines.reduce((s, l) => s + share(lineAmount(l), bps), 0);
}

// ---------------------------------------------------------------- commission choice (D57)

export type EntryMode = 'direct_link' | 'marketplace' | 'repeat';

export interface CommissionInput {
  entryMode: EntryMode;
  /** customer already has a confirmed job with this technician */
  isRepeatPair: boolean;
  standardBps: Bps;
  ownCustomerBps: Bps;
  repeatCustomerBps: Bps;
  overrideBps?: Bps | null;
}

/** The lowest applicable rate wins. An override replaces the standard rate only. */
export function chooseCommissionBps(i: CommissionInput): { bps: Bps; reason: 'standard' | 'override' | 'own_link' | 'repeat' } {
  const options: { bps: Bps; reason: 'standard' | 'override' | 'own_link' | 'repeat' }[] = [];
  if (i.overrideBps != null) options.push({ bps: i.overrideBps, reason: 'override' });
  else options.push({ bps: i.standardBps, reason: 'standard' });
  if (i.entryMode === 'direct_link') options.push({ bps: i.ownCustomerBps, reason: 'own_link' });
  if (i.entryMode === 'repeat' || i.isRepeatPair) options.push({ bps: i.repeatCustomerBps, reason: 'repeat' });
  return options.reduce((a, b) => (b.bps < a.bps ? b : a));
}

// ---------------------------------------------------------------- settlements

export interface CompletedJobResult {
  total: Baisa;
  commission: Baisa;
  technicianNet: Baisa;
  gatewayFee: Baisa;
  platformNet: Baisa;
  secondPayment: Baisa;
}

/**
 * A completed and confirmed job (examples A and B).
 * The quote total INCLUDES the visit fee already paid.
 */
export function settleCompleted(p: {
  visitFee: Baisa;
  lines: QuoteLine[];
  commissionBps: Bps;
  gatewayBps: Bps;
}): CompletedJobResult {
  const total = quoteTotal(p.lines);
  if (total < p.visitFee) throw new Error('quote total below visit fee (D53)');
  const commission = commissionOnLines(p.lines, p.commissionBps);
  const secondPayment = total - p.visitFee;
  const gatewayFee = share(p.visitFee, p.gatewayBps) + share(secondPayment, p.gatewayBps);
  return {
    total,
    commission,
    technicianNet: total - commission,
    gatewayFee,
    platformNet: commission - gatewayFee,
    secondPayment,
  };
}

export interface VisitOnlyResult {
  customerPays: Baisa;
  platformShare: Baisa;
  technicianNet: Baisa;
  gatewayFee: Baisa;
  platformNet: Baisa;
}

/** Quote rejected, quote expired, or customer absent (example C, D50). */
export function settleVisitOnly(p: { visitFee: Baisa; visitShareBps: Bps; gatewayBps: Bps }): VisitOnlyResult {
  const { platform, technician } = split(p.visitFee, p.visitShareBps);
  const gatewayFee = share(p.visitFee, p.gatewayBps);
  return {
    customerPays: p.visitFee,
    platformShare: platform,
    technicianNet: technician,
    gatewayFee,
    platformNet: platform - gatewayFee,
  };
}

export interface RepairFailedResult {
  refund: Baisa;
  partsReimbursed: Baisa;
  technicianNet: Baisa;
  commission: Baisa;
  platformNet: Baisa;
  gatewayFee: Baisa;
}

/**
 * Repair failed after the free revisit (example D, D54).
 * Parts are reimbursed only for evidenced part lines, capped at the repair payment.
 * The technician keeps the whole visit fee; commission 0.
 */
export function settleRepairFailed(p: {
  visitFee: Baisa;
  lines: QuoteLine[];
  gatewayBps: Bps;
  failedRepairCommissionBps?: Bps;
}): RepairFailedResult {
  const total = quoteTotal(p.lines);
  const repairPaid = total - p.visitFee;
  const evidencedParts = p.lines
    .filter((l) => l.kind === 'part' && l.evidenced)
    .reduce((s, l) => s + lineAmount(l), 0);
  const partsReimbursed = Math.min(evidencedParts, repairPaid);
  const refund = repairPaid - partsReimbursed;
  const commission = share(p.visitFee + partsReimbursed, p.failedRepairCommissionBps ?? 0);
  const technicianNet = p.visitFee + partsReimbursed - commission;
  const gatewayFee = share(p.visitFee, p.gatewayBps) + share(repairPaid, p.gatewayBps);
  return { refund, partsReimbursed, technicianNet, commission, gatewayFee, platformNet: commission - gatewayFee };
}

export interface CancelResult {
  fee: Baisa;
  platformShare: Baisa;
  technicianShare: Baisa;
  refund: Baisa;
}

/** Cancellation fee as a percentage of the visit fee, split per example F. */
export function cancelSplit(p: { visitFee: Baisa; feeBps: Bps; visitShareBps: Bps }): CancelResult {
  const fee = share(p.visitFee, p.feeBps);
  const { platform, technician } = split(fee, p.visitShareBps);
  return { fee, platformShare: platform, technicianShare: technician, refund: p.visitFee - fee };
}

// ---------------------------------------------------------------- cancellation tiers

export type CancelTier =
  | 'free_window'
  | 'not_accepted'
  | 'late_cancel'
  | 'on_the_way'
  | 'technician_late'
  | 'not_allowed';

/**
 * Which tier applies when the CUSTOMER cancels (D10, D51, D52, M-09).
 * Times are epoch milliseconds.
 */
export function customerCancelTier(p: {
  status: string;
  bookedAt: number;
  now: number;
  freeCancelMinutes: number;
  windowEnd: number;
  arrivalGraceMinutes: number;
}): CancelTier {
  const cancellable = ['pending_payment', 'requested', 'accepted', 'on_the_way'];
  if (!cancellable.includes(p.status)) return 'not_allowed';
  if (p.status === 'pending_payment') return 'free_window';
  if (p.now - p.bookedAt <= p.freeCancelMinutes * 60_000) return 'free_window';
  if (p.status === 'requested') return 'not_accepted';
  if (p.now > p.windowEnd + p.arrivalGraceMinutes * 60_000) return 'technician_late';
  if (p.status === 'accepted') return 'late_cancel';
  return 'on_the_way';
}

export function cancelFeeBpsForTier(
  tier: CancelTier,
  s: { lateCancelFeeBps: Bps; onTheWayCancelFeeBps: Bps },
): Bps {
  if (tier === 'late_cancel') return s.lateCancelFeeBps;
  if (tier === 'on_the_way') return s.onTheWayCancelFeeBps;
  return 0;
}

export function vatOn(amount: Baisa, vatBps: Bps): Baisa {
  return share(amount, vatBps);
}
