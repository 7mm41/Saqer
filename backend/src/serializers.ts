import type { Booking, Membership, Offer, Plan, User, Venue } from './db/schema.ts';
import { membershipStatus } from './lib/memberships.ts';

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export const serializeUser = (u: User) => ({
  id: u.id,
  fullName: u.fullName,
  email: u.email,
  phone: u.phone ?? '',
  memberNumber: u.memberNumber,
  memberSince: iso(u.createdAt),
  role: u.role,
  status: u.status,
});

export const serializePlan = (p: Plan) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  priceBaisa: p.priceBaisa,
  durationDays: p.durationDays,
  perks: p.perks,
  isActive: p.isActive,
});

export const serializeMembership = (m: Membership, plan: Plan) => ({
  id: m.id,
  plan: serializePlan(plan),
  status: membershipStatus(m),
  source: m.source,
  startsAt: iso(m.startsAt),
  expiresAt: iso(m.expiresAt),
});

export const serializeOffer = (o: Offer) => ({
  id: o.id,
  title: o.title,
  perks: o.perks,
  originalPriceBaisa: o.originalPriceBaisa,
  memberPriceBaisa: o.memberPriceBaisa,
  remaining: o.remaining,
  isActive: o.isActive,
});

export const serializeVenue = (v: Venue, offers: Offer[]) => ({
  id: v.id,
  slug: v.slug,
  category: v.category,
  name: v.name,
  area: v.area,
  summary: v.summary,
  about: v.about,
  highlights: v.highlights,
  openingHours: v.openingHours,
  latitude: v.latitude,
  longitude: v.longitude,
  rating: v.rating,
  reviewCount: v.reviewCount,
  imageUrl: v.imageUrl,
  isFeatured: v.isFeatured,
  isPublished: v.isPublished,
  dealEndsAt: iso(v.dealEndsAt),
  eventStartsAt: iso(v.eventStartsAt),
  eventEndsAt: iso(v.eventEndsAt),
  offers: offers.map(serializeOffer),
});

export const serializeBooking = (b: Booking) => ({
  id: b.id,
  code: b.code,
  venueId: b.venueId,
  venueName: b.venueName,
  category: b.category,
  offerTitle: b.offerTitle,
  quantity: b.quantity,
  paidTotalBaisa: b.paidTotalBaisa,
  originalTotalBaisa: b.originalTotalBaisa,
  status: b.status,
  purchasedAt: iso(b.createdAt),
  expiresAt: iso(b.expiresAt),
  usedAt: iso(b.usedAt),
});
