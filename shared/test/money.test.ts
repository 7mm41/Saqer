import { describe, expect, it } from 'vitest';
import {
  cancelFeeBpsForTier,
  cancelSplit,
  chooseCommissionBps,
  customerCancelTier,
  formatOMR,
  parseOMR,
  parsePercent,
  formatPercent,
  settleCompleted,
  settleRepairFailed,
  settleVisitOnly,
  share,
  split,
  type QuoteLine,
} from '../src/money';

const VISIT = 5000;
// Quote total 20.000 including the 5.000 visit fee.
const lines: QuoteLine[] = [
  { kind: 'labor', label: 'إصلاح تسريب', qty: 1, unitPrice: 12000 },
  { kind: 'part', label: 'صمام', qty: 1, unitPrice: 8000 },
];

describe('worked examples (§2)', () => {
  it('A) marketplace job: 15% commission', () => {
    const r = settleCompleted({ visitFee: VISIT, lines, commissionBps: 1500, gatewayBps: 200 });
    expect(r.total).toBe(20000);
    expect(r.secondPayment).toBe(15000);
    expect(r.commission).toBe(3000);
    expect(r.technicianNet).toBe(17000);
    expect(r.gatewayFee).toBe(400);
    expect(r.platformNet).toBe(2600);
  });

  it("B) technician's own link: 5% commission", () => {
    const r = settleCompleted({ visitFee: VISIT, lines, commissionBps: 500, gatewayBps: 200 });
    expect(r.commission).toBe(1000);
    expect(r.technicianNet).toBe(19000);
    expect(r.platformNet).toBe(600);
  });

  it('C) quote rejected: visit fee only, 10% platform share', () => {
    const r = settleVisitOnly({ visitFee: VISIT, visitShareBps: 1000, gatewayBps: 200 });
    expect(r.customerPays).toBe(5000);
    expect(r.platformShare).toBe(500);
    expect(r.technicianNet).toBe(4500);
  });

  it('D) repair failed after revisit: refund repair minus evidenced parts, no commission', () => {
    const evidenced = lines.map((l) => (l.kind === 'part' ? { ...l, evidenced: true } : l));
    const r = settleRepairFailed({ visitFee: VISIT, lines: evidenced, gatewayBps: 200 });
    expect(r.partsReimbursed).toBe(8000);
    expect(r.refund).toBe(15000 - 8000);
    expect(r.technicianNet).toBe(5000 + 8000);
    expect(r.commission).toBe(0);
  });

  it('D) parts without accepted receipts are not reimbursed', () => {
    const r = settleRepairFailed({ visitFee: VISIT, lines, gatewayBps: 200 });
    expect(r.partsReimbursed).toBe(0);
    expect(r.refund).toBe(15000);
    expect(r.technicianNet).toBe(5000);
  });

  it('D) parts reimbursement is capped at the repair payment', () => {
    const big: QuoteLine[] = [{ kind: 'part', label: 'كمبروسر', qty: 1, unitPrice: 30000, evidenced: true }];
    const r = settleRepairFailed({ visitFee: VISIT, lines: big, gatewayBps: 0 });
    expect(r.partsReimbursed).toBe(25000);
    expect(r.refund).toBe(0);
  });

  it('E) technician no-show: full refund (cancel split with 0%)', () => {
    const r = cancelSplit({ visitFee: VISIT, feeBps: 0, visitShareBps: 1000 });
    expect(r.refund).toBe(5000);
    expect(r.technicianShare).toBe(0);
  });

  it('F) late cancel: 30% of the visit fee, platform share 10% of that', () => {
    const r = cancelSplit({ visitFee: VISIT, feeBps: 3000, visitShareBps: 1000 });
    expect(r.fee).toBe(1500);
    expect(r.platformShare).toBe(150);
    expect(r.technicianShare).toBe(1350);
    expect(r.refund).toBe(3500);
  });
});

describe('rounding', () => {
  it('rounds the platform share half up and gives the remainder to the platform', () => {
    expect(share(5, 1000)).toBe(1); // 0.5 → 1
    expect(share(4, 1000)).toBe(0); // 0.4 → 0
    expect(share(15, 1500)).toBe(2); // 2.25 → 2
    expect(share(17, 1500)).toBe(3); // 2.55 → 3
    const s = split(333, 1500);
    expect(s.platform + s.technician).toBe(333);
    expect(s.platform).toBe(50); // 49.95 → 50
  });

  it('commission is calculated per line', () => {
    const r = settleCompleted({
      visitFee: 1000,
      lines: [
        { kind: 'labor', label: 'a', qty: 1, unitPrice: 1003 },
        { kind: 'part', label: 'b', qty: 1, unitPrice: 1003 },
      ],
      commissionBps: 1500,
      gatewayBps: 0,
    });
    // each line: 150.45 → 150; sum 300 (total-based would be 300.9 → 301)
    expect(r.commission).toBe(300);
    expect(r.commission + r.technicianNet).toBe(r.total);
  });

  it('rejects a quote below the visit fee (D53)', () => {
    expect(() =>
      settleCompleted({ visitFee: 5000, lines: [{ kind: 'labor', label: 'x', qty: 1, unitPrice: 3000 }], commissionBps: 1500, gatewayBps: 0 }),
    ).toThrow();
  });

  it('never accepts floats', () => {
    expect(() => share(10.5, 100)).toThrow();
  });
});

