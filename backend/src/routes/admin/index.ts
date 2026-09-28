import type { FastifyInstance } from 'fastify';
import { bookingAdminRoutes } from './bookings.ts';
import { memberAdminRoutes } from './members.ts';
import { planAdminRoutes } from './plans.ts';
import { statsRoutes } from './stats.ts';
import { venueAdminRoutes } from './venues.ts';

/** Dashboard API. Admins manage everything; staff (venue cashiers) can only redeem codes. */
export async function adminRoutes(api: FastifyInstance) {
  await api.register(async (admin) => {
    await statsRoutes(admin);
    await memberAdminRoutes(admin);
    await planAdminRoutes(admin);
    await venueAdminRoutes(admin);
    await bookingAdminRoutes(admin);
  }, { prefix: '/admin' });
}
