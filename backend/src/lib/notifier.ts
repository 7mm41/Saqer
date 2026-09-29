import { and, asc, eq, gt, inArray, isNotNull, lte, sql, type SQL } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.ts';
import type { Database } from '../db/client.ts';
import {
  devices, memberships, notifications, plans, users, venues,
  type Audience, type Device, type Localized, type Notification, type Venue,
} from '../db/schema.ts';
import { live, type LiveHub } from './live.ts';
import { activePromo } from './plans.ts';
import type { PushMessage, PushResult, PushSender } from './push.ts';
import { getNotificationSettings, type NotificationSettings } from './settings.ts';
import { activeTheme } from './themes.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Automatic pushes wait for the morning instead of arriving at night. */
const QUIET_FROM_HOUR = 22;

type NewNotification = typeof notifications.$inferInsert;

/**
 * Sends every push notification, with no one at the keyboard:
 *
 * * new venues and events (a few minutes after publishing, so typos can be fixed),
 * * the morning an event starts,
 * * when a discount on the membership starts,
 * * 7 days before a membership ends, and when it has ended,
 * * broadcasts written in the dashboard (now or scheduled).
 *
 * Reminders for events a member booked are scheduled on the phone itself
 * (see the app's `EventReminderScheduler`) using the times in `/v1/app/config`,
 * so they arrive even offline.
 *
 * `tick()` runs every 30 seconds; every automatic notification has a
 * `dedupeKey`, so each one is sent once even with several API instances.
 */
export class Notifier {
  private timer: NodeJS.Timeout | null = null;
  /** The pass in progress; passes never overlap. */
  private current: Promise<{ sent: number }> | null = null;
  private lastThemeId: string | null | undefined;
  private readonly db: Database;
  private readonly push: PushSender;
  private readonly hub: LiveHub;
  private readonly config: Config;
  private readonly log: FastifyBaseLogger;

  constructor(options: { db: Database; push: PushSender; live: LiveHub; config: Config; log: FastifyBaseLogger }) {
    this.db = options.db;
    this.push = options.push;
    this.hub = options.live;
    this.config = options.config;
    this.log = options.log;
  }

  get pushConfigured() {
    return this.push.configured;
  }

  pushStatus() {
    return this.push.status();
  }

