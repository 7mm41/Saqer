/**
 * Offline demo (D72). Replays responses recorded from the real API (apps/api/scripts/record-demo.ts) so the
 * technician app and the admin panel can be explored with no server and no internet.
 *
 * - Everything served is the labelled demo data that was recorded; nothing is invented here.
 * - Reads return the recorded response, with dates moved so "today" in the recording is today on the device.
 * - Writes are refused (`demo_read_only`) unless they are the next recorded step of the demo job, so what a
 *   viewer types is never kept and never leaves the device.
 */

export interface Recorded {
  status: number;
  body: unknown;
}

/** One recorded action of the demo job and what changed after it. */
export interface Step {
  /** Request key, e.g. "POST /api/tech/jobs/<id>/accept". */
  on: string;
  response: Recorded;
  /** Read responses that changed after this action (request key → response). */
  set: Record<string, Recorded>;
  /** What the other side did a moment later (the customer approves and pays, confirms…). */
  then?: { afterMs: number; set: Record<string, Recorded> };
}

export interface Fixture {
  version: 1;
  app: 'tech' | 'admin';
  /** Epoch ms of the recording's clock when the reads were taken. */
  recordedAt: number;
  responses: Record<string, Recorded>;
  /** Each flow is a list of steps taken in order. */
  flows: Step[][];
}

export interface DemoResult {
  status: number;
  body: unknown;
}

/** Recorded file links are replaced by this prefix + a kind; the replay turns them into labelled pictures. */
export const IMAGE_PREFIX = 'katf-demo-image:';

const DAY = 86_400_000;
const LIVE_FROM = -30 * 60_000;
const LIVE_TO = 90 * 60_000;
const MUSCAT = 4 * 3_600_000; // Oman has no daylight saving
const WINDOW = 2 * 365 * DAY; // only values near the recording are moved (not dates of birth)
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** "GET /api/x?a=1&b=2": method, path, and non-empty query parameters in a stable order. */
export function requestKey(method: string, url: string): string {
  const u = new URL(url, 'http://demo.invalid');
  const params = [...u.searchParams.entries()].filter(([, v]) => v !== '').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const q = new URLSearchParams(params).toString();
  return `${method.toUpperCase()} ${u.pathname}${q ? `?${q}` : ''}`;
}

/**
 * How recorded times move to the viewer's present.
 * - "Live" times, within about an hour of the recording (the new request, its accept deadline, the steps of
 *   the demo job), keep their distance from now, so countdowns run as they did when recorded.
 * - Every other time keeps its time of day and moves by whole days, so a 10:00–12:00 visit stays 10:00–12:00,
 *   "today" in the recording is today, and history stays in the past.
 */
export interface Shift {
  /** Milliseconds added to live times. */
  live: number;
  /** Days added to everything else, in Muscat calendar days. */
  days: number;
}

export function makeShift(recordedAt: number, now: number): Shift {
  const days = Math.floor((now + MUSCAT) / DAY) - Math.floor((recordedAt + MUSCAT) / DAY);
  return { live: now - recordedAt, days };
}

function shiftTime(t: number, recordedAt: number, shift: Shift, dir: 1 | -1): number {
  if (dir === 1) {
    const d = t - recordedAt;
    return d >= LIVE_FROM && d <= LIVE_TO ? t + shift.live : t + shift.days * DAY;
  }
  const back = t - shift.live - recordedAt;
  return back >= LIVE_FROM && back <= LIVE_TO ? t - shift.live : t - shift.days * DAY;
}

const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
};

/** Moves one recorded value by the shift (dir 1), or a request value back to the recording (dir -1). */
export function shiftValue(v: string | number, recordedAt: number, shift: Shift, dir: 1 | -1): string | number {
  if (typeof v === 'number') {
    return Number.isInteger(v) && Math.abs(v - recordedAt) < WINDOW ? shiftTime(v, recordedAt, shift, dir) : v;
  }
  if (ISO.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) || Math.abs(t - recordedAt) >= WINDOW ? v : new Date(shiftTime(t, recordedAt, shift, dir)).toISOString();
  }
  if (DATE.test(v)) {
    const t = Date.parse(`${v}T12:00:00Z`);
    return Number.isNaN(t) || Math.abs(t - recordedAt) >= WINDOW ? v : addDays(v, dir * shift.days);
  }
  if (MONTH.test(v)) {
    const t = Date.parse(`${v}-15T12:00:00Z`);
    return Number.isNaN(t) || Math.abs(t - recordedAt) >= WINDOW ? v : addDays(`${v}-15`, dir * shift.days).slice(0, 7);
  }
  return v;
}

