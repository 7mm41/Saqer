import type { FastifyInstance } from 'fastify';
import { bookingAdminRoutes } from './bookings.ts';
import { memberAdminRoutes } from './members.ts';
import { notificationAdminRoutes } from './notifications.ts';
import { planAdminRoutes } from './plans.ts';
import { statsRoutes } from './stats.ts';
import { themeAdminRoutes } from './themes.ts';
import { venueAdminRoutes } from './venues.ts';

/** Dashboard API. Admins manage everything; staff (venue cashiers) can only redeem codes. */
export async function adminRoutes(api: FastifyInstance) {
  await api.register(async (admin) => {
    await statsRoutes(admin);
    await memberAdminRoutes(admin);
    await planAdminRoutes(admin);
    await venueAdminRoutes(admin);
    await bookingAdminRoutes(admin);
    await themeAdminRoutes(admin);
    await notificationAdminRoutes(admin);
  }, { prefix: '/admin' });
}
