import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { themeIcons, themes } from '../../db/schema.ts';
import { ApiError, errors } from '../../lib/errors.ts';
import { live } from '../../lib/live.ts';
import { activeTheme } from '../../lib/themes.ts';
import { localized, parse, uuidParam } from '../../lib/validation.ts';
import { serializeTheme } from '../../serializers.ts';

const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v)).nullable();

const themeBody = z.object({
  name: z.string().trim().min(2).max(80),
  logoUrl: z.string().max(500).nullable(),
  bannerUrl: z.string().max(500).nullable(),
  greeting: localized.nullable(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #C8102E.').nullable(),
  iconName: z.enum(themeIcons).nullable(),
  startsAt: isoDate,
  endsAt: isoDate,
  isEnabled: z.boolean(),
});

/**
 * Seasonal looks (National Day, Ramadan, Eid...). The active one changes the
 * logo and greeting in the app and on the website right away, and the app
 * offers the matching home-screen icon.
 */
export async function themeAdminRoutes(admin: FastifyInstance) {
  const { db } = admin;
  const adminOnly = { preHandler: admin.guard('admin') };
  const changed = () => admin.live.publish(...live.configChanged());

  admin.get('/themes', adminOnly, async () => {
    const [rows, active] = await Promise.all([
      db.select().from(themes).orderBy(desc(themes.startsAt), desc(themes.createdAt)),
      activeTheme(db),
    ]);
    return { themes: rows.map(serializeTheme), activeThemeId: active?.id ?? null, icons: themeIcons };
  });

  admin.post('/themes', adminOnly, async (request, reply) => {
    const body = parse(themeBody.partial({
      logoUrl: true, bannerUrl: true, greeting: true, accentColor: true, iconName: true, startsAt: true, endsAt: true, isEnabled: true,
    }), request.body);
    if (body.startsAt && body.endsAt && body.endsAt <= body.startsAt) {
      throw new ApiError(400, 'validation_failed', 'endsAt: the theme must end after it starts.');
    }
    const [theme] = await db.insert(themes).values(body).returning();
    changed();
    return reply.status(201).send({ theme: serializeTheme(theme!) });
  });

  admin.patch('/themes/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(themeBody.partial(), request.body);
    const [theme] = await db.update(themes).set({ ...body, updatedAt: new Date() }).where(eq(themes.id, id)).returning();
    if (!theme) throw errors.notFound('Theme');
    if (theme.startsAt && theme.endsAt && theme.endsAt <= theme.startsAt) {
      throw new ApiError(400, 'validation_failed', 'endsAt: the theme must end after it starts.');
    }
    changed();
    return { theme: serializeTheme(theme) };
  });

  admin.delete('/themes/:id', adminOnly, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [theme] = await db.delete(themes).where(eq(themes.id, id)).returning({ id: themes.id });
    if (!theme) throw errors.notFound('Theme');
    changed();
    return { ok: true };
  });
}
