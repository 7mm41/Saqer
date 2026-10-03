/**
 * The booking state machine (§5). The API runs every status change through
 * `findTransition`; anything not listed here is rejected with 409.
 */

export const BOOKING_STATUSES = [
  'pending_payment',
  'requested',
  'accepted',
  'on_the_way',
  'arrived',
  'diagnosing',
  'quote_sent',
  'repair_payment_pending',
  'in_progress',
  'completed_pending_confirmation',
  'confirmed',
  'settled',
  'paid_out',
  'disputed',
  'customer_absent',
  'closed_visit_only',
  'cancelled_by_customer',
  'cancelled_by_technician',
  'expired',
  'expired_unpaid',
  'refunded_full',
  'refunded_partial',
  'repair_failed_closed',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const FINAL_STATUSES: readonly BookingStatus[] = [
  'closed_visit_only',
  'customer_absent',
  'paid_out',
  'cancelled_by_customer',
  'cancelled_by_technician',
  'expired',
  'expired_unpaid',
  'refunded_full',
  'refunded_partial',
  'repair_failed_closed',
];

export const ACTIVE_STATUSES: readonly BookingStatus[] = BOOKING_STATUSES.filter(
  (s) => !FINAL_STATUSES.includes(s) && s !== 'settled' && s !== 'confirmed',
);

export type Actor = 'customer' | 'technician' | 'admin' | 'system';

export type BookingEvent =
  | 'visit_paid'
  | 'payment_expired'
  | 'accept'
  | 'request_expired'
  | 'customer_cancel'
  | 'technician_cancel'
  | 'admin_cancel'
  | 'start_travel'
  | 'arrive'
  | 'customer_absent'
  | 'start_diagnosis'
  | 'send_quote'
  | 'approve_quote'
  | 'reject_quote'
  | 'quote_expired'
  | 'repair_paid'
  | 'repair_payment_timeout'
  | 'resume_work'
  | 'complete'
  | 'confirm'
  | 'auto_confirm'
  | 'open_dispute'
  | 'settle'
  | 'payout_paid'
  | 'decide_confirm'
  | 'decide_refund_partial'
  | 'decide_refund_full'
  | 'decide_repair_failed'
  | 'mark_no_show'
  | 'reassign'
  | 'start_revisit_work'
  | 'revisit_failed';

export interface Transition {
  event: BookingEvent;
  from: readonly BookingStatus[];
  to: BookingStatus;
  actors: readonly Actor[];
  /** names of guards the API must pass (see api/src/services/booking-guards.ts) */
  guards?: readonly string[];
}

export const TRANSITIONS: readonly Transition[] = [
  { event: 'visit_paid', from: ['pending_payment'], to: 'requested', actors: ['system'] },
  { event: 'payment_expired', from: ['pending_payment'], to: 'expired_unpaid', actors: ['system'] },
  { event: 'accept', from: ['requested'], to: 'accepted', actors: ['technician', 'admin'], guards: ['technician_available', 'no_overlap', 'terms_current'] },
  { event: 'request_expired', from: ['requested'], to: 'expired', actors: ['system', 'admin'] },
  { event: 'customer_cancel', from: ['pending_payment', 'requested', 'accepted', 'on_the_way'], to: 'cancelled_by_customer', actors: ['customer'] },
  { event: 'technician_cancel', from: ['accepted', 'on_the_way'], to: 'cancelled_by_technician', actors: ['technician'] },
  { event: 'admin_cancel', from: ['pending_payment', 'requested', 'accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote_sent', 'repair_payment_pending'], to: 'cancelled_by_customer', actors: ['admin'] },
  { event: 'mark_no_show', from: ['accepted', 'on_the_way'], to: 'cancelled_by_technician', actors: ['admin', 'system'] },
  { event: 'reassign', from: ['requested', 'accepted'], to: 'requested', actors: ['admin'] },
  { event: 'start_travel', from: ['accepted'], to: 'on_the_way', actors: ['technician'] },
  { event: 'arrive', from: ['on_the_way'], to: 'arrived', actors: ['technician'], guards: ['geofence_or_override', 'arrival_photo'] },
  { event: 'customer_absent', from: ['arrived'], to: 'customer_absent', actors: ['technician'], guards: ['waited_enough', 'call_attempts'] },
  { event: 'start_diagnosis', from: ['arrived'], to: 'diagnosing', actors: ['technician'] },
  { event: 'send_quote', from: ['diagnosing', 'in_progress'], to: 'quote_sent', actors: ['technician'], guards: ['diagnosis_complete', 'quote_valid'] },
  { event: 'approve_quote', from: ['quote_sent'], to: 'repair_payment_pending', actors: ['customer'] },
  { event: 'reject_quote', from: ['quote_sent'], to: 'closed_visit_only', actors: ['customer'] },
  { event: 'quote_expired', from: ['quote_sent'], to: 'closed_visit_only', actors: ['system'] },
  { event: 'resume_work', from: ['quote_sent', 'repair_payment_pending'], to: 'in_progress', actors: ['customer', 'system'] },
  { event: 'repair_paid', from: ['repair_payment_pending'], to: 'in_progress', actors: ['system'] },
  { event: 'repair_payment_timeout', from: ['repair_payment_pending'], to: 'closed_visit_only', actors: ['system'] },
  { event: 'complete', from: ['in_progress'], to: 'completed_pending_confirmation', actors: ['technician'], guards: ['completion_evidence'] },
  { event: 'confirm', from: ['completed_pending_confirmation'], to: 'confirmed', actors: ['customer'] },
  { event: 'auto_confirm', from: ['completed_pending_confirmation'], to: 'confirmed', actors: ['system'] },
  { event: 'open_dispute', from: ['completed_pending_confirmation'], to: 'disputed', actors: ['customer', 'admin'] },
  { event: 'settle', from: ['confirmed'], to: 'settled', actors: ['system'] },
  { event: 'payout_paid', from: ['settled'], to: 'paid_out', actors: ['system', 'admin'] },
  { event: 'decide_confirm', from: ['disputed'], to: 'confirmed', actors: ['admin'] },
  { event: 'decide_refund_partial', from: ['disputed'], to: 'refunded_partial', actors: ['admin'] },
  { event: 'decide_refund_full', from: ['disputed'], to: 'refunded_full', actors: ['admin'] },
  { event: 'start_revisit_work', from: ['diagnosing'], to: 'in_progress', actors: ['technician'], guards: ['is_revisit'] },
  { event: 'revisit_failed', from: ['arrived', 'diagnosing', 'in_progress'], to: 'repair_failed_closed', actors: ['technician', 'admin'], guards: ['is_revisit'] },
  { event: 'decide_repair_failed', from: ['disputed', 'settled', 'paid_out', 'confirmed'], to: 'repair_failed_closed', actors: ['admin', 'system'] },
];

export function findTransition(from: BookingStatus, event: BookingEvent, actor: Actor): Transition | null {
  return TRANSITIONS.find((t) => t.event === event && t.from.includes(from) && t.actors.includes(actor)) ?? null;
}

export function canTransition(from: BookingStatus, event: BookingEvent, actor: Actor): boolean {
  return findTransition(from, event, actor) !== null;
}

/** Customer-facing timeline steps (§8.4). */
export const TRACKING_STEPS = [
  'booked',
  'assigned',
  'on_the_way',
  'arrived',
  'diagnosing',
  'quote',
  'in_progress',
  'awaiting_confirmation',
  'done',
] as const;
export type TrackingStep = (typeof TRACKING_STEPS)[number];

export function trackingStep(status: BookingStatus): TrackingStep {
  switch (status) {
    case 'pending_payment':
    case 'requested':
      return 'booked';
    case 'accepted':
      return 'assigned';
    case 'on_the_way':
      return 'on_the_way';
    case 'arrived':
      return 'arrived';
    case 'diagnosing':
      return 'diagnosing';
    case 'quote_sent':
    case 'repair_payment_pending':
      return 'quote';
    case 'in_progress':
      return 'in_progress';
    case 'completed_pending_confirmation':
    case 'disputed':
      return 'awaiting_confirmation';
    default:
      return 'done';
  }
}

/** Technician-facing stepper (§7.3). */
export const TECH_STEPS = ['accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote', 'in_progress', 'completed', 'customer_confirmed', 'payout'] as const;

export function techStep(status: BookingStatus): (typeof TECH_STEPS)[number] {
  switch (status) {
    case 'accepted':
      return 'accepted';
    case 'on_the_way':
      return 'on_the_way';
    case 'arrived':
      return 'arrived';
    case 'diagnosing':
      return 'diagnosing';
    case 'quote_sent':
    case 'repair_payment_pending':
      return 'quote';
    case 'in_progress':
      return 'in_progress';
    case 'completed_pending_confirmation':
    case 'disputed':
      return 'completed';
    case 'confirmed':
    case 'settled':
      return 'customer_confirmed';
    case 'paid_out':
      return 'payout';
    default:
      return 'accepted';
  }
}

/** Mermaid diagram generated from the table (docs/state-machine.md). */
export function stateMachineMermaid(): string {
  const lines = ['stateDiagram-v2', '  [*] --> pending_payment'];
  for (const t of TRANSITIONS) {
    for (const f of t.from) lines.push(`  ${f} --> ${t.to}: ${t.event} (${t.actors.join('/')})`);
  }
  for (const f of FINAL_STATUSES) lines.push(`  ${f} --> [*]`);
  return lines.join('\n');
}
