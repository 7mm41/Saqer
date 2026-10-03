import { formatOMR, formatPercent, SEED_AREAS } from '@katf/shared';

const tz = 'Asia/Muscat';
export const dateTime = (v: string | number | Date | null | undefined, locale: 'ar' | 'en') =>
  v == null ? '—' : new Intl.DateTimeFormat(locale === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
export const date = (v: string | number | Date | null | undefined, locale: 'ar' | 'en') =>
  v == null ? '—' : new Intl.DateTimeFormat(locale === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB', { timeZone: tz, dateStyle: 'medium' }).format(new Date(v));
export const omr = (b: number | null | undefined) => (b == null ? '—' : formatOMR(b));
export const pct = (bps: number | null | undefined) => (bps == null ? '—' : `${formatPercent(bps)}%`);
export const hoursFromNow = (v: string | Date | null | undefined, now = Date.now()) => (v == null ? null : Math.round((new Date(v).getTime() - now) / 3_600_000));

/** Wilayat id → display name, from the seeded launch areas. */
export const wilayatName = (id: string, locale: 'ar' | 'en') => {
  const a = SEED_AREAS.find((x) => x.wilayat === id);
  return a ? (locale === 'en' ? a.nameEn : a.nameAr) : id;
};
