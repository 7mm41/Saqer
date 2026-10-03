/**
 * Time in Asia/Muscat. Storage is always UTC; display and slot maths use Muscat time.
 * Numbers are always Latin digits; weekday names in Arabic; 12-hour time with ص/م.
 */
export const TZ = 'Asia/Muscat';

export type Locale = 'ar' | 'en';

const intlLocale = (l: Locale) => (l === 'ar' ? 'ar-OM-u-nu-latn' : 'en-GB-u-nu-latn');

function parts(ts: number): { y: number; m: number; d: number; hh: number; mm: number; wd: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday ?? 'Sun');
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hh: Number(p.hour), mm: Number(p.minute), wd };
}

/** Muscat offset from UTC in minutes at `ts` (Oman has no DST, but stay honest). */
export function muscatOffsetMinutes(ts: number): number {
  const p = parts(ts);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
  return Math.round((asUtc - Math.floor(ts / 60_000) * 60_000) / 60_000);
}

/** Epoch ms for a Muscat local date (YYYY-MM-DD) and time (HH:MM). */
export function muscatToEpoch(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return guess - muscatOffsetMinutes(guess) * 60_000;
}

export function muscatDate(ts: number): string {
  const p = parts(ts);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

export function muscatWeekday(ts: number): number {
  return parts(ts).wd;
}

export function muscatMinutesOfDay(ts: number): number {
  const p = parts(ts);
  return p.hh * 60 + p.mm;
}

export function formatDay(ts: number, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(ts);
}

export function formatDateShort(ts: number, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(ts);
}

export function formatTime(ts: number, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(ts);
}

export function formatDateTime(ts: number, locale: Locale): string {
  return `${formatDateShort(ts, locale)} · ${formatTime(ts, locale)}`;
}

export function formatWindow(start: number, end: number, locale: Locale): string {
  return `${formatDay(start, locale)} · ${formatTime(start, locale)} – ${formatTime(end, locale)}`;
}

export interface Slot {
  start: number;
  end: number;
}

/**
 * 2-hour arrival windows for the next `days` days, inside working hours,
 * Sunday–Thursday unless weekend slots are enabled. Windows that start
 * within `leadMinutes` from now are skipped.
 */
export function generateSlots(p: {
  now: number;
  days: number;
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
  weekendEnabled: boolean;
  workingDays?: number[];
  leadMinutes?: number;
}): Slot[] {
  const out: Slot[] = [];
  const lead = (p.leadMinutes ?? 60) * 60_000;
  for (let i = 0; i < p.days; i++) {
    const date = muscatDate(p.now + i * 86_400_000);
    const dayTs = muscatToEpoch(date, '12:00');
    const wd = muscatWeekday(dayTs);
    const weekend = wd === 5 || wd === 6;
    if (p.workingDays) {
      if (!p.workingDays.includes(wd)) continue;
    } else if (weekend && !p.weekendEnabled) continue;
    let start = muscatToEpoch(date, p.dayStart);
    const end = muscatToEpoch(date, p.dayEnd);
    while (start + p.slotMinutes * 60_000 <= end) {
      const slot = { start, end: start + p.slotMinutes * 60_000 };
      if (slot.start - p.now >= lead) out.push(slot);
      start = slot.end;
    }
  }
  return out;
}

/** True when `ts` falls inside quiet hours (e.g. 22:00–07:00 crosses midnight). */
export function inQuietHours(ts: number, startHHMM: string, endHHMM: string): boolean {
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number) as [number, number];
    return h * 60 + m;
  };
  const now = muscatMinutesOfDay(ts);
  const a = toMin(startHHMM);
  const b = toMin(endHHMM);
  return a <= b ? now >= a && now < b : now >= a || now < b;
}

/** Next moment after quiet hours end. */
export function quietHoursEnd(ts: number, endHHMM: string): number {
  const date = muscatDate(ts);
  let t = muscatToEpoch(date, endHHMM);
  if (t <= ts) t = muscatToEpoch(muscatDate(ts + 86_400_000), endHHMM);
  return t;
}
