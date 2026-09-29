import type { FastifyInstance } from 'fastify';
import { sendCached } from '../lib/http.ts';
import { getNotificationSettings } from '../lib/settings.ts';
import { activeTheme } from '../lib/themes.ts';
import { serializeTheme } from '../serializers.ts';

/**
 * `GET /v1/app/config` (public): what the app and the website need before
 * sign-in — the seasonal theme (logo, greeting, suggested icon), reminder
 * timings for booked events, and store / support links. ETag-cached.
 */
export async function appConfigRoutes(api: FastifyInstance) {
  const { db, config } = api;

  const handler = async (request: Parameters<typeof sendCached>[0], reply: Parameters<typeof sendCached>[1]) => {
    const [theme, notifications] = await Promise.all([activeTheme(db), getNotificationSettings(db)]);
    return sendCached(request, reply, {
      theme: theme ? serializeTheme(theme) : null,
      reminders: {
        morningHour: notifications.morningHour,
        hoursBefore: notifications.reminderHoursBefore,
        finalReminderMinutes: notifications.finalReminderMinutes,
      },
      links: {
        appStoreUrl: config.links.appStore,
        googlePlayUrl: config.links.googlePlay,
        whatsapp: config.links.whatsapp,
        email: config.links.email,
        instagram: config.links.instagram,
      },
      timeZone: 'Asia/Muscat',
      /** "Add to Apple Wallet" is offered only when the server can sign passes. */
      wallet: { enabled: api.wallet !== null },
    });
  };

  api.get('/app/config', handler);
  /** Older name kept for the website. */
  api.get('/public/config', handler);
}
