import { and, desc, eq, gt } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { memberships, plans, type Membership, type Plan } from '../db/schema.ts';
import { errors } from './errors.ts';

const DAY = 86_400_000;

export type MembershipWithPlan = { membership: Membership; plan: Plan };

export function membershipStatus(m: Membership, now = new Date()): 'active' | 'expired' | 'cancelled' {
  if (m.status === 'cancelled') return 'cancelled';
  return m.expiresAt > now ? 'active' : 'expired';
}

/** The membership currently giving access, if any (the one that runs longest). */
export async function activeMembership(db: Database, userId: string, now = new Date()): Promise<MembershipWithPlan | null> {
  const rows = await db.select({ membership: memberships, plan: plans })
    .from(memberships)
    .innerJoin(plans, eq(plans.id, memberships.planId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active'), gt(memberships.expiresAt, now)))
    .orderBy(desc(memberships.expiresAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Starts a membership, or extends the current one: a renewal starts when the
 * active period ends, so members never lose remaining days.
 */
export async function grantMembership(db: Database, input: {
  userId: string; planId: string; source: Membership['source']; paidBaisa: number; days?: number;
}): Promise<MembershipWithPlan> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId)).limit(1);
  if (!plan) throw errors.notFound('Plan');
  const current = await activeMembership(db, input.userId);
  const startsAt = current ? current.membership.expiresAt : new Date();
  const expiresAt = new Date(startsAt.getTime() + (input.days ?? plan.durationDays) * DAY);
  const [membership] = await db.insert(memberships).values({
    userId: input.userId, planId: plan.id, source: input.source, paidBaisa: input.paidBaisa, startsAt, expiresAt,
  }).returning();
  return { membership: membership!, plan };
}
