import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client.ts';
import { offers, plans, venues, type Offer, type Venue } from '../db/schema.ts';
import { errors } from '../lib/errors.ts';
import { sendCached } from '../lib/http.ts';
import { parse, uuidParam } from '../lib/validation.ts';
import { serializePlan, serializeVenue } from '../serializers.ts';

/** Venues with their offers, in display order. */
export async function venuesWithOffers(db: Database, rows: Venue[], activeOnly: boolean) {
  if (rows.length === 0) return [];
  const all: Offer[] = await db.select().from(offers)
    .where(activeOnly
      ? and(inArray(offers.venueId, rows.map((v) => v.id)), eq(offers.isActive, true))
      : inArray(offers.venueId, rows.map((v) => v.id)))
    .orderBy(asc(offers.sortOrder), asc(offers.createdAt));
  return rows.map((v) => serializeVenue(v, all.filter((o) => o.venueId === v.id)));
}

export async function catalogRoutes(api: FastifyInstance) {
  const { db } = api;

  /** Public: shown on the website and before subscribing. */
  api.get('/plans', async (request, reply) => {
    const rows = await db.select().from(plans).where(eq(plans.isActive, true)).orderBy(asc(plans.sortOrder));
    return sendCached(request, reply, { plans: rows.map((p) => serializePlan(p)) });
  });

  /** Members-only: prices are visible to signed-in accounts only. */
  api.get('/venues', { preHandler: api.guard() }, async (request, reply) => {
    const rows = await db.select().from(venues).where(eq(venues.isPublished, true))
      .orderBy(asc(venues.sortOrder), asc(venues.createdAt));
    return sendCached(request, reply, { venues: await venuesWithOffers(db, rows, true) });
  });

  api.get('/venues/:id', { preHandler: api.guard() }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [venue] = await db.select().from(venues).where(and(eq(venues.id, id), eq(venues.isPublished, true))).limit(1);
    if (!venue) throw errors.notFound('Venue');
    const [result] = await venuesWithOffers(db, [venue], true);
    return { venue: result };
  });
}
