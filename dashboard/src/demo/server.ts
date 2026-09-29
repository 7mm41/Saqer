// A pretend Sarena API that runs in the browser, so the control panel can be
// tried with no server: sample members, venues, codes and notifications are
// generated once and saved on this device only (localStorage). It answers the
// same routes as backend/src/routes/admin/*, and simulates live activity
// (new members, bookings, redemptions) so the dashboard's live updates show.

import seedVenues from '../../../backend/src/db/seed-venues.json';
import {
  ApiError, type Audience, type Booking, type Category, type Localized, type Membership, type Notification,
  type NotificationSettings, type Offer, type Plan, type Theme, type User, type Venue,
} from '../api';
import { emitLive, type AdminTopic } from '../live';

// ---------------------------------------------------------------- state

type DemoMembership = {
  id: string; userId: string; planId: string; status: 'active' | 'cancelled';
  source: 'demo' | 'admin' | 'app_store' | 'web'; paidBaisa: number; startsAt: string; expiresAt: string; createdAt: string;
};
type DemoBooking = Booking & { userId: string; venueId: string | null };
type RawPlan = Omit<Plan, 'promo'>;

type State = {
  version: 2;
  users: User[];
  memberships: DemoMembership[];
  plans: RawPlan[];
  venues: Venue[];
  bookings: DemoBooking[];
  themes: Theme[];
  notifications: Notification[];
  settings: NotificationSettings;
  devices: number;
};

const STORAGE_KEY = 'sarena.admin.demo';
const DAY = 86_400_000;
export const DEMO_ADMIN_ID = 'demo-admin';

// Created at the end of this module, once everything it uses is defined.
let state!: State;

function load(): State | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as State) : null;
    return parsed?.version === 2 ? parsed : null;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* full or blocked: keep in memory */ }
  }, 150);
}

/** Starts over with fresh sample data. */
export function resetDemo() {
  state = seed();
  save();
  (['members', 'memberships', 'bookings', 'catalog', 'plans', 'themes', 'notifications'] as AdminTopic[]).forEach(emitLive);
}

// ---------------------------------------------------------------- sample data

function random(seedValue: number) {
  let value = seedValue;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return value / 4_294_967_296;
  };
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const iso = (time: number) => new Date(time).toISOString();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function code(rand: () => number = Math.random) {
  const block = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join('');
  return `SRN-${block()}-${block()}`;
}

const FIRST = [
  ['Ahmed', 'أحمد'], ['Mohammed', 'محمد'], ['Salim', 'سالم'], ['Said', 'سعيد'], ['Khalid', 'خالد'], ['Hamad', 'حمد'],
  ['Sultan', 'سلطان'], ['Faisal', 'فيصل'], ['Yousuf', 'يوسف'], ['Ali', 'علي'], ['Fatma', 'فاطمة'], ['Aisha', 'عائشة'],
  ['Maryam', 'مريم'], ['Shamsa', 'شمسة'], ['Noor', 'نور'], ['Huda', 'هدى'], ['Asma', 'أسماء'], ['Reem', 'ريم'],
];
const LAST = [
  ['Al Balushi', 'البلوشي'], ['Al Hinai', 'الهنائي'], ['Al Harthy', 'الحارثي'], ['Al Rawahi', 'الرواحي'], ['Al Farsi', 'الفارسي'],
  ['Al Busaidi', 'البوسعيدي'], ['Al Maskari', 'المسكري'], ['Al Kindi', 'الكندي'], ['Al Saadi', 'السعدي'], ['Al Amri', 'العامري'],
];

type SeedVenue = {
  slug: string; category: Category; name: Localized; area: Localized; summary: Localized; about: Localized;
  highlights: Localized[]; openingHours: Localized; latitude: number; longitude: number; rating: number; reviewCount: number;
  isFeatured: boolean; dealEndsInHours: number | null; sortOrder: number;
  event?: { startsInDays: number; startHour: number; days: number };
  offers: { title: Localized; perks: Localized[]; originalPriceBaisa: number; memberPriceBaisa: number; remaining: number | null }[];
};

function omanDate(days: number, hour: number) {
  const now = new Date(Date.now() + 4 * 3_600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days, hour - 4));
}

