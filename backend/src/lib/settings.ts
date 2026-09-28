import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/client.ts';
import { settings } from '../db/schema.ts';

/** Automatic notifications and event reminders, editable from the dashboard. */
export const notificationSettingsSchema = z.object({
  /** Push to all members a few minutes after a venue or event is published. */
  newEvents: z.boolean(),
  /** Push to all members on the morning an event starts. */
  eventDay: z.boolean(),
  /** Push when a discount on the membership starts. */
  planPromos: z.boolean(),
  /** Remind members 7 days before their membership ends, and when it has ended. */
  membershipExpiry: z.boolean(),
  /** Minutes between publishing and the "new event" push (time to fix a typo). */
  newEventDelayMinutes: z.number().int().min(0).max(24 * 60),
  /** Local hour (Oman time) for morning pushes and event-day reminders. */
  morningHour: z.number().int().min(5).max(12),
  /** Booked-event reminder on the app: at least this many hours before the start. */
  reminderHoursBefore: z.number().int().min(1).max(24),
  /** Last reminder on the app, this many minutes before the start (0 = off). */
  finalReminderMinutes: z.number().int().min(0).max(240),
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const defaultNotificationSettings: NotificationSettings = {
  newEvents: true,
  eventDay: true,
  planPromos: true,
  membershipExpiry: true,
  newEventDelayMinutes: 10,
  morningHour: 8,
  reminderHoursBefore: 5,
  finalReminderMinutes: 60,
};

const KEY = 'notifications';

export async function getNotificationSettings(db: Database): Promise<NotificationSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  const parsed = notificationSettingsSchema.partial().safeParse(row?.value ?? {});
  return { ...defaultNotificationSettings, ...(parsed.success ? parsed.data : {}) };
}

export async function updateNotificationSettings(db: Database, patch: Partial<NotificationSettings>) {
  const value = { ...(await getNotificationSettings(db)), ...patch };
  await db.insert(settings).values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  return value;
}
