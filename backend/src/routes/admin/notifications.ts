import { and, count, desc, eq, ne, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthContext } from '../../auth.ts';
import { audiences, devices, notificationKinds, notifications, users } from '../../db/schema.ts';
import { ApiError, errors } from '../../lib/errors.ts';
import { live } from '../../lib/live.ts';
import { notificationSettingsSchema, getNotificationSettings, updateNotificationSettings } from '../../lib/settings.ts';
import { localized, pagination, parse, uuidParam } from '../../lib/validation.ts';
import { serializeNotification } from '../../serializers.ts';

/** Push notifications: history, broadcasts and the automatic rules. */
export async function notificationAdminRoutes(admin: FastifyInstance) {
  const { db } = admin;
  const adminOnly = { preHandler: admin.guard('admin') };

  admin.get('/notifications', adminOnly, async (request) => {
    const query = parse(pagination.extend({
      kind: z.enum(notificationKinds).optional(),
      /** Written by an admin (broadcast) or sent by the automatic rules. */
      origin: z.enum(['written', 'automatic']).optional(),
      status: z.enum(['scheduled', 'sending', 'sent', 'cancelled', 'failed']).optional(),
      q: z.string().trim().max(100).optional(),
    }), request.query);
    const filters: SQL[] = [];
    if (query.kind) filters.push(eq(notifications.kind, query.kind));
    if (query.origin) filters.push(query.origin === 'written' ? eq(notifications.kind, 'broadcast') : ne(notifications.kind, 'broadcast'));
    if (query.q) {
      const like = `%${query.q}%`;
      filters.push(or(
        sql`${notifications.title}->>'en' ilike ${like}`, sql`${notifications.title}->>'ar' ilike ${like}`,
        sql`${notifications.body}->>'en' ilike ${like}`, sql`${notifications.body}->>'ar' ilike ${like}`,
      )!);
    }
    if (query.status) filters.push(eq(notifications.status, query.status));
    const where = filters.length ? and(...filters) : undefined;
    const [total] = await db.select({ n: count() }).from(notifications).where(where);
    const rows = await db.select().from(notifications).where(where)
      .orderBy(desc(notifications.scheduledFor)).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    const [deviceCount] = await db.select({ n: count() }).from(devices);
    return {
      items: rows.map(serializeNotification),
      total: total?.n ?? 0, page: query.page, pageSize: query.pageSize,
      pushConfigured: admin.notifier.pushConfigured,
      devices: deviceCount?.n ?? 0,
    };
  });

  /** Send now, or at `scheduledFor`. */
  admin.post('/notifications', adminOnly, async (request, reply) => {
    const { user } = requireAuthContext(request);
    const body = parse(z.object({
      title: localized,
      body: localized,
      audience: z.enum(audiences),
      userId: z.uuid().nullable().optional(),
      venueId: z.uuid().nullable().optional(),
      scheduledFor: z.iso.datetime({ offset: true }).transform((v) => new Date(v)).nullable().optional(),
    }), request.body);
    if (body.audience === 'user') {
      if (!body.userId) throw new ApiError(400, 'validation_failed', 'userId: choose the member to notify.');
      const [member] = await db.select({ id: users.id }).from(users).where(eq(users.id, body.userId)).limit(1);
      if (!member) throw errors.notFound('Member');
    }
    const notification = await admin.notifier.broadcast({ ...body, createdBy: user.id });
    // Deliver right away instead of waiting for the next scheduler pass.
    if (notification.scheduledFor <= new Date()) void admin.notifier.tick().catch(() => {});
    return reply.status(201).send({ notification: serializeNotification(notification) });
  });

  admin.post('/notifications/:id/cancel', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [notification] = await db.update(notifications).set({ status: 'cancelled' })
      .where(and(eq(notifications.id, id), eq(notifications.status, 'scheduled'))).returning();
    if (!notification) throw new ApiError(409, 'not_scheduled', 'Only scheduled notifications can be cancelled.');
    admin.live.publish(live.admin('notifications'));
    return { notification: serializeNotification(notification) };
  });

  /** How many devices a broadcast would reach. */
  admin.get('/notifications/audience', adminOnly, async (request) => {
    const query = parse(z.object({ audience: z.enum(audiences), userId: z.uuid().optional() }), request.query);
    const targets = await admin.notifier.devicesFor({ audience: query.audience, userId: query.userId ?? null });
    return { devices: targets.length };
  });

  /** Is push set up, how many phones can receive it, and what went wrong lately. */
  admin.get('/push/status', adminOnly, async (request) => {
    const { user } = requireAuthContext(request);
    const rows = await db.select({ environment: devices.environment, n: count() }).from(devices).groupBy(devices.environment);
    const [mine] = await db.select({ n: count() }).from(devices).where(eq(devices.userId, user.id));
    const byEnvironment = Object.fromEntries(rows.map((row) => [row.environment ?? 'unknown', row.n]));
    return {
      ...admin.notifier.pushStatus(),
      devices: {
        total: rows.reduce((sum, row) => sum + row.n, 0),
        sandbox: byEnvironment.sandbox ?? 0, production: byEnvironment.production ?? 0, unknown: byEnvironment.unknown ?? 0,
        mine: mine?.n ?? 0,
      },
    };
  });

  /** A test notification to the phones signed in with this account (or a member's), with Apple's answer for each. */
  admin.post('/push/test', adminOnly, async (request) => {
    const { user } = requireAuthContext(request);
    const body = parse(z.object({ userId: z.uuid().optional() }), request.body ?? {});
    const targets = await db.select().from(devices).where(eq(devices.userId, body.userId ?? user.id));
    if (!targets.length) {
      throw new ApiError(409, 'no_devices', 'No phone is registered for this account: sign in to the app with it and allow notifications.');
    }
    const result = await admin.notifier.sendTo(targets, {
      title: { en: 'Sarena test notification ✅', ar: 'إشعار تجريبي من سرينا ✅' },
      body: { en: 'Notifications reach this phone.', ar: 'الإشعارات تصل إلى هذا الجهاز.' },
      data: { kind: 'test' },
    });
    return {
      configured: admin.notifier.pushConfigured,
      delivered: result.delivered,
      devices: result.outcomes.length
        ? result.outcomes.map((o) => ({ environment: o.environment, ok: o.ok, reason: o.reason ?? null }))
        : targets.map((d) => ({ environment: d.environment, ok: false, reason: admin.notifier.pushConfigured ? null : 'NotConfigured' })),
    };
  });

  admin.get('/settings/notifications', adminOnly, async () => ({ settings: await getNotificationSettings(db) }));

  admin.patch('/settings/notifications', adminOnly, async (request) => {
    const patch = parse(notificationSettingsSchema.partial(), request.body);
    const settings = await updateNotificationSettings(db, patch);
    // Reminder timings are part of the app config.
    admin.live.publish(...live.configChanged());
    return { settings };
  });
}