/** A recorded body as the app should see it now: dates moved, demo pictures filled in. */
export function present(body: unknown, recordedAt: number, shift: Shift): unknown {
  if (typeof body === 'string') return body.startsWith(IMAGE_PREFIX) ? demoImage(body.slice(IMAGE_PREFIX.length)) : shiftValue(body, recordedAt, shift, 1);
  if (typeof body === 'number') return shiftValue(body, recordedAt, shift, 1);
  if (Array.isArray(body)) return body.map((x) => present(x, recordedAt, shift));
  if (body && typeof body === 'object') return Object.fromEntries(Object.entries(body).map(([k, x]) => [k, present(x, recordedAt, shift)]));
  return body;
}

/** Query values (dates, months) move back to the recording's calendar before the lookup. */
function toRecordedUrl(url: string, recordedAt: number, shift: Shift): string {
  const u = new URL(url, 'http://demo.invalid');
  for (const [k, v] of [...u.searchParams.entries()]) u.searchParams.set(k, String(shiftValue(v, recordedAt, shift, -1)));
  return `${u.pathname}${u.search}`;
}

export interface Replay {
  readonly shift: Shift;
  /** Read requests that had no recording (the browser test checks this stays empty). */
  readonly misses: string[];
  request(method: string, url: string): Promise<DemoResult>;
}

export function createReplay(fx: Fixture, opts: { now?: number; schedule?: (fn: () => void, ms: number) => void } = {}): Replay {
  if (fx.version !== 1) throw new Error(`unsupported demo fixture version ${String(fx.version)}`);
  const shift = makeShift(fx.recordedAt, opts.now ?? Date.now());
  const schedule = opts.schedule ?? ((fn, ms) => void setTimeout(fn, ms));
  const responses = new Map(Object.entries(fx.responses));
  const at = fx.flows.map(() => 0);
  const misses: string[] = [];
  const apply = (set: Record<string, Recorded>) => {
    for (const [k, v] of Object.entries(set)) responses.set(k, v);
  };
  const lookup = (key: string): Recorded | undefined => {
    const exact = responses.get(key);
    if (exact) return exact;
    // the same list without (or with other) filters, search or page: show the recorded one
    const bare = key.split('?')[0]!;
    const plain = responses.get(bare);
    if (plain) return plain;
    for (const [k, v] of responses) if (k.startsWith(`${bare}?`)) return v;
    return undefined;
  };
  const out = (r: Recorded): DemoResult => ({ status: r.status, body: present(r.body, fx.recordedAt, shift) });

  return {
    shift,
    misses,
    async request(method, url) {
      const key = requestKey(method, toRecordedUrl(url, fx.recordedAt, shift));
      if (key.startsWith('GET ') || key.startsWith('HEAD ')) {
        const hit = lookup(key);
        if (hit) return out(hit);
        misses.push(key);
        return { status: 404, body: { error: 'not_found' } };
      }
      for (let f = 0; f < fx.flows.length; f++) {
        const step = fx.flows[f]![at[f]!];
        if (step && step.on === key) {
          at[f]!++;
          apply(step.set);
          const then = step.then;
          if (then) schedule(() => apply(then.set), then.afterMs);
          return out(step.response);
        }
      }
      return { status: 403, body: { error: 'demo_read_only' } };
    },
  };
}

const IMAGE_LABEL: Record<string, [string, string]> = {
  document: ['مستند تجريبي', 'Demo document'],
  profile: ['تجريبي', 'Demo'],
  signature: ['توقيع تجريبي', 'Demo signature'],
};

/** A picture that says it is demo content, as an inline SVG (no file, no network). */
export function demoImage(kind: string): string {
  const [ar, en] = IMAGE_LABEL[kind] ?? ['صورة تجريبية', 'Demo photo'];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" font-family="system-ui, sans-serif" text-anchor="middle" fill="#fff" font-weight="700">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10303A"/><stop offset="1" stop-color="#1F5563"/></linearGradient></defs>` +
    `<rect width="240" height="240" fill="url(#g)"/>` +
    `<g fill="none" stroke="#E08A4F" stroke-width="8" stroke-linecap="round" transform="translate(70 40)"><path d="M12 76c14-28 32-42 50-42s36 14 50 42"/><path d="M36 42c4-18 14-32 26-32s22 14 26 32"/></g>` +
    `<text x="120" y="170" font-size="30">${ar}</text><text x="120" y="206" font-size="24" fill-opacity="0.85">${en}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