  start(intervalMs = 30_000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick().catch((error) => this.log.error({ err: error }, 'Notifier tick failed')), intervalMs);
    this.timer.unref();
    void this.tick().catch((error) => this.log.error({ err: error }, 'Notifier tick failed'));
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.push.close();
  }

  /** One pass: plan automatic notifications, apply theme changes, send what is due. */
  async tick(now = new Date()): Promise<{ sent: number }> {
    while (this.current) await this.current.catch(() => {});
    const pass = (async () => {
      const settings = await getNotificationSettings(this.db);
      await this.planAutomatic(now, settings);
      await this.checkTheme(now);
      return { sent: await this.deliverDue(now) };
    })();
    this.current = pass;
    try {
      return await pass;
    } finally {
      this.current = null;
    }
  }

  // MARK: Scheduling

  /** Called when a venue or event is published. */
  async scheduleNewEvent(venue: Venue, now = new Date()) {
    const settings = await getNotificationSettings(this.db);
    if (!settings.newEvents || !venue.isPublished) return;
    const sendAt = this.withinWakingHours(new Date(now.getTime() + settings.newEventDelayMinutes * 60_000), settings);
    const kind = venue.eventStartsAt ? 'event' : 'venue';
    await this.insert({
      kind: 'new_event',
      dedupeKey: `new_event:${venue.id}`,
      audience: 'all',
      venueId: venue.id,
      scheduledFor: sendAt,
      title: kind === 'event'
        ? { en: `New event: ${venue.name.en}`, ar: `فعالية جديدة: ${venue.name.ar}` }
        : { en: `New on Sarena: ${venue.name.en}`, ar: `جديد في سرينا: ${venue.name.ar}` },
      body: { en: venue.summary.en, ar: venue.summary.ar },
    });
  }

  /** A broadcast written in the dashboard. */
  async broadcast(input: {
    title: Localized; body: Localized; audience: Audience; userId?: string | null; venueId?: string | null;
    scheduledFor?: Date | null; createdBy: string;
  }) {
    const [row] = await this.db.insert(notifications).values({
      kind: 'broadcast',
      title: input.title,
      body: input.body,
      audience: input.audience,
      userId: input.audience === 'user' ? input.userId ?? null : null,
      venueId: input.venueId ?? null,
      scheduledFor: input.scheduledFor ?? new Date(),
      createdBy: input.createdBy,
    }).returning();
    this.hub.publish(live.admin('notifications'));
    return row!;
  }

  private async planAutomatic(now: Date, settings: NotificationSettings) {
    if (settings.eventDay) await this.planEventDays(now, settings);
    if (settings.planPromos) await this.planPromos(now, settings);
    if (settings.membershipExpiry) await this.planMembershipExpiry(now, settings);
  }

  /** "X starts today" on the morning of an event (or an hour before an early start). */
  private async planEventDays(now: Date, settings: NotificationSettings) {
    const { start, end } = this.localDay(now);
    const starting = await this.db.select().from(venues).where(and(
      eq(venues.isPublished, true), isNotNull(venues.eventStartsAt),
      gt(venues.eventStartsAt, start), lte(venues.eventStartsAt, end),
    ));
    for (const venue of starting) {
      const startsAt = venue.eventStartsAt!;
      const morning = this.localTime(now, settings.morningHour);
      const sendAt = new Date(Math.min(morning.getTime(), startsAt.getTime() - HOUR));
      // Only while it is relevant: from the send time until two hours after the start.
      if (now < sendAt || now.getTime() > startsAt.getTime() + 2 * HOUR) continue;
      await this.insert({
        kind: 'event_day',
        dedupeKey: `event_day:${venue.id}:${this.localDateKey(now)}`,
        audience: 'all',
        venueId: venue.id,
        scheduledFor: now,
        title: { en: `${venue.name.en} starts today 🎉`, ar: `${venue.name.ar} تبدأ اليوم 🎉` },
        body: {
          en: `Doors open at ${this.formatTime(startsAt, 'en')}. Member prices are waiting in the app.`,
          ar: `تبدأ الساعة ${this.formatTime(startsAt, 'ar')}. أسعار الأعضاء بانتظارك في التطبيق.`,
        },
      });
    }
  }

  /** A discount on the membership has started. */
  private async planPromos(now: Date, settings: NotificationSettings) {
    const rows = await this.db.select().from(plans).where(and(eq(plans.isActive, true), isNotNull(plans.promoPriceBaisa)));
    for (const plan of rows) {
      const promo = activePromo(plan, now);
      if (!promo) continue;
      const until = promo.endsAt;
      await this.insert({
        kind: 'plan_promo',
        dedupeKey: `plan_promo:${plan.id}:${plan.promoStartsAt?.toISOString() ?? 'open'}:${promo.priceBaisa}`,
        audience: 'all',
        scheduledFor: this.withinWakingHours(now, settings),
        title: { en: `${promo.label.en} 🎁`, ar: `${promo.label.ar} 🎁` },
        body: {
          en: `Sarena membership for ${this.formatOMR(promo.priceBaisa, 'en')} instead of ${this.formatOMR(plan.priceBaisa, 'en')}`
            + (until ? ` — until ${this.formatDate(until, 'en')}.` : '.'),
          ar: `عضوية سرينا بـ ${this.formatOMR(promo.priceBaisa, 'ar')} بدلاً من ${this.formatOMR(plan.priceBaisa, 'ar')}`
            + (until ? ` — حتى ${this.formatDate(until, 'ar')}.` : '.'),
        },
      });
    }
  }

  /** 7 days before the end, and right after it ended (unless already renewed). */
  private async planMembershipExpiry(now: Date, settings: NotificationSettings) {
    const notRenewed = sql`not exists (select 1 from ${memberships} as later where later.user_id = ${memberships.userId}
      and later.status = 'active' and later.expires_at > ${memberships.expiresAt})`;
    const ending = await this.db.select().from(memberships).where(and(
      eq(memberships.status, 'active'), gt(memberships.expiresAt, now),
      lte(memberships.expiresAt, new Date(now.getTime() + 7 * DAY)), notRenewed,
    ));
    for (const membership of ending) {
      await this.insert({
        kind: 'membership_expiring',
        dedupeKey: `membership_expiring:${membership.id}`,
        audience: 'user',
        userId: membership.userId,
        scheduledFor: this.withinWakingHours(now, settings),
        title: { en: 'Your membership ends soon', ar: 'عضويتك تنتهي قريباً' },
        body: {
          en: `It ends on ${this.formatDate(membership.expiresAt, 'en')}. Renew now and keep every member price.`,
          ar: `تنتهي في ${this.formatDate(membership.expiresAt, 'ar')}. جدّد الآن لتحافظ على كل أسعار الأعضاء.`,
        },
      });
    }
    const ended = await this.db.select().from(memberships).where(and(
      eq(memberships.status, 'active'), lte(memberships.expiresAt, now),
      gt(memberships.expiresAt, new Date(now.getTime() - 3 * DAY)), notRenewed,
    ));
    for (const membership of ended) {
      await this.insert({
        kind: 'membership_expired',
        dedupeKey: `membership_expired:${membership.id}`,
        audience: 'user',
        userId: membership.userId,
        scheduledFor: this.withinWakingHours(now, settings),
        title: { en: 'Your membership has ended', ar: 'انتهت عضويتك' },
        body: {
          en: 'Renew in the app to unlock member prices again.',
          ar: 'جدّد من التطبيق لتستعيد أسعار الأعضاء.',
        },
      });
    }
  }

  /** Tells open apps when a scheduled seasonal theme starts or ends. */
  private async checkTheme(now: Date) {
    const theme = await activeTheme(this.db, now);
    const id = theme?.id ?? null;
    if (this.lastThemeId !== undefined && this.lastThemeId !== id) {
      this.hub.publish(...live.configChanged());
    }
    this.lastThemeId = id;
  }

  private async insert(values: NewNotification) {
    const inserted = await this.db.insert(notifications).values(values)
      .onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id });
    if (inserted.length) this.hub.publish(live.admin('notifications'));
  }

  // MARK: Delivery

  private async deliverDue(now: Date) {
    const due = this.db.select({ id: notifications.id }).from(notifications)
      .where(and(eq(notifications.status, 'scheduled'), lte(notifications.scheduledFor, now)))
      .orderBy(asc(notifications.scheduledFor)).limit(10);
    // Claiming with a status change keeps two instances from sending the same one.
    const claimed = await this.db.update(notifications).set({ status: 'sending' })
      .where(and(inArray(notifications.id, due), eq(notifications.status, 'scheduled'))).returning();
    for (const notification of claimed) {
      await this.deliver(notification, now);
    }
    if (claimed.length) this.hub.publish(live.admin('notifications'));
    return claimed.length;
  }

  private async deliver(notification: Notification, now: Date) {
    try {
      if (notification.kind === 'new_event' && notification.venueId) {
        const [venue] = await this.db.select({ isPublished: venues.isPublished }).from(venues)
          .where(eq(venues.id, notification.venueId)).limit(1);
        if (!venue?.isPublished) {
          await this.db.update(notifications).set({ status: 'cancelled' }).where(eq(notifications.id, notification.id));
          return;
        }
      }
      const targets = await this.devicesFor(notification, now);
      const result = await this.sendTo(targets, {
        title: notification.title,
        body: notification.body,
        data: {
          kind: notification.kind,
          ...(notification.venueId ? { venueId: notification.venueId } : {}),
        },
      });
      const error = mainReason(result.failures);
      await this.db.update(notifications).set({
        // Reached no phone at all although some were targeted: say so instead of "sent".
        status: targets.length && !result.delivered && error ? 'failed' : 'sent',
        sentAt: new Date(), recipients: targets.length, delivered: result.delivered, error,
      }).where(eq(notifications.id, notification.id));
    } catch (error) {
      this.log.error({ err: error, id: notification.id }, 'Notification delivery failed');
      await this.db.update(notifications).set({ status: 'failed', error: 'ServerError' }).where(eq(notifications.id, notification.id));
    }
  }

  /**
   * Sends to these phones, then forgets the tokens Apple no longer accepts and
   * remembers which gateway the others use.
   */
  async sendTo(targets: Device[], message: PushMessage): Promise<PushResult> {
    const result = await this.push.send(targets, message);
    if (result.invalidTokens.length) {
      await this.db.delete(devices).where(inArray(devices.token, result.invalidTokens));
    }
    for (const { token, environment } of result.environments) {
      await this.db.update(devices).set({ environment }).where(eq(devices.token, token));
    }
    return result;
  }

  /** Devices of active accounts in the notification's audience. */
  async devicesFor(notification: Pick<Notification, 'audience' | 'userId'>, now = new Date()): Promise<Device[]> {
    const isMember = sql`exists (select 1 from ${memberships} where ${memberships.userId} = ${users.id}
      and ${memberships.status} = 'active' and ${memberships.expiresAt} > ${now})`;
    const filters: SQL[] = [eq(users.status, 'active')];
    if (notification.audience === 'members') filters.push(isMember);
    if (notification.audience === 'non_members') filters.push(sql`not ${isMember}`);
    if (notification.audience === 'user') filters.push(eq(users.id, notification.userId ?? '00000000-0000-0000-0000-000000000000'));
    const rows = await this.db.select({ device: devices }).from(devices)
      .innerJoin(users, eq(users.id, devices.userId)).where(and(...filters));
    return rows.map((r) => r.device);
  }

  // MARK: Oman time

  private get offsetMs() {
    return this.config.timezoneOffsetMinutes * 60_000;
  }

  /** Start and end of today in Oman, as instants. */
  private localDay(now: Date) {
    const local = new Date(now.getTime() + this.offsetMs);
    const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - this.offsetMs);
    return { start, end: new Date(start.getTime() + DAY) };
  }

  /** Today at `hour`:00 in Oman. */
  private localTime(now: Date, hour: number) {
    return new Date(this.localDay(now).start.getTime() + hour * HOUR);
  }

  private localDateKey(now: Date) {
    return new Date(now.getTime() + this.offsetMs).toISOString().slice(0, 10);
  }

  /** Automatic pushes avoid the night: 22:00 → the next morning. */
  withinWakingHours(date: Date, settings: Pick<NotificationSettings, 'morningHour'>) {
    const hour = new Date(date.getTime() + this.offsetMs).getUTCHours();
    if (hour >= settings.morningHour && hour < QUIET_FROM_HOUR) return date;
    const morning = this.localTime(date, settings.morningHour);
    return hour < settings.morningHour ? morning : new Date(morning.getTime() + DAY);
  }

  // MARK: Formatting (Oman time, both languages)

  private formatOMR(baisa: number, locale: 'ar' | 'en') {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-OM' : 'en-OM', {
      style: 'currency', currency: 'OMR', minimumFractionDigits: 0, maximumFractionDigits: 3,
    }).format(baisa / 1000);
  }

  private formatDate(date: Date, locale: 'ar' | 'en') {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-OM' : 'en-GB', {
      day: 'numeric', month: 'long', timeZone: 'Asia/Muscat',
    }).format(date);
  }

  private formatTime(date: Date, locale: 'ar' | 'en') {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-OM' : 'en-GB', {
      hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Muscat',
    }).format(date);
  }
}

/** The most common reason notifications didn't arrive, or null. */
function mainReason(failures: Record<string, number>): string | null {
  const [top] = Object.entries(failures).sort((a, b) => b[1] - a[1]);
  return top?.[0] ?? null;
}
