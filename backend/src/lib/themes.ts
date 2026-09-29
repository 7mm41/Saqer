import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { themes, type Theme } from '../db/schema.ts';

/**
 * The enabled look running now. A look without a start date is the everyday
 * logo; one with dates replaces it during its season (the latest start wins).
 */
export async function activeTheme(db: Database, now = new Date()): Promise<Theme | null> {
  const [theme] = await db.select().from(themes)
    .where(and(
      eq(themes.isEnabled, true),
      or(isNull(themes.startsAt), lte(themes.startsAt, now)),
      or(isNull(themes.endsAt), gt(themes.endsAt, now)),
    ))
    .orderBy(sql`${themes.startsAt} desc nulls last`, desc(themes.updatedAt))
    .limit(1);
  return theme ?? null;
}
