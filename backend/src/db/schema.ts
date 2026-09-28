import { sql } from 'drizzle-orm';
import {
  boolean, doublePrecision, index, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

/** Bilingual content, e.g. `{ en: "Ibri Arena", ar: "ساحة عبري للاستعراض" }`. */
export type Localized = { en: string; ar: string };

export const roles = ['member', 'staff', 'admin'] as const;
export const categories = [
  'cinema', 'jetSki', 'shootingClub', 'automobileClub', 'ibriArena', 'videoGames', 'festivals',
] as const;

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- Accounts

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  /** Lower-cased. */
  email: text('email').notNull().unique(),
  /** Omani mobile, 8 digits without +968 (optional for staff/admin accounts). */
  phone: text('phone').unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: roles }).notNull().default('member'),
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  memberNumber: text('member_number').notNull().unique(),
  createdAt: createdAt(),
});

/** One row per signed-in device; revoking it signs that device out. */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

/** SMS sign-in codes (stored hashed). */
export const otpCodes = pgTable('otp_codes', {
  id: serial('id').primaryKey(),
  phone: text('phone').notNull(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('otp_phone_idx').on(t.phone)]);

// ---------------------------------------------------------------- Memberships

/** Sellable membership plans (Sarena launches with a single annual plan). */
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: jsonb('name').$type<Localized>().notNull(),
  description: jsonb('description').$type<Localized>().notNull(),
  /** Price in baisa (1 OMR = 1000 baisa). */
  priceBaisa: integer('price_baisa').notNull(),
  durationDays: integer('duration_days').notNull(),
  perks: jsonb('perks').$type<Localized[]>().notNull().default(sql`'[]'::jsonb`),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  /** "expired" is derived from `expiresAt`, not stored. */
  status: text('status', { enum: ['active', 'cancelled'] }).notNull().default('active'),
  source: text('source', { enum: ['demo', 'admin', 'app_store', 'web'] }).notNull(),
  paidBaisa: integer('paid_baisa').notNull().default(0),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('memberships_user_idx').on(t.userId), index('memberships_expiry_idx').on(t.expiresAt)]);

// ---------------------------------------------------------------- Catalogue

/** Venues and events (festivals, shows...) managed from the dashboard. */
export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  category: text('category', { enum: categories }).notNull(),
  name: jsonb('name').$type<Localized>().notNull(),
  area: jsonb('area').$type<Localized>().notNull(),
  summary: jsonb('summary').$type<Localized>().notNull(),
  about: jsonb('about').$type<Localized>().notNull(),
  highlights: jsonb('highlights').$type<Localized[]>().notNull().default(sql`'[]'::jsonb`),
  openingHours: jsonb('opening_hours').$type<Localized>().notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  rating: real('rating').notNull().default(0),
  reviewCount: integer('review_count').notNull().default(0),
  imageUrl: text('image_url'),
  isFeatured: boolean('is_featured').notNull().default(false),
  isPublished: boolean('is_published').notNull().default(true),
  /** Marketing countdown ("deal ends in..."). */
  dealEndsAt: timestamp('deal_ends_at', { withTimezone: true }),
  /** Set for events (festivals, shows). */
  eventStartsAt: timestamp('event_starts_at', { withTimezone: true }),
  eventEndsAt: timestamp('event_ends_at', { withTimezone: true }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Ticket options at a venue, each with an original and a member price. */
export const offers = pgTable('offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  title: jsonb('title').$type<Localized>().notNull(),
  perks: jsonb('perks').$type<Localized[]>().notNull().default(sql`'[]'::jsonb`),
  originalPriceBaisa: integer('original_price_baisa').notNull(),
  memberPriceBaisa: integer('member_price_baisa').notNull(),
  /** Remaining allocation at the member price; null = unlimited. */
  remaining: integer('remaining'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index('offers_venue_idx').on(t.venueId)]);

// ---------------------------------------------------------------- Bookings

/** A booked code the member shows at the venue. Venue/offer text is snapshotted. */
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
  offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'set null' }),
  venueName: jsonb('venue_name').$type<Localized>().notNull(),
  category: text('category', { enum: categories }).notNull(),
  offerTitle: jsonb('offer_title').$type<Localized>().notNull(),
  quantity: integer('quantity').notNull(),
  paidTotalBaisa: integer('paid_total_baisa').notNull(),
  originalTotalBaisa: integer('original_total_baisa').notNull(),
  status: text('status', { enum: ['active', 'used', 'cancelled'] }).notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  redeemedBy: uuid('redeemed_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('bookings_code_idx').on(t.code), index('bookings_user_idx').on(t.userId)]);

export type User = typeof users.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Role = (typeof roles)[number];
export type Category = (typeof categories)[number];
