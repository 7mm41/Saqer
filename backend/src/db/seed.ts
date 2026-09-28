import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { count, eq } from 'drizzle-orm';
import type { Config } from '../config.ts';
import { memberNumber } from '../lib/codes.ts';
import { grantMembership } from '../lib/memberships.ts';
import { hashPassword } from '../lib/passwords.ts';
import type { Database } from './client.ts';
import { offers, plans, users, venues, type Category, type Localized } from './schema.ts';

export const DEMO_MEMBER = { fullName: 'Sarena Demo', email: 'demo@sarena.om', password: 'Sarena2026', phone: '91234567' };

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
  let [plan] = await db.select().from(plans).limit(1);
  if (!plan) {
    [plan] = await db.insert(plans).values(ANNUAL_PLAN).returning();
    log('Seeded the annual membership plan (15 OMR / year).');
  }

  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, config.adminEmail)).limit(1);
  if (!admin) {
    await db.insert(users).values({
      fullName: 'Sarena Admin', email: config.adminEmail, phone: null, role: 'admin',
      passwordHash: await hashPassword(config.adminPassword), memberNumber: memberNumber(),
    });
    log(config.adminPasswordGenerated
      ? `Created the dashboard admin ${config.adminEmail} with password: ${config.adminPassword}  (set ADMIN_PASSWORD to choose one)`
      : `Created the dashboard admin ${config.adminEmail}.`);
  }

  if (config.demoMode) {
    const [demo] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_MEMBER.email)).limit(1);
    if (!demo) {
      const [created] = await db.insert(users).values({
        fullName: DEMO_MEMBER.fullName, email: DEMO_MEMBER.email, phone: DEMO_MEMBER.phone,
        passwordHash: await hashPassword(DEMO_MEMBER.password), memberNumber: memberNumber(),
      }).returning();
      await grantMembership(db, { userId: created!.id, planId: plan!.id, source: 'demo', paidBaisa: 0 });
      log(`Created the demo member ${DEMO_MEMBER.email} / ${DEMO_MEMBER.password} (SMS code 123456 for +968 ${DEMO_MEMBER.phone}).`);
    }
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
