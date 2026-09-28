import { and, count, desc, eq, gt, gte, sql, sum } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { bookings, devices, memberships, notifications, users } from '../../db/schema.ts';

const DAY = 86_400_000;

export async function statsRoutes(admin: FastifyInstance) {
  const { db } = admin;

  admin.get('/stats', { preHandler: admin.guard('admin') }, async () => {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY);

    const [membersTotal] = await db.select({ n: count() }).from(users).where(eq(users.role, 'member'));
    const [membersNew] = await db.select({ n: count() }).from(users)
      .where(and(eq(users.role, 'member'), gte(users.createdAt, since)));
    const [activeMembers] = await db.select({ n: sql<number>`count(distinct ${memberships.userId})`.mapWith(Number) })
      .from(memberships).where(and(eq(memberships.status, 'active'), gt(memberships.expiresAt, now)));
    const [revenueTotal] = await db.select({ n: sum(memberships.paidBaisa).mapWith(Number) }).from(memberships);
    const [revenue30] = await db.select({ n: sum(memberships.paidBaisa).mapWith(Number) }).from(memberships)
      .where(gte(memberships.createdAt, since));
    const [bookings30] = await db.select({ n: count() }).from(bookings).where(gte(bookings.createdAt, since));
    const [redeemed30] = await db.select({ n: count() }).from(bookings)
      .where(and(eq(bookings.status, 'used'), gte(bookings.usedAt, since)));
    const [savings] = await db.select({
      n: sql<number>`coalesce(sum(${bookings.originalTotalBaisa} - ${bookings.paidTotalBaisa}), 0)`.mapWith(Number),
    }).from(bookings).where(sql`${bookings.status} <> 'cancelled'`);

    const day = sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`;
    const signups = await db.select({ date: day, count: count() }).from(users)
      .where(and(eq(users.role, 'member'), gte(users.createdAt, since))).groupBy(day).orderBy(day);

    const topVenues = await db.select({ venueName: bookings.venueName, bookings: count() }).from(bookings)
      .where(gte(bookings.createdAt, since))
      .groupBy(bookings.venueName).orderBy(desc(count())).limit(5);

    const [deviceCount] = await db.select({ n: count() }).from(devices);
    const [pushes30] = await db.select({ n: count() }).from(notifications)
      .where(and(eq(notifications.status, 'sent'), gte(notifications.sentAt, since)));
    const [expiring30] = await db.select({ n: count() }).from(memberships).where(and(
      eq(memberships.status, 'active'), gt(memberships.expiresAt, now), sql`${memberships.expiresAt} <= ${new Date(now.getTime() + 30 * DAY)}`,
    ));

    const byDate = new Map(signups.map((s) => [s.date, s.count]));
    const series = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(now.getTime() - (29 - i) * DAY).toISOString().slice(0, 10);
      return { date, count: byDate.get(date) ?? 0 };
    });

    return {
      members: membersTotal?.n ?? 0,
      newMembers30d: membersNew?.n ?? 0,
      activeMemberships: activeMembers?.n ?? 0,
      revenueTotalBaisa: revenueTotal?.n ?? 0,
      revenue30dBaisa: revenue30?.n ?? 0,
      bookings30d: bookings30?.n ?? 0,
      redemptions30d: redeemed30?.n ?? 0,
      memberSavingsBaisa: savings?.n ?? 0,
      pushDevices: deviceCount?.n ?? 0,
      notificationsSent30d: pushes30?.n ?? 0,
      membershipsEndingIn30d: expiring30?.n ?? 0,
      pushConfigured: admin.notifier.pushConfigured,
      signups: series,
      topVenues,
    };
  });
}
