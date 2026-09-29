import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, count, eq, ne } from 'drizzle-orm';
import type { Config } from '../config.ts';
import { memberNumber } from '../lib/codes.ts';
import { activeMembership, grantMembership } from '../lib/memberships.ts';
import { hashPassword, verifyPassword } from '../lib/passwords.ts';
import { emailIndex, protectStoredData } from '../lib/people.ts';
import { setDataKey } from '../lib/sealed.ts';
import type { Database } from './client.ts';
import { offers, plans, sessions, settings, users, venues, type Category, type Localized } from './schema.ts';

/** Sarena launches with one plan: 15 OMR a year. */
export const ANNUAL_PLAN = {
  name: { en: 'Sarena Annual Membership', ar: 'عضوية سرينا السنوية' },
  description: {
    en: 'One membership, every member price — for a whole year.',
    ar: 'عضوية واحدة وكل أسعار الأعضاء، لسنة كاملة.',
  },
  priceBaisa: 15_000,
  durationDays: 365,
  perks: [
    { en: 'Member prices at every Sarena venue and event', ar: 'أسعار الأعضاء في كل أماكن وفعاليات سرينا' },
    { en: 'Instant booking codes, no printing or queues', ar: 'أكواد حجز فورية بلا طباعة ولا طوابير' },
    { en: 'Early access to festivals and new venues', ar: 'وصول مبكر للمهرجانات والأماكن الجديدة' },
  ],
};

type SeedVenue = {
  slug: string; category: Category; name: Localized; area: Localized; summary: Localized; about: Localized;
  highlights: Localized[]; openingHours: Localized; latitude: number; longitude: number; rating: number;
  reviewCount: number; isFeatured: boolean; dealEndsInHours: number | null; sortOrder: number;
  /** Festivals: starts `startsInDays` from today at `startHour` (Oman time) and runs `days` days. */
  event?: { startsInDays: number; startHour: number; days: number };
  offers: { title: Localized; perks: Localized[]; originalPriceBaisa: number; memberPriceBaisa: number; remaining: number | null }[];
};

/**
 * Creates what a fresh install needs. Safe to run on every start: each part
 * is skipped once it exists, so dashboard edits are never overwritten.
 */
export async function seed(db: Database, config: Config, log: (message: string) => void = console.log) {
  setDataKey(config.dataKey);
  await protectStoredData(db, log);
  let [plan] = await db.select().from(plans).limit(1);
  if (!plan) {
    [plan] = await db.insert(plans).values(ANNUAL_PLAN).returning();
    log('Seeded the annual membership plan (15 OMR / year).');
  }

  // Test and default accounts from earlier versions are removed once (before launch,
  // every account was a test); from then on, no account but the owner's can be an admin.
  const [cleaned] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, CLEANUP_KEY)).limit(1);
  if (!cleaned) {
    const removed = await db.delete(users).where(ne(users.emailIndex, emailIndex(config.adminEmail))).returning({ id: users.id });
    await db.insert(settings).values({ key: CLEANUP_KEY, value: { at: new Date().toISOString(), removed: removed.length } });
    if (removed.length) log(`Removed ${removed.length} test and default accounts: only ${config.adminEmail} is kept.`);
  }
  await db.update(users).set({ role: 'member' }).where(and(ne(users.role, 'member'), ne(users.emailIndex, emailIndex(config.adminEmail))));

  const owner = await ensureOwner(db, config);
  if (owner === 'missing') {
    log(`The control panel account ${config.adminEmail} has no password yet. Set it with: npm run admin-password`
      + ' (on a server: bash deploy/install.sh).');
  } else if (owner === 'updated') {
    log(`Set ${config.adminEmail}'s password from ADMIN_PASSWORD. Delete that line from .env now: the password is stored hashed.`);
  }

  const [venueCount] = await db.select({ n: count() }).from(venues);
  if ((venueCount?.n ?? 0) === 0) {
    const file = resolve(import.meta.dirname, 'seed-venues.json');
    const data = JSON.parse(readFileSync(file, 'utf8')) as SeedVenue[];
    for (const { offers: venueOffers, dealEndsInHours, event, ...venue } of data) {
      const eventStartsAt = event ? omanDate(event.startsInDays, event.startHour) : null;
      const [row] = await db.insert(venues).values({
        ...venue,
        dealEndsAt: dealEndsInHours ? new Date(Date.now() + dealEndsInHours * 3_600_000) : null,
        eventStartsAt,
        eventEndsAt: event && eventStartsAt ? new Date(eventStartsAt.getTime() + event.days * 86_400_000) : null,
      }).returning();
      await db.insert(offers).values(venueOffers.map((offer, index) => ({ ...offer, venueId: row!.id, sortOrder: index })));
    }
    log(`Seeded ${data.length} venues and events.`);
  }
}