function seed(): State {
  const rand = random(2026);
  const now = Date.now();
  const plan: RawPlan = {
    id: 'plan-annual',
    name: { en: 'Sarena Annual Membership', ar: 'عضوية سرينا السنوية' },
    description: { en: 'One membership, every member price — for a whole year.', ar: 'عضوية واحدة وكل أسعار الأعضاء، لسنة كاملة.' },
    priceBaisa: 15_000, durationDays: 365, isActive: true, sortOrder: 0,
    perks: [
      { en: 'Member prices at every Sarena venue and event', ar: 'أسعار الأعضاء في كل أماكن وفعاليات سرينا' },
      { en: 'Instant booking codes, no printing or queues', ar: 'أكواد حجز فورية بلا طباعة ولا طوابير' },
      { en: 'Early access to festivals and new venues', ar: 'وصول مبكر للمهرجانات والأماكن الجديدة' },
    ],
    promoPriceBaisa: null, promoLabel: null, promoStartsAt: null, promoEndsAt: null,
  };

  const venues: Venue[] = (seedVenues as SeedVenue[]).map((venue) => {
    const eventStartsAt = venue.event ? omanDate(venue.event.startsInDays, venue.event.startHour) : null;
    return {
      id: uid(), slug: venue.slug, category: venue.category, name: venue.name, area: venue.area, summary: venue.summary,
      about: venue.about, highlights: venue.highlights, openingHours: venue.openingHours, latitude: venue.latitude,
      longitude: venue.longitude, rating: venue.rating, reviewCount: venue.reviewCount, imageUrl: null,
      isFeatured: venue.isFeatured, isPublished: true,
      dealEndsAt: venue.dealEndsInHours ? iso(now + venue.dealEndsInHours * 3_600_000) : null,
      eventStartsAt: eventStartsAt ? eventStartsAt.toISOString() : null,
      eventEndsAt: eventStartsAt && venue.event ? iso(eventStartsAt.getTime() + venue.event.days * DAY) : null,
      offers: venue.offers.map((offer) => ({ ...offer, id: uid(), isActive: true })),
    };
  });

  const users: User[] = [{
    id: DEMO_ADMIN_ID, fullName: 'Sarena Admin', email: 'admin@sarena.om', phone: '', memberNumber: 'SRN-100001',
    memberSince: iso(now - 120 * DAY), role: 'admin', status: 'active',
  }];
  const memberships: DemoMembership[] = [];
  const bookings: DemoBooking[] = [];

  for (let index = 0; index < 64; index++) {
    const first = FIRST[Math.floor(rand() * FIRST.length)]!;
    const last = LAST[Math.floor(rand() * LAST.length)]!;
    const joined = now - Math.floor(Math.pow(rand(), 1.6) * 110 * DAY);
    const user: User = {
      id: uid(), fullName: `${first[1]} ${last[1]}`,
      email: `${first[0].toLowerCase()}.${last[0].toLowerCase().replace(/\s/g, '')}${index}@example.com`,
      phone: `9${String(1_000_000 + Math.floor(rand() * 8_999_999))}`, memberNumber: `SRN-${200_000 + index}`,
      memberSince: iso(joined), role: index < 2 ? 'staff' : 'member', status: index === 7 ? 'suspended' : 'active',
    };
    users.push(user);
    const roll = rand();
    if (user.role === 'member' && roll < 0.82) {
      // Most members bought a year; a few expired, some were gifted by an admin.
      const expired = roll > 0.74;
      const starts = expired ? joined - 330 * DAY : joined;
      const source = roll < 0.12 ? 'admin' : roll < 0.55 ? 'app_store' : 'web';
      memberships.push({
        id: uid(), userId: user.id, planId: plan.id, status: 'active', source,
        paidBaisa: source === 'admin' ? 0 : 15_000, startsAt: iso(starts), expiresAt: iso(starts + 365 * DAY), createdAt: iso(starts),
      });
      const count = Math.floor(rand() * 5);
      for (let b = 0; b < count; b++) {
        const venue = venues[Math.floor(rand() * venues.length)]!;
        const offer = venue.offers[Math.floor(rand() * venue.offers.length)]!;
        const quantity = 1 + Math.floor(rand() * 3);
        const purchased = Math.max(joined, now - Math.floor(rand() * 45 * DAY));
        const used = rand() < 0.62 && purchased < now - DAY;
        bookings.push({
          id: uid(), code: code(rand), userId: user.id, venueId: venue.id, venueName: venue.name, offerTitle: offer.title,
          category: venue.category, quantity, paidTotalBaisa: offer.memberPriceBaisa * quantity,
          originalTotalBaisa: offer.originalPriceBaisa * quantity, status: used ? 'used' : 'active',
          purchasedAt: iso(purchased), expiresAt: iso(purchased + 30 * DAY),
          usedAt: used ? iso(purchased + Math.floor(rand() * 5 * DAY) + 3_600_000) : null,
        });
      }
    }
  }

  const muscatNights = venues.find((venue) => venue.slug === 'muscat-nights') ?? venues[0]!;
  const notifications: Notification[] = [
    {
      id: uid(), kind: 'new_event', title: { en: `New event: ${muscatNights.name.en}`, ar: `فعالية جديدة: ${muscatNights.name.ar}` },
      body: muscatNights.summary, audience: 'all', userId: null, venueId: muscatNights.id, status: 'sent',
      scheduledFor: iso(now - 6 * DAY), sentAt: iso(now - 6 * DAY), recipients: 41, createdAt: iso(now - 6 * DAY),
    },
    {
      id: uid(), kind: 'broadcast', title: { en: 'Weekend deal 🎬', ar: 'عرض نهاية الأسبوع 🎬' },
      body: { en: 'Cinema tickets from 2.9 OMR for members this weekend.', ar: 'تذاكر السينما من 2.9 ر.ع. للأعضاء هذا الأسبوع.' },
      audience: 'members', userId: null, venueId: venues[0]!.id, status: 'sent', scheduledFor: iso(now - 3 * DAY),
      sentAt: iso(now - 3 * DAY), recipients: 34, createdAt: iso(now - 3 * DAY),
    },
    {
      id: uid(), kind: 'membership_expiring', title: { en: 'Your membership ends soon', ar: 'عضويتك تنتهي قريباً' },
      body: { en: 'Renew now and keep every member price.', ar: 'جدّد الآن لتحافظ على كل أسعار الأعضاء.' },
      audience: 'user', userId: users[5]!.id, venueId: null, status: 'sent', scheduledFor: iso(now - DAY),
      sentAt: iso(now - DAY), recipients: 1, createdAt: iso(now - DAY),
    },
  ];

  const themes: Theme[] = [
    {
      id: uid(), name: 'National Day 2026', logoUrl: null, bannerUrl: null,
      greeting: { en: 'Happy National Day, Oman 🇴🇲', ar: 'كل عام وعُمان بخير — العيد الوطني 🇴🇲' },
      accentColor: '#C8102E', iconName: 'AppIcon-NationalDay',
      startsAt: new Date(Date.UTC(2026, 10, 17, 20)).toISOString(), endsAt: new Date(Date.UTC(2026, 10, 22, 20)).toISOString(), isEnabled: true,
    },
    {
      id: uid(), name: 'Ramadan 2027', logoUrl: null, bannerUrl: null,
      greeting: { en: 'Ramadan Kareem 🌙', ar: 'رمضان كريم 🌙' }, accentColor: '#2B2470', iconName: 'AppIcon-Ramadan',
      startsAt: new Date(Date.UTC(2027, 1, 7, 20)).toISOString(), endsAt: new Date(Date.UTC(2027, 2, 9, 20)).toISOString(), isEnabled: true,
    },
  ];

  return {
    version: 2, users, memberships, plans: [plan], venues, bookings, themes, notifications,
    settings: {
      newEvents: true, eventDay: true, planPromos: true, membershipExpiry: true,
      newEventDelayMinutes: 10, morningHour: 8, reminderHoursBefore: 5, finalReminderMinutes: 60,
    },
    devices: 46,
  };
}