describe('formatting and parsing', () => {
  it('formats baisa as OMR with 3 decimals', () => {
    expect(formatOMR(5000)).toBe('5.000');
    expect(formatOMR(1350)).toBe('1.350');
    expect(formatOMR(7)).toBe('0.007');
    expect(formatOMR(-400)).toBe('-0.400');
  });
  it('parses OMR strings without floats', () => {
    expect(parseOMR('5')).toBe(5000);
    expect(parseOMR('5.5')).toBe(5500);
    expect(parseOMR('0.125')).toBe(125);
    expect(parseOMR('٥٫٥')).toBeNull();
    expect(parseOMR('٥.٥')).toBe(5500);
    expect(parseOMR('5.1234')).toBeNull();
    expect(parseOMR('abc')).toBeNull();
  });
  it('parses and formats percentages as basis points', () => {
    expect(parsePercent('15')).toBe(1500);
    expect(parsePercent('12.5')).toBe(1250);
    expect(parsePercent('101')).toBeNull();
    expect(formatPercent(1250)).toBe('12.5');
    expect(formatPercent(1500)).toBe('15');
  });
});

describe('commission choice (D57)', () => {
  const base = { standardBps: 1500, ownCustomerBps: 500, repeatCustomerBps: 500 };
  it('marketplace uses the standard rate', () => {
    expect(chooseCommissionBps({ ...base, entryMode: 'marketplace', isRepeatPair: false }).bps).toBe(1500);
  });
  it('direct link uses the own-customer rate', () => {
    expect(chooseCommissionBps({ ...base, entryMode: 'direct_link', isRepeatPair: false })).toEqual({ bps: 500, reason: 'own_link' });
  });
  it('repeat pair on marketplace gets the repeat rate', () => {
    expect(chooseCommissionBps({ ...base, entryMode: 'marketplace', isRepeatPair: true }).bps).toBe(500);
  });
  it('an override replaces the standard rate only', () => {
    expect(chooseCommissionBps({ ...base, entryMode: 'marketplace', isRepeatPair: false, overrideBps: 1000 }).bps).toBe(1000);
    expect(chooseCommissionBps({ ...base, entryMode: 'direct_link', isRepeatPair: false, overrideBps: 1000 }).bps).toBe(500);
    expect(chooseCommissionBps({ ...base, entryMode: 'direct_link', isRepeatPair: false, overrideBps: 300 }).bps).toBe(300);
  });
});

describe('cancellation tiers (D10, D51, D52)', () => {
  const t0 = Date.UTC(2026, 9, 4, 6, 0);
  const windowEnd = t0 + 5 * 3600_000;
  const base = { bookedAt: t0, freeCancelMinutes: 10, windowEnd, arrivalGraceMinutes: 20 };
  it('free within 10 minutes even when on the way (D51)', () => {
    expect(customerCancelTier({ ...base, status: 'on_the_way', now: t0 + 9 * 60_000 })).toBe('free_window');
  });
  it('free after the window when nobody accepted (D52)', () => {
    expect(customerCancelTier({ ...base, status: 'requested', now: t0 + 30 * 60_000 })).toBe('not_accepted');
  });
  it('late cancel after acceptance', () => {
    const tier = customerCancelTier({ ...base, status: 'accepted', now: t0 + 30 * 60_000 });
    expect(tier).toBe('late_cancel');
    expect(cancelFeeBpsForTier(tier, { lateCancelFeeBps: 3000, onTheWayCancelFeeBps: 10000 })).toBe(3000);
  });
  it('100% once on the way', () => {
    const tier = customerCancelTier({ ...base, status: 'on_the_way', now: t0 + 30 * 60_000 });
    expect(cancelFeeBpsForTier(tier, { lateCancelFeeBps: 3000, onTheWayCancelFeeBps: 10000 })).toBe(10000);
  });
  it('free when the technician is later than window end + grace', () => {
    expect(customerCancelTier({ ...base, status: 'on_the_way', now: windowEnd + 21 * 60_000 })).toBe('technician_late');
  });
  it('not allowed after arrival', () => {
    expect(customerCancelTier({ ...base, status: 'arrived', now: t0 + 30 * 60_000 })).toBe('not_allowed');
  });
});