/** `days` from today at `hour`:00 Oman time (UTC+4). */
function omanDate(days: number, hour: number) {
  const now = new Date(Date.now() + 4 * 3_600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour - 4));
}

const CLEANUP_KEY = 'accounts-cleanup-v1';
/** The owner's membership, so the same account also works fully in the app. */
const OWNER_MEMBERSHIP_DAYS = 3650;

/** "saqer@sarena.tech" → "Saqer". */
const ownerName = (email: string) => {
  const name = email.split('@')[0]!.replace(/[._-]+/g, ' ').trim();
  return name ? name.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()) : 'Sarena';
};

/**
 * The owner (ADMIN_EMAIL) is an active admin with a membership. ADMIN_PASSWORD,
 * when set, becomes its password; otherwise it keeps the one set with
 * `npm run admin-password`. "missing" = there is no owner account yet (no password to give it).
 */
async function ensureOwner(db: Database, config: Config): Promise<'ok' | 'updated' | 'missing'> {
  const [owner] = await db.select().from(users).where(eq(users.emailIndex, emailIndex(config.adminEmail))).limit(1);
  let result: 'ok' | 'updated' = 'ok';
  let id = owner?.id;
  if (!owner) {
    if (!config.adminPassword) return 'missing';
    id = (await setOwnerPassword(db, config, config.adminPassword)).id;
    result = 'updated';
  } else {
    if (owner.role !== 'admin' || owner.status !== 'active') {
      await db.update(users).set({ role: 'admin', status: 'active' }).where(eq(users.id, owner.id));
    }
    if (config.adminPassword && !(await verifyPassword(config.adminPassword, owner.passwordHash))) {
      await setOwnerPassword(db, config, config.adminPassword);
      result = 'updated';
    }
  }
  const [plan] = await db.select({ id: plans.id }).from(plans).limit(1);
  if (plan && !(await activeMembership(db, id!))) {
    await grantMembership(db, { userId: id!, planId: plan.id, source: 'admin', paidBaisa: 0, days: OWNER_MEMBERSHIP_DAYS });
  }
  return result;
}

/** Whether the owner account exists (with a password): `npm run admin-password -- --check`. */
export async function ownerExists(db: Database, config: Config) {
  setDataKey(config.dataKey);
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.emailIndex, emailIndex(config.adminEmail))).limit(1);
  return Boolean(owner);
}

/**
 * Gives the owner (ADMIN_EMAIL) a new password, creating the account if needed,
 * and signs it out everywhere. The password is never printed or stored in clear.
 */
export async function setOwnerPassword(db: Database, config: Config, password: string) {
  setDataKey(config.dataKey);
  const passwordHash = await hashPassword(password);
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.emailIndex, emailIndex(config.adminEmail))).limit(1);
  if (owner) {
    await db.update(users).set({ passwordHash, role: 'admin', status: 'active' }).where(eq(users.id, owner.id));
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, owner.id));
    return { id: owner.id, email: config.adminEmail, created: false };
  }
  const [created] = await db.insert(users).values({
    fullName: ownerName(config.adminEmail), email: config.adminEmail, emailIndex: emailIndex(config.adminEmail), phone: null,
    role: 'admin', passwordHash, memberNumber: memberNumber(),
  }).returning({ id: users.id });
  return { id: created!.id, email: config.adminEmail, created: true };
}