// ---------------------------------------------------------------- helpers

const nowISO = () => new Date().toISOString();

function membershipStatus(m: DemoMembership, now = Date.now()): Membership['status'] {
  if (m.status === 'cancelled') return 'cancelled';
  return Date.parse(m.expiresAt) > now ? 'active' : 'expired';
}

function activePromo(plan: RawPlan, now = Date.now()) {
  if (plan.promoPriceBaisa === null || plan.promoPriceBaisa >= plan.priceBaisa) return null;
  if (plan.promoStartsAt && Date.parse(plan.promoStartsAt) > now) return null;
  if (plan.promoEndsAt && Date.parse(plan.promoEndsAt) <= now) return null;
  return { priceBaisa: plan.promoPriceBaisa, label: plan.promoLabel ?? { en: 'Limited-time offer', ar: 'عرض لفترة محدودة' }, endsAt: plan.promoEndsAt };
}

const planOut = (plan: RawPlan): Plan => ({ ...plan, promo: activePromo(plan) });

function membershipOut(m: DemoMembership): Membership {
  const plan = state.plans.find((p) => p.id === m.planId) ?? state.plans[0]!;
  return { id: m.id, plan: planOut(plan), status: membershipStatus(m), source: m.source, startsAt: m.startsAt, expiresAt: m.expiresAt };
}

