import type { Booking, Membership, Notification, Offer, Plan, Theme, User, Venue } from './db/schema.ts';
import { membershipStatus } from './lib/memberships.ts';
import { activePromo } from './lib/plans.ts';

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

/** Public shape: `promo` is present only while the discount runs. */
export const serializePlan = (p: Plan, now = new Date()) => {
  const promo = activePromo(p, now);
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    priceBaisa: p.priceBaisa,
    durationDays: p.durationDays,
    perks: p.perks,
    isActive: p.isActive,
    promo: promo ? { priceBaisa: promo.priceBaisa, label: promo.label, endsAt: iso(promo.endsAt) } : null,
  };
};

/** Dashboard shape, with the discount settings as stored. */
export const serializePlanAdmin = (p: Plan) => ({
  ...serializePlan(p),
  promoPriceBaisa: p.promoPriceBaisa,
  promoLabel: p.promoLabel,
  promoStartsAt: iso(p.promoStartsAt),
  promoEndsAt: iso(p.promoEndsAt),
  sortOrder: p.sortOrder,
});

/**
 * Uploaded images saved with a machine-local address (older versions used
 * PUBLIC_URL=http://localhost:3000) become paths on this server, which every
 * client can load whatever address it uses.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
export function portableMediaUrl(url: string | null): string | null {
  if (!url || url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    if (LOCAL_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith('/uploads/')) return parsed.pathname;
  } catch {
    // Not an absolute URL: leave as is.
  }
  return url;
}

export const serializeTheme = (t: Theme) => ({
  id: t.id,
  name: t.name,
  logoUrl: portableMediaUrl(t.logoUrl),
  bannerUrl: portableMediaUrl(t.bannerUrl),
  greeting: t.greeting,
  accentColor: t.accentColor,
  iconName: t.iconName,
  startsAt: iso(t.startsAt),
  endsAt: iso(t.endsAt),
  isEnabled: t.isEnabled,
});

export const serializeNotification = (n: Notification) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  audience: n.audience,
  userId: n.userId,
  venueId: n.venueId,
  status: n.status,
  scheduledFor: iso(n.scheduledFor),
  sentAt: iso(n.sentAt),
  recipients: n.recipients,
  delivered: n.delivered,
  error: n.error,
  createdAt: iso(n.createdAt),
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
  imageUrl: portableMediaUrl(v.imageUrl),
  isFeatured: v.isFeatured,
  isPublished: v.isPublished,
  dealEndsAt: iso(v.dealEndsAt),
  eventStartsAt: iso(v.eventStartsAt),
  eventEndsAt: iso(v.eventEndsAt),
  offers: offers.map(serializeOffer),
});

/** `eventStartsAt` comes from the venue (so a rescheduled event moves the app's reminders). */
export const serializeBooking = (b: Booking, eventStartsAt: Date | null = null) => ({
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
  eventStartsAt: iso(eventStartsAt),
});
