import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { themes, type Theme } from '../db/schema.ts';

/** The enabled theme running now; the most recently started wins. */
export async function activeTheme(db: Database, now = new Date()): Promise<Theme | null> {
  const [theme] = await db.select().from(themes)
    .where(and(
      eq(themes.isEnabled, true),
      or(isNull(themes.startsAt), lte(themes.startsAt, now)),
      or(isNull(themes.endsAt), gt(themes.endsAt, now)),
    ))
    .orderBy(desc(themes.startsAt), desc(themes.updatedAt))
    .limit(1);
  return theme ?? null;
}
