/**
 * Notifications (§10): in-app always, push first, SMS fallback, quiet hours for non-urgent messages.
 * Delivery runs from the scheduler so it never happens inside a business transaction.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { inQuietHours, quietHoursEnd } from '@katf/shared';
import { interpolate } from '@katf/shared/i18n';
import type { Ctx } from '../ctx';
import type { DbOrTx } from '../db';
import { adminAccounts, notificationTemplates, notifications, pushSubscriptions, users } from '../db/schema';
import { newId } from '../lib/ids';
import { registerJob, schedule } from './scheduler';
import { TEMPLATES } from '../seed/templates';

export async function seedTemplates(db: DbOrTx) {
  for (const t of TEMPLATES) {
    await db
      .insert(notificationTemplates)
      .values({ key: t.key, bodyAr: t.ar, bodyEn: t.en, urgent: t.urgent ?? false, channels: t.channels })
      .onConflictDoNothing();
  }
}

export interface NotifyInput {
  userId: string;
  key: string;
  vars?: Record<string, string | number>;
  link?: string | null;
  /** force SMS in addition to push (e.g. new request) */
  alsoSms?: boolean;
}

/** Queue a notification. Safe to call inside a transaction. */
export async function notify(ctx: Ctx, tx: DbOrTx, n: NotifyInput) {
  const tpl = (await tx.select().from(notificationTemplates).where(eq(notificationTemplates.key, n.key)))[0];
  if (!tpl) throw new Error(`missing template ${n.key}`);
  const now = ctx.clock.now();
  const s = await ctx.settings.all();
  const vars = { app: String(s.app_name), ...(n.vars ?? {}) };
  const payload = { vars, urgent: tpl.urgent };
  await tx.insert(notifications).values({ id: newId(), userId: n.userId, channel: 'inapp', templateKey: n.key, payload, link: n.link ?? null, status: 'sent', sentAt: new Date(now) });

  const subs = await tx.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, n.userId));
  const quiet = !tpl.urgent && inQuietHours(now, String(s.quiet_hours_start), String(s.quiet_hours_end));
  const sendAfter = quiet ? new Date(quietHoursEnd(now, String(s.quiet_hours_end))) : new Date(now);
  const channels: string[] = [];
  if (tpl.channels.includes('push') && subs.length) channels.push('push');
  if (tpl.channels.includes('sms') && (!subs.length || n.alsoSms || tpl.urgent)) channels.push('sms');
  for (const channel of channels) {
    const id = newId();
    await tx.insert(notifications).values({ id, userId: n.userId, channel, templateKey: n.key, payload, link: n.link ?? null, status: 'queued', sendAfter });
    await schedule(tx, 'deliver_notification', id, sendAfter);
  }
}

export async function notifyAdmins(ctx: Ctx, tx: DbOrTx, roles: string[], what: string, link?: string) {
  const admins = await tx.select({ id: adminAccounts.userId }).from(adminAccounts).where(and(inArray(adminAccounts.role, roles), eq(adminAccounts.active, true)));
  for (const a of admins) await notify(ctx, tx, { userId: a.id, key: 'admin_alert', vars: { what }, link: link ?? null });
}

registerJob('deliver_notification', async (ctx, job) => {
  const n = (await ctx.db.select().from(notifications).where(eq(notifications.id, job.entityId)))[0];
  if (!n || n.status !== 'queued') return;
  const tpl = (await ctx.db.select().from(notificationTemplates).where(eq(notificationTemplates.key, n.templateKey)))[0];
  const user = (await ctx.db.select().from(users).where(eq(users.id, n.userId)))[0];
  if (!tpl || !user || user.status === 'deleted') {
    await ctx.db.update(notifications).set({ status: 'skipped' }).where(eq(notifications.id, n.id));
    return;
  }
  const vars = (n.payload.vars ?? {}) as Record<string, string | number>;
  const body = interpolate(user.locale === 'en' ? tpl.bodyEn : tpl.bodyAr, vars);
  const title = String((await ctx.settings.all())[user.locale === 'en' ? 'app_name_en' : 'app_name']);
  try {
    if (n.channel === 'sms') {
      const phone = ctx.crypto.decrypt(user.phoneEnc);
      if (!phone) throw new Error('no phone');
      const s = await ctx.settings.all();
      const allow = (s.sms_allowlist as string[]) ?? [];
      if (ctx.providers.sms.real && !s.legal_gate_cleared && !allow.some((p) => p.replace(/\D/g, '').endsWith(phone.slice(-8)))) {
        await ctx.db.update(notifications).set({ status: 'skipped', error: 'legal_gate' }).where(eq(notifications.id, n.id));
        return;
      }
      await ctx.providers.sms.send(phone, body);
    } else if (n.channel === 'push') {
      const subs = await ctx.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, n.userId));
      let delivered = 0;
      for (const sub of subs) {
        const r = await ctx.providers.push
          .send({ kind: sub.kind as 'webpush' | 'apns', endpoint: sub.endpoint, keys: sub.keys }, { title, body, link: n.link, urgent: Boolean(n.payload.urgent), sound: n.templateKey === 'new_request' ? 'new_request.caf' : undefined })
          .catch(() => 'error' as const);
        if (r === 'gone') await ctx.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        if (r === 'ok') delivered++;
      }
      if (!delivered && tpl.channels.includes('sms')) {
        // push failed: fall back to SMS
        const id = newId();
        await ctx.db.insert(notifications).values({ id, userId: n.userId, channel: 'sms', templateKey: n.templateKey, payload: n.payload, link: n.link, status: 'queued', sendAfter: new Date(ctx.clock.now()) });
        await schedule(ctx.db, 'deliver_notification', id, ctx.clock.now());
      }
    }
    await ctx.db.update(notifications).set({ status: 'sent', sentAt: new Date(ctx.clock.now()) }).where(eq(notifications.id, n.id));
  } catch (e) {
    await ctx.db.update(notifications).set({ status: 'failed', error: String((e as Error).message).slice(0, 200) }).where(eq(notifications.id, n.id));
  }
});

export async function markRead(ctx: Ctx, userId: string, ids: string[] | 'all') {
  const where = ids === 'all' ? and(eq(notifications.userId, userId), isNull(notifications.readAt)) : and(eq(notifications.userId, userId), inArray(notifications.id, ids));
  await ctx.db.update(notifications).set({ readAt: new Date(ctx.clock.now()) }).where(where);
}

/** Render one template for display in the notification centre. */
export async function renderInapp(db: DbOrTx, rows: { templateKey: string; payload: Record<string, unknown> }[], locale: 'ar' | 'en') {
  const keys = [...new Set(rows.map((r) => r.templateKey))];
  const tpls = keys.length ? await db.select().from(notificationTemplates).where(inArray(notificationTemplates.key, keys)) : [];
  const byKey = new Map(tpls.map((t) => [t.key, t]));
  return rows.map((r) => {
    const t = byKey.get(r.templateKey);
    return t ? interpolate(locale === 'en' ? t.bodyEn : t.bodyAr, (r.payload.vars ?? {}) as Record<string, string | number>) : r.templateKey;
  });
}