function activeMembership(userId: string) {
  return state.memberships
    .filter((m) => m.userId === userId && membershipStatus(m) === 'active')
    .sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt))[0] ?? null;
}

function grant(userId: string, source: DemoMembership['source'], paidBaisa: number, days?: number) {
  const plan = state.plans[0]!;
  const current = activeMembership(userId);
  const starts = current ? Date.parse(current.expiresAt) : Date.now();
  const membership: DemoMembership = {
    id: uid(), userId, planId: plan.id, status: 'active', source, paidBaisa,
    startsAt: iso(starts), expiresAt: iso(starts + (days ?? plan.durationDays) * DAY), createdAt: nowISO(),
  };
  state.memberships.push(membership);
  return membership;
}

function paginate<T>(items: T[], query: URLSearchParams) {
  const page = Math.max(1, Number(query.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize') ?? 25)));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
}

const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found.`);
const bad = (message: string) => new ApiError(400, 'validation_failed', message);
const byNewest = <T>(key: (item: T) => string) => (a: T, b: T) => Date.parse(key(b)) - Date.parse(key(a));

function devicesFor(audience: Audience) {
  const members = state.users.filter((u) => u.role === 'member' && activeMembership(u.id)).length;
  const all = state.users.filter((u) => u.role === 'member').length;
  const share = state.devices / Math.max(1, all);
  if (audience === 'all') return state.devices;
  if (audience === 'members') return Math.round(members * share);
  if (audience === 'non_members') return Math.max(0, state.devices - Math.round(members * share));
  return 1;
}

function sendDueNotifications() {
  let changed = false;
  for (const notification of state.notifications) {
    if (notification.status === 'scheduled' && Date.parse(notification.scheduledFor) <= Date.now()) {
      notification.status = 'sent';
      notification.sentAt = nowISO();
      notification.recipients = devicesFor(notification.audience);
      changed = true;
    }
  }
  if (changed) { save(); emitLive('notifications'); }
}

/** Shrinks an uploaded photo so it fits in the browser's storage. */
async function imageToDataURL(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------- routes

type Body = Record<string, any>;

export async function demoRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 120)); // feels like a network
  sendDueNotifications();
  const url = new URL(path, 'https://demo.local/');
  const parts = url.pathname.split('/').filter(Boolean);
  const result = await route(method, parts, url.searchParams, (body ?? {}) as Body);
  if (method !== 'GET') save();
  return structuredClone(result) as T;
}

/** Case- and hamza-insensitive matching, like the server's `ilike` (plus Arabic letter variants). */
const fold = (value: string) => value.toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\u064B-\u0652]/g, '');
const searchTerm = (query: URLSearchParams) => fold((query.get('q') ?? '').trim());

async function route(method: string, parts: string[], query: URLSearchParams, body: Body): Promise<unknown> {
  const [a, b, c, d] = parts;
  const admin = state.users.find((user) => user.id === DEMO_ADMIN_ID)!;

  // ---- auth
  if (a === 'auth' && b === 'login') return { token: 'demo', user: admin };
  if (a === 'auth' && b === 'logout') return { ok: true };
  if (a === 'me' && !b) return { user: admin, membership: null };
  if (a !== 'admin') throw notFound('Route');

  // ---- overview
  if (b === 'stats') return stats();

  // ---- members
  if (b === 'members' && !c && method === 'GET') {
    const q = searchTerm(query);
    const status = query.get('status');
    const rows = state.users
      .filter((u) => !q || [u.fullName, u.email, u.phone, u.memberNumber].some((field) => fold(field ?? '').includes(q)))
      .filter((u) => !status || u.status === status)
      .sort(byNewest((u) => u.memberSince))
      .map((u) => ({ ...u, membership: activeMembership(u.id) ? membershipOut(activeMembership(u.id)!) : null }));
    return paginate(rows, query);
  }
  if (b === 'members' && c && !d) {
    const user = state.users.find((u) => u.id === c);
    if (!user) throw notFound('Member');
    if (method === 'PATCH') {
      if (user.id === DEMO_ADMIN_ID && (body.status === 'suspended' || (body.role && body.role !== 'admin'))) {
        throw new ApiError(400, 'cannot_modify_self', 'You cannot suspend or demote your own account.');
      }
      Object.assign(user, pick(body, ['fullName', 'status', 'role']));
      emitLive('members');
      return { member: user };
    }
    return {
      member: user,
      memberships: state.memberships.filter((m) => m.userId === c).sort(byNewest((m) => m.createdAt)).map(membershipOut),
      bookings: state.bookings.filter((bk) => bk.userId === c).sort(byNewest((bk) => bk.purchasedAt)),
    };
  }
  if (b === 'members' && c && d === 'memberships' && method === 'POST') {
    if (!state.users.some((u) => u.id === c)) throw notFound('Member');
    const membership = grant(c, 'admin', Number(body.paidBaisa ?? 0), body.days ? Number(body.days) : undefined);
    emitLive('memberships');
    return { membership: membershipOut(membership) };
  }
  if (b === 'memberships' && c && d === 'cancel') {
    const membership = state.memberships.find((m) => m.id === c);
    if (!membership) throw notFound('Membership');
    membership.status = 'cancelled';
    emitLive('memberships');
    return { membership: membershipOut(membership) };
  }
  if (b === 'memberships' && !c) {
    const status = query.get('status');
    const q = searchTerm(query);
    const rows = state.memberships
      .filter((m) => !status || membershipStatus(m) === status)
      .sort(byNewest((m) => m.createdAt))
      .map((m) => {
        const user = state.users.find((u) => u.id === m.userId);
        return {
          ...membershipOut(m), paidBaisa: m.paidBaisa,
          member: user ? { id: user.id, fullName: user.fullName, email: user.email, memberNumber: user.memberNumber } : undefined,
          search: user ? [user.fullName, user.email, user.phone, user.memberNumber] : [],
        };
      })
      .filter((m) => !q || m.search.some((field) => fold(field ?? '').includes(q)))
      .map(({ search: _search, ...m }) => m);
    return paginate(rows, query);
  }

  // ---- plans
  if (b === 'plans' && !c) return { plans: state.plans.map(planOut) };
  if (b === 'plans' && c && method === 'PATCH') {
    const plan = state.plans.find((p) => p.id === c);
    if (!plan) throw notFound('Plan');
    const next = { ...plan, ...pick(body, ['name', 'description', 'priceBaisa', 'durationDays', 'perks', 'promoPriceBaisa', 'promoLabel', 'promoStartsAt', 'promoEndsAt', 'isActive']) };
    if (next.promoPriceBaisa !== null && next.promoPriceBaisa >= next.priceBaisa) throw bad('promoPriceBaisa: the discounted price must be lower than the price.');
    if (next.promoStartsAt && next.promoEndsAt && Date.parse(next.promoEndsAt) <= Date.parse(next.promoStartsAt)) throw bad('promoEndsAt: the discount must end after it starts.');
    Object.assign(plan, next);
    if (activePromo(plan) && state.settings.planPromos) {
      addNotification('plan_promo', { en: `${activePromo(plan)!.label.en} 🎁`, ar: `${activePromo(plan)!.label.ar} 🎁` },
        { en: 'Sarena membership at a special price — for a limited time.', ar: 'عضوية سرينا بسعر خاص — لفترة محدودة.' }, 'all');
    }
    emitLive('plans');
    return { plan: planOut(plan) };
  }

  // ---- venues & offers
  if (b === 'venues' && !c && method === 'GET') return { venues: [...state.venues] };
  if (b === 'venues' && !c && method === 'POST') {
    if (state.venues.some((v) => v.slug === body.slug)) throw new ApiError(409, 'slug_taken', 'Another venue already uses this link name.');
    const venue: Venue = {
      id: uid(), rating: 0, reviewCount: 0, imageUrl: null, isFeatured: false, isPublished: true, dealEndsAt: null,
      eventStartsAt: null, eventEndsAt: null, highlights: [], ...(body as Partial<Venue>), offers: [],
    } as Venue;
    state.venues.push(venue);
    if (venue.isPublished && state.settings.newEvents) announce(venue);
    emitLive('catalog');
    return { venue };
  }
  if (b === 'venues' && c && !d) {
    const venue = state.venues.find((v) => v.id === c);
    if (!venue) throw notFound('Venue');
    if (method === 'DELETE') {
      state.venues = state.venues.filter((v) => v.id !== c);
      emitLive('catalog');
      return { ok: true };
    }
    if (method === 'PATCH') {
      const wasPublished = venue.isPublished;
      const { offers: _offers, id: _id, ...changes } = body;
      void _offers; void _id;
      Object.assign(venue, changes);
      if (!wasPublished && venue.isPublished && state.settings.newEvents) announce(venue);
      emitLive('catalog');
    }
    return { venue };
  }
  if (b === 'venues' && c && d === 'offers' && method === 'POST') {
    const venue = state.venues.find((v) => v.id === c);
    if (!venue) throw notFound('Venue');
    const offer: Offer = { id: uid(), perks: [], remaining: null, isActive: true, ...(body as Partial<Offer>) } as Offer;
    venue.offers.push(offer);
    emitLive('catalog');
    return { offer };
  }
  if (b === 'offers' && c) {
    const venue = state.venues.find((v) => v.offers.some((o) => o.id === c));
    const offer = venue?.offers.find((o) => o.id === c);
    if (!venue || !offer) throw notFound('Offer');
    if (method === 'DELETE') {
      venue.offers = venue.offers.filter((o) => o.id !== c);
      emitLive('catalog');
      return { ok: true };
    }
    Object.assign(offer, pick(body, ['title', 'perks', 'originalPriceBaisa', 'memberPriceBaisa', 'remaining', 'isActive']));
    emitLive('catalog');
    return { offer };
  }
  if (b === 'uploads' && method === 'POST') {
    const file = body instanceof FormData ? body.get('file') : null;
    if (!(file instanceof File)) throw new ApiError(400, 'no_file', 'Choose an image to upload.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new ApiError(415, 'unsupported_image', 'Upload a JPEG, PNG or WebP image.');
    return { url: await imageToDataURL(file) };
  }

  // ---- themes
  if (b === 'themes' && !c && method === 'GET') {
    const now = Date.now();
    const active = state.themes
      .filter((t) => t.isEnabled && (!t.startsAt || Date.parse(t.startsAt) <= now) && (!t.endsAt || Date.parse(t.endsAt) > now))
      .sort((x, y) => Date.parse(y.startsAt ?? '1970') - Date.parse(x.startsAt ?? '1970'))[0];
    return { themes: [...state.themes], activeThemeId: active?.id ?? null, icons: ['AppIcon-NationalDay', 'AppIcon-Ramadan', 'AppIcon-Eid'] };
  }
  if (b === 'themes' && !c && method === 'POST') {
    const theme: Theme = {
      id: uid(), logoUrl: null, bannerUrl: null, greeting: null, accentColor: null, iconName: null, startsAt: null, endsAt: null,
      isEnabled: true, ...(body as Partial<Theme>),
    } as Theme;
    state.themes.push(theme);
    emitLive('themes');
    return { theme };
  }
  if (b === 'themes' && c) {
    const theme = state.themes.find((t) => t.id === c);
    if (!theme) throw notFound('Theme');
    if (method === 'DELETE') state.themes = state.themes.filter((t) => t.id !== c);
    else Object.assign(theme, body);
    emitLive('themes');
    return method === 'DELETE' ? { ok: true } : { theme };
  }

  // ---- notifications
  if (b === 'notifications' && c === 'audience') return { devices: devicesFor((query.get('audience') ?? 'all') as Audience) };
  if (b === 'notifications' && !c && method === 'GET') {
    const kind = query.get('kind');
    const origin = query.get('origin');
    const status = query.get('status');
    const q = searchTerm(query);
    const rows = state.notifications
      .filter((n) => (!kind || n.kind === kind) && (!status || n.status === status))
      .filter((n) => !origin || (origin === 'written') === (n.kind === 'broadcast'))
      .filter((n) => !q || [n.title.en, n.title.ar, n.body.en, n.body.ar].some((field) => fold(field).includes(q)))
      .sort(byNewest((n) => n.sentAt ?? n.scheduledFor));
    return { ...paginate(rows, query), pushConfigured: true, devices: state.devices };
  }
  if (b === 'notifications' && !c && method === 'POST') {
    const scheduledFor = body.scheduledFor ?? null;
    const notification = addNotification('broadcast', body.title, body.body, body.audience, body.userId ?? null, body.venueId ?? null, scheduledFor);
    return { notification };
  }
  if (b === 'notifications' && c && d === 'cancel') {
    const notification = state.notifications.find((n) => n.id === c && n.status === 'scheduled');
    if (!notification) throw new ApiError(409, 'not_scheduled', 'Only scheduled notifications can be cancelled.');
    notification.status = 'cancelled';
    emitLive('notifications');
    return { notification };
  }
  if (b === 'settings' && c === 'notifications') {
    if (method === 'PATCH') {
      const next = { ...state.settings, ...pick(body, Object.keys(state.settings)) } as NotificationSettings;
      if (next.morningHour < 5 || next.morningHour > 12) throw bad('morningHour: use 5–12.');
      state.settings = next;
    }
    return { settings: state.settings };
  }

  // ---- bookings & redemption
  if (b === 'bookings' && !c) {
    const status = query.get('status');
    const q = searchTerm(query);
    const rows = state.bookings
      .filter((bk) => !status || bk.status === status)
      .sort(byNewest((bk) => bk.usedAt ?? bk.purchasedAt))
      .map((bk) => withMember(bk))
      .filter((bk) => !q || fold(bk.code).includes(q) || fold(bk.member?.fullName ?? '').includes(q));
    return paginate(rows, query);
  }
  if (b === 'bookings' && c === 'redeem') {
    const raw = String(body.code ?? '').trim().toUpperCase();
    const normalized = raw.startsWith('SRN-') ? raw : `SRN-${raw}`;
    const booking = state.bookings.find((bk) => bk.code === normalized);
    if (!booking) throw notFound('Code');
    if (booking.status === 'used') throw new ApiError(409, 'already_used', 'This code was already used.');
    if (booking.status === 'cancelled') throw new ApiError(409, 'cancelled', 'This code was cancelled.');
    if (Date.parse(booking.expiresAt) <= Date.now()) throw new ApiError(410, 'expired', 'This code has expired.');
    booking.status = 'used';
    booking.usedAt = nowISO();
    emitLive('bookings');
    const user = state.users.find((u) => u.id === booking.userId);
    return { booking, member: { fullName: user?.fullName ?? '', memberNumber: user?.memberNumber ?? '' } };
  }

  throw notFound('Route');
}

function pick(body: Body, keys: string[]) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => keys.includes(key)));
}

function withMember(booking: DemoBooking) {
  const user = state.users.find((u) => u.id === booking.userId);
  return { ...booking, member: user ? { id: user.id, fullName: user.fullName, memberNumber: user.memberNumber } : undefined };
}

function addNotification(
  kind: Notification['kind'], title: Localized, body: Localized, audience: Audience,
  userId: string | null = null, venueId: string | null = null, scheduledFor: string | null = null,
) {
  const later = scheduledFor && Date.parse(scheduledFor) > Date.now();
  const notification: Notification = {
    id: uid(), kind, title, body, audience, userId, venueId, status: later ? 'scheduled' : 'sent',
    scheduledFor: scheduledFor ?? nowISO(), sentAt: later ? null : nowISO(),
    recipients: later ? 0 : devicesFor(audience), createdAt: nowISO(),
  };
  state.notifications.push(notification);
  emitLive('notifications');
  return notification;
}

/** New venues are announced automatically (the real server waits a few minutes first). */
function announce(venue: Venue) {
  addNotification(
    'new_event',
    venue.eventStartsAt ? { en: `New event: ${venue.name.en}`, ar: `فعالية جديدة: ${venue.name.ar}` }
      : { en: `New on Sarena: ${venue.name.en}`, ar: `جديد في سرينا: ${venue.name.ar}` },
    venue.summary, 'all', null, venue.id,
    iso(Date.now() + state.settings.newEventDelayMinutes * 60_000),
  );
}

function stats() {
  const now = Date.now();
  const since = now - 30 * DAY;
  const members = state.users.filter((u) => u.role === 'member');
  const signups = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now - (29 - index) * DAY).toISOString().slice(0, 10);
    return { date, count: members.filter((u) => u.memberSince.slice(0, 10) === date).length };
  });
  const recent = state.bookings.filter((bk) => Date.parse(bk.purchasedAt) >= since);
  const byVenue = new Map<string, { venueName: Localized; bookings: number }>();
  for (const booking of recent) {
    const entry = byVenue.get(booking.venueName.en) ?? { venueName: booking.venueName, bookings: 0 };
    entry.bookings += 1;
    byVenue.set(booking.venueName.en, entry);
  }
  const activeUsers = new Set(state.memberships.filter((m) => membershipStatus(m) === 'active').map((m) => m.userId));
  return {
    members: members.length,
    newMembers30d: members.filter((u) => Date.parse(u.memberSince) >= since).length,
    activeMemberships: activeUsers.size,
    revenueTotalBaisa: state.memberships.reduce((sum, m) => sum + m.paidBaisa, 0),
    revenue30dBaisa: state.memberships.filter((m) => Date.parse(m.createdAt) >= since).reduce((sum, m) => sum + m.paidBaisa, 0),
    bookings30d: recent.length,
    redemptions30d: state.bookings.filter((bk) => bk.usedAt && Date.parse(bk.usedAt) >= since).length,
    memberSavingsBaisa: state.bookings.filter((bk) => bk.status !== 'cancelled').reduce((sum, bk) => sum + bk.originalTotalBaisa - bk.paidTotalBaisa, 0),
    pushDevices: state.devices,
    notificationsSent30d: state.notifications.filter((n) => n.status === 'sent' && n.sentAt && Date.parse(n.sentAt) >= since).length,
    membershipsEndingIn30d: state.memberships.filter((m) => membershipStatus(m) === 'active' && Date.parse(m.expiresAt) <= now + 30 * DAY).length,
    pushConfigured: true,
    signups,
    topVenues: [...byVenue.values()].sort((x, y) => y.bookings - x.bookings).slice(0, 5),
  };
}

// ---------------------------------------------------------------- simulated activity

/** Every so often a member joins, books or redeems, so the live updates can be seen. */
export function startDemoActivity() {
  const tick = () => {
    if (document.visibilityState !== 'visible') return;
    const roll = Math.random();
    if (roll < 0.35) {
      const first = FIRST[Math.floor(Math.random() * FIRST.length)]!;
      const last = LAST[Math.floor(Math.random() * LAST.length)]!;
      const user: User = {
        id: uid(), fullName: `${first[1]} ${last[1]}`, email: `${first[0].toLowerCase()}.${Date.now() % 10_000}@example.com`,
        phone: `9${String(1_000_000 + Math.floor(Math.random() * 8_999_999))}`, memberNumber: `SRN-${300_000 + state.users.length}`,
        memberSince: nowISO(), role: 'member', status: 'active',
      };
      state.users.push(user);
      const plan = state.plans[0]!;
      grant(user.id, Math.random() < 0.5 ? 'app_store' : 'web', activePromo(plan)?.priceBaisa ?? plan.priceBaisa);
      state.devices += 1;
      emitLive('members');
      emitLive('memberships');
    } else if (roll < 0.75) {
      const members = state.users.filter((u) => u.role === 'member' && activeMembership(u.id));
      const user = members[Math.floor(Math.random() * members.length)];
      const venue = state.venues[Math.floor(Math.random() * state.venues.length)];
      const offer = venue?.offers[Math.floor(Math.random() * venue.offers.length)];
      if (!user || !venue || !offer) return;
      const quantity = 1 + Math.floor(Math.random() * 2);
      state.bookings.push({
        id: uid(), code: code(), userId: user.id, venueId: venue.id, venueName: venue.name, offerTitle: offer.title,
        category: venue.category, quantity, paidTotalBaisa: offer.memberPriceBaisa * quantity,
        originalTotalBaisa: offer.originalPriceBaisa * quantity, status: 'active', purchasedAt: nowISO(),
        expiresAt: iso(Date.now() + 30 * DAY), usedAt: null,
      });
      emitLive('bookings');
    } else {
      const active = state.bookings.filter((bk) => bk.status === 'active' && Date.parse(bk.expiresAt) > Date.now());
      const booking = active[Math.floor(Math.random() * active.length)];
      if (!booking) return;
      booking.status = 'used';
      booking.usedAt = nowISO();
      emitLive('bookings');
    }
    save();
  };
  const schedule = () => setTimeout(() => { tick(); sendDueNotifications(); schedule(); }, 20_000 + Math.random() * 20_000);
  schedule();
}

/** A few codes to try on the Redeem page. */
export function demoCodes() {
  return state.bookings
    .filter((bk) => bk.status === 'active' && Date.parse(bk.expiresAt) > Date.now())
    .sort(byNewest((bk) => bk.purchasedAt))
    .slice(0, 3)
    .map((bk) => bk.code);
}

// ---------------------------------------------------------------- start

state = load() ?? seed();
save();
