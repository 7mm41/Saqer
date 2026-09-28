import type { Plan } from '../db/schema.ts';

/** The plan's discount when it is running now (e.g. a National Day price). */
export function activePromo(plan: Plan, now = new Date()) {
  if (plan.promoPriceBaisa === null || plan.promoPriceBaisa >= plan.priceBaisa) return null;
  if (plan.promoStartsAt && plan.promoStartsAt > now) return null;
  if (plan.promoEndsAt && plan.promoEndsAt <= now) return null;
  return {
    priceBaisa: plan.promoPriceBaisa,
    label: plan.promoLabel ?? { en: 'Limited-time offer', ar: 'عرض لفترة محدودة' },
    endsAt: plan.promoEndsAt,
  };
}

/** What a member pays for the plan right now. */
export function effectivePriceBaisa(plan: Plan, now = new Date()) {
  return activePromo(plan, now)?.priceBaisa ?? plan.priceBaisa;
}
