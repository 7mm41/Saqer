// Typed client for the Sarena API (/v1). The token lives in localStorage on
// this device only; signing out revokes it on the server.

export type Localized = { en: string; ar: string };
export type Role = 'member' | 'staff' | 'admin';
export const CATEGORIES = ['cinema', 'jetSki', 'shootingClub', 'automobileClub', 'ibriArena', 'videoGames', 'festivals'] as const;
export type Category = (typeof CATEGORIES)[number];

export type User = {
  id: string; fullName: string; email: string; phone: string; memberNumber: string;
  memberSince: string; role: Role; status: 'active' | 'suspended';
};
export type Plan = {
  id: string; name: Localized; description: Localized; priceBaisa: number; durationDays: number; perks: Localized[];
  isActive: boolean; promo: { priceBaisa: number; label: Localized; endsAt: string | null } | null;
  promoPriceBaisa: number | null; promoLabel: Localized | null; promoStartsAt: string | null; promoEndsAt: string | null; sortOrder: number;
};
export type Membership = {
  id: string; plan: Plan; status: 'active' | 'expired' | 'cancelled'; source: string; startsAt: string; expiresAt: string;
  paidBaisa?: number; member?: { id: string; fullName: string; email: string; memberNumber: string };
};
export type Offer = {
  id: string; title: Localized; perks: Localized[]; originalPriceBaisa: number; memberPriceBaisa: number;
  remaining: number | null; isActive: boolean;
};
export type Venue = {
  id: string; slug: string; category: Category; name: Localized; area: Localized; summary: Localized; about: Localized;
  highlights: Localized[]; openingHours: Localized; latitude: number; longitude: number; rating: number; reviewCount: number;
  imageUrl: string | null; isFeatured: boolean; isPublished: boolean; dealEndsAt: string | null;
  eventStartsAt: string | null; eventEndsAt: string | null; offers: Offer[];
};
export type Booking = {
  id: string; code: string; venueName: Localized; offerTitle: Localized; category: Category; quantity: number;
  paidTotalBaisa: number; originalTotalBaisa: number; status: 'active' | 'used' | 'cancelled';
  purchasedAt: string; expiresAt: string; usedAt: string | null;
  member?: { id: string; fullName: string; memberNumber: string };
};
export type Theme = {
  id: string; name: string; logoUrl: string | null; bannerUrl: string | null; greeting: Localized | null;
  accentColor: string | null; iconName: ThemeIcon | null; startsAt: string | null; endsAt: string | null; isEnabled: boolean;
};
export const THEME_ICONS = ['AppIcon-NationalDay', 'AppIcon-Ramadan', 'AppIcon-Eid'] as const;
export type ThemeIcon = (typeof THEME_ICONS)[number];
export type Audience = 'all' | 'members' | 'non_members' | 'user';
export type Notification = {
  id: string; kind: 'broadcast' | 'new_event' | 'event_day' | 'plan_promo' | 'membership_expiring' | 'membership_expired';
  title: Localized; body: Localized; audience: Audience; userId: string | null; venueId: string | null;
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed'; scheduledFor: string; sentAt: string | null;
  recipients: number; createdAt: string;
};
export type NotificationSettings = {
  newEvents: boolean; eventDay: boolean; planPromos: boolean; membershipExpiry: boolean;
  newEventDelayMinutes: number; morningHour: number; reminderHoursBefore: number; finalReminderMinutes: number;
};
export type Stats = {
  members: number; newMembers30d: number; activeMemberships: number; revenueTotalBaisa: number; revenue30dBaisa: number;
  bookings30d: number; redemptions30d: number; memberSavingsBaisa: number; pushDevices: number; notificationsSent30d: number;
  membershipsEndingIn30d: number; pushConfigured: boolean;
  signups: { date: string; count: number }[]; topVenues: { venueName: Localized; bookings: number }[];
};
export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = 'sarena.admin.token';
let token: string | null = null;
try { token = localStorage.getItem(TOKEN_KEY); } catch { /* storage blocked */ }
const listeners = new Set<() => void>();

export const session = {
  get token() { return token; },
  set(value: string | null) {
    token = value;
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value); else localStorage.removeItem(TOKEN_KEY);
    } catch { /* storage blocked */ }
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let response: Response;
  try {
    response = await fetch(`/v1/${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'network', 'network');
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    if (response.status === 401 && token) session.set(null);
    throw new ApiError(response.status, data?.error?.code ?? 'error', data?.error?.message ?? response.statusText);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body);
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, body);
export const del = <T>(path: string) => api<T>('DELETE', path);

export async function upload(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const { url } = await post<{ url: string }>('admin/uploads', form);
  return url;
}

/** 15000 → "15.000" (OMR has 3 decimals). */
export const toOMR = (baisa: number) => (baisa / 1000).toFixed(3);
export const fromOMR = (value: string) => Math.round(Number(value.replace(',', '.')) * 1000);
