# Booking state machine

The single source is the `TRANSITIONS` table in [`packages/shared/src/booking.ts`](../packages/shared/src/booking.ts).
Every change goes through `transition()` in `apps/api/src/services/booking-core.ts`, which:

1. finds the allowed transition for (current status, event, actor role) — anything else is refused;
2. updates the row only if `(id, status, version)` still match (compare-and-set), so two people acting
   at once cannot both win (tested: two technicians accepting at the same moment → exactly one);
3. writes a `booking_events` row (append-only) and the money/ledger effects in the same transaction.

Timers (accept timeout, unpaid expiry, quote expiry, repair-payment timeout, auto-confirm, payout due)
are rows in `scheduled_jobs`, so they continue after a restart.

The diagram below is generated from the code (`pnpm --filter @katf/api cli state-machine`); CI fails if it
is out of date.

```mermaid
stateDiagram-v2
  [*] --> pending_payment
  pending_payment --> requested: visit_paid (system)
  pending_payment --> expired_unpaid: payment_expired (system)
  requested --> accepted: accept (technician/admin)
  requested --> expired: request_expired (system/admin)
  pending_payment --> cancelled_by_customer: customer_cancel (customer)
  requested --> cancelled_by_customer: customer_cancel (customer)
  accepted --> cancelled_by_customer: customer_cancel (customer)
  on_the_way --> cancelled_by_customer: customer_cancel (customer)
  accepted --> cancelled_by_technician: technician_cancel (technician)
  on_the_way --> cancelled_by_technician: technician_cancel (technician)
  pending_payment --> cancelled_by_customer: admin_cancel (admin)
  requested --> cancelled_by_customer: admin_cancel (admin)
  accepted --> cancelled_by_customer: admin_cancel (admin)
  on_the_way --> cancelled_by_customer: admin_cancel (admin)
  arrived --> cancelled_by_customer: admin_cancel (admin)
  diagnosing --> cancelled_by_customer: admin_cancel (admin)
  quote_sent --> cancelled_by_customer: admin_cancel (admin)
  repair_payment_pending --> cancelled_by_customer: admin_cancel (admin)
  accepted --> cancelled_by_technician: mark_no_show (admin/system)
  on_the_way --> cancelled_by_technician: mark_no_show (admin/system)
  requested --> requested: reassign (admin)
  accepted --> requested: reassign (admin)
  accepted --> on_the_way: start_travel (technician)
  on_the_way --> arrived: arrive (technician)
  arrived --> customer_absent: customer_absent (technician)
  arrived --> diagnosing: start_diagnosis (technician)
  diagnosing --> quote_sent: send_quote (technician)
  in_progress --> quote_sent: send_quote (technician)
  quote_sent --> repair_payment_pending: approve_quote (customer)
  quote_sent --> closed_visit_only: reject_quote (customer)
  quote_sent --> closed_visit_only: quote_expired (system)
  quote_sent --> in_progress: resume_work (customer/system)
  repair_payment_pending --> in_progress: resume_work (customer/system)
  repair_payment_pending --> in_progress: repair_paid (system)
  repair_payment_pending --> closed_visit_only: repair_payment_timeout (system)
  in_progress --> completed_pending_confirmation: complete (technician)
  completed_pending_confirmation --> confirmed: confirm (customer)
  completed_pending_confirmation --> confirmed: auto_confirm (system)
  completed_pending_confirmation --> disputed: open_dispute (customer/admin)
  confirmed --> settled: settle (system)
  settled --> paid_out: payout_paid (system/admin)
  disputed --> confirmed: decide_confirm (admin)
  disputed --> refunded_partial: decide_refund_partial (admin)
  disputed --> refunded_full: decide_refund_full (admin)
  diagnosing --> in_progress: start_revisit_work (technician)
  arrived --> repair_failed_closed: revisit_failed (technician/admin)
  diagnosing --> repair_failed_closed: revisit_failed (technician/admin)
  in_progress --> repair_failed_closed: revisit_failed (technician/admin)
  disputed --> repair_failed_closed: decide_repair_failed (admin/system)
  settled --> repair_failed_closed: decide_repair_failed (admin/system)
  paid_out --> repair_failed_closed: decide_repair_failed (admin/system)
  confirmed --> repair_failed_closed: decide_repair_failed (admin/system)
  closed_visit_only --> [*]
  customer_absent --> [*]
  paid_out --> [*]
  cancelled_by_customer --> [*]
  cancelled_by_technician --> [*]
  expired --> [*]
  expired_unpaid --> [*]
  refunded_full --> [*]
  refunded_partial --> [*]
  repair_failed_closed --> [*]
```
