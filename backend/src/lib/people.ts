import { eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { sessions, settings, users } from '../db/schema.ts';
import { lookupIndex, seal, unseal } from './sealed.ts';

/** Finds an account by email or phone without storing either in clear (see lib/sealed.ts). */
export const emailIndex = (email: string) => lookupIndex(`email:${email.trim().toLowerCase()}`);
export const phoneIndex = (phone: string) => lookupIndex(`phone:${phone}`);

/**
 * Ids of the accounts whose name, email, phone or member number contains `query`.
 * Searched here rather than in SQL, since the database only holds them encrypted.
 */
export async function searchUserIds(db: Database, query: string): Promise<string[]> {
  const needle = query.trim().toLowerCase();
  const rows = await db.select({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, memberNumber: users.memberNumber })
    .from(users);
  return rows
    .filter((row) => [row.fullName, row.email, row.phone ?? '', row.memberNumber].some((value) => value.toLowerCase().includes(needle)))
    .map((row) => row.id);
}

const KEY_CHECK = 'data-key-check';
const KEY_CHECK_TEXT = 'sarena';

/**
 * On start: stops with a clear message if the data key changed (the data would be
 * unreadable), then encrypts anything saved before encryption was switched on.
 */
export async function protectStoredData(db: Database, log: (message: string) => void) {
  const [check] = await db.select().from(settings).where(eq(settings.key, KEY_CHECK)).limit(1);
  if (check) {
    let readable = false;
    try { readable = unseal(String(check.value)) === KEY_CHECK_TEXT; } catch { /* wrong key */ }
    if (!readable) {
      throw new Error('The stored personal data was encrypted with another key: DATA_KEY (or JWT_SECRET, when DATA_KEY is empty) '
        + 'in backend/.env was changed. Put the original value back and restart.');
    }
  } else {
    await db.insert(settings).values({ key: KEY_CHECK, value: seal(KEY_CHECK_TEXT) });
  }

  // Accounts saved in clear by earlier versions (no lookup index yet).
  const legacy = await db.select({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone }).from(users)
    .where(or(isNull(users.emailIndex), sql`${users.email} not like 'enc1:%'`));
  for (const row of legacy) {
    const email = row.email.trim().toLowerCase();
    await db.update(users).set({
      fullName: row.fullName, email, phone: row.phone, emailIndex: emailIndex(email), phoneIndex: row.phone ? phoneIndex(row.phone) : null,
    }).where(eq(users.id, row.id));
  }
  const oldSessions = (await db.select({ id: sessions.id, userAgent: sessions.userAgent, ip: sessions.ip }).from(sessions)
    .where(sql`${sessions.userAgent} not like 'enc1:%'`));
  for (const row of oldSessions) {
    await db.update(sessions).set({ userAgent: row.userAgent, ip: row.ip }).where(eq(sessions.id, row.id));
  }
  if (legacy.length) log(`Encrypted the personal data of ${legacy.length} accounts saved by an earlier version.`);
}

