import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { categories, offers, venues } from '../../db/schema.ts';
import { ApiError, errors } from '../../lib/errors.ts';
import { live } from '../../lib/live.ts';
import { localized, localizedList, parse, uuidParam } from '../../lib/validation.ts';
import { serializeOffer } from '../../serializers.ts';
import { venuesWithOffers } from '../catalog.ts';

const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v)).nullable();

const venueBody = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,60}$/, 'Use 3–60 lowercase letters, digits or dashes.'),
  category: z.enum(categories),
  name: localized,
  area: localized,
  summary: localized,
  about: localized,
  highlights: localizedList,
  openingHours: localized,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  rating: z.number().min(0).max(5),
  reviewCount: z.number().int().min(0),
  imageUrl: z.string().max(500).nullable(),
  isFeatured: z.boolean(),
  isPublished: z.boolean(),
  dealEndsAt: isoDate,
  eventStartsAt: isoDate,
  eventEndsAt: isoDate,
  sortOrder: z.number().int(),
});

const offerBody = z.object({
  title: localized,
  perks: localizedList,
  originalPriceBaisa: z.number().int().min(0).max(10_000_000),
  memberPriceBaisa: z.number().int().min(0).max(10_000_000),
  remaining: z.number().int().min(0).nullable(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function venueAdminRoutes(admin: FastifyInstance) {
  const { db, config } = admin;
  const adminOnly = { preHandler: admin.guard('admin') };
  /** Every catalogue change reaches open apps right away (see lib/live.ts). */
  const changed = () => admin.live.publish(...live.catalogChanged());

  admin.get('/venues', adminOnly, async () => {
    const rows = await db.select().from(venues).orderBy(asc(venues.sortOrder), asc(venues.createdAt));
    return { venues: await venuesWithOffers(db, rows, false) };
  });

  admin.get('/venues/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [venue] = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
    if (!venue) throw errors.notFound('Venue');
    const [result] = await venuesWithOffers(db, [venue], false);
    return { venue: result };
  });

  admin.post('/venues', adminOnly, async (request, reply) => {
    const body = parse(venueBody.partial({
      highlights: true, rating: true, reviewCount: true, imageUrl: true, isFeatured: true, isPublished: true,
      dealEndsAt: true, eventStartsAt: true, eventEndsAt: true, sortOrder: true,
    }), request.body);
    const [existing] = await db.select({ id: venues.id }).from(venues).where(eq(venues.slug, body.slug)).limit(1);
    if (existing) throw new ApiError(409, 'slug_taken', 'Another venue already uses this link name.');
    const [venue] = await db.insert(venues).values(body).returning();
    changed();
    await admin.notifier.scheduleNewEvent(venue!);
    const [result] = await venuesWithOffers(db, [venue!], false);
    return reply.status(201).send({ venue: result });
  });

  admin.patch('/venues/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(venueBody.partial(), request.body);
    const [venue] = await db.update(venues).set({ ...body, updatedAt: new Date() }).where(eq(venues.id, id)).returning();
    if (!venue) throw errors.notFound('Venue');
    changed();
    // Publishing a draft announces it (once per venue).
    if (body.isPublished === true) await admin.notifier.scheduleNewEvent(venue);
    const [result] = await venuesWithOffers(db, [venue], false);
    return { venue: result };
  });

  admin.delete('/venues/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [venue] = await db.delete(venues).where(eq(venues.id, id)).returning({ id: venues.id });
    if (!venue) throw errors.notFound('Venue');
    changed();
    return { ok: true };
  });

  admin.post('/venues/:id/offers', adminOnly, async (request, reply) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(offerBody.partial({ perks: true, remaining: true, isActive: true, sortOrder: true }), request.body);
    const [venue] = await db.select({ id: venues.id }).from(venues).where(eq(venues.id, id)).limit(1);
    if (!venue) throw errors.notFound('Venue');
    const [offer] = await db.insert(offers).values({ ...body, venueId: id }).returning();
    changed();
    return reply.status(201).send({ offer: serializeOffer(offer!) });
  });

  admin.patch('/offers/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(offerBody.partial(), request.body);
    const [offer] = await db.update(offers).set(body).where(eq(offers.id, id)).returning();
    if (!offer) throw errors.notFound('Offer');
    changed();
    return { offer: serializeOffer(offer) };
  });

  admin.delete('/offers/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [offer] = await db.delete(offers).where(eq(offers.id, id)).returning({ id: offers.id });
    if (!offer) throw errors.notFound('Offer');
    changed();
    return { ok: true };
  });

  /**
   * Image upload (JPEG, PNG or WebP, up to 5 MB) → its path on this server.
   * Relative, so it keeps working when the server's address changes (a new
   * tunnel, a domain); the app resolves it against the API it talks to.
   */
  admin.post('/uploads', adminOnly, async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ApiError(400, 'no_file', 'Choose an image to upload.');
    const extension = IMAGE_TYPES[file.mimetype];
    if (!extension) {
      file.file.resume();
      throw new ApiError(415, 'unsupported_image', 'Upload a JPEG, PNG or WebP image.');
    }
    const name = `${randomUUID()}.${extension}`;
    const target = join(config.uploadsDir, name);
    await pipeline(file.file, createWriteStream(target));
    if (file.file.truncated) {
      await unlink(target);
      throw new ApiError(413, 'image_too_large', 'Images must be 5 MB or smaller.');
    }
    return reply.status(201).send({ url: `/uploads/${name}` });
  });
}
