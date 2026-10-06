import { describe, expect, it } from 'vitest';
import { createReplay, demoImage, IMAGE_PREFIX, makeShift, requestKey, type Fixture } from './index';

const recordedAt = Date.parse('2026-10-08T05:00:00Z'); // 09:00 Muscat, Thursday
const fx = (): Fixture => ({
  version: 1,
  app: 'tech',
  recordedAt,
  responses: {
    'GET /api/tech/home': { status: 200, body: { at: '2026-10-08T08:00:00.000Z', day: '2026-10-08', month: '2026-10', until: recordedAt + 600_000, amount: 4500, dob: '1990-05-01', photo: `${IMAGE_PREFIX}photo` } },
    'GET /api/tech/jobs?tab=today': { status: 200, body: [{ id: 'b1', status: 'requested' }] },
    'GET /api/tech/jobs/b1': { status: 200, body: { id: 'b1', status: 'requested' } },
    'GET /api/tech/statement?month=2026-10': { status: 200, body: { month: '2026-10' } },
  },
  flows: [
    [
      { on: 'POST /api/tech/jobs/b1/accept', response: { status: 200, body: { ok: true } }, set: { 'GET /api/tech/jobs/b1': { status: 200, body: { id: 'b1', status: 'accepted' } } } },
      {
        on: 'POST /api/tech/jobs/b1/quote',
        response: { status: 200, body: { status: 'sent' } },
        set: { 'GET /api/tech/jobs/b1': { status: 200, body: { id: 'b1', status: 'quote_sent' } } },
        then: { afterMs: 5000, set: { 'GET /api/tech/jobs/b1': { status: 200, body: { id: 'b1', status: 'in_progress' } } } },
      },
    ],
  ],
});

describe('request keys', () => {
  it('ignore empty parameters and parameter order', () => {
    expect(requestKey('get', '/reports?')).toBe('GET /reports');
    expect(requestKey('GET', '/bookings?page=1&status=')).toBe('GET /bookings?page=1');
    expect(requestKey('GET', 'http://x/api/a?b=2&a=1')).toBe('GET /api/a?a=1&b=2');
  });
});

describe('time shift', () => {
  it('counts days in Muscat time', () => {
    expect(makeShift(recordedAt, Date.parse('2026-12-01T10:07:00Z')).days).toBe(54);
    expect(makeShift(recordedAt, Date.parse('2026-10-08T21:30:00Z')).days).toBe(1); // 01:30 the next day in Muscat
  });

  it('keeps live countdowns running and other times at their time of day', async () => {
    const now = recordedAt + 3 * 86_400_000 + 11 * 3_600_000; // Sunday 20:00 Muscat
    const r = createReplay(fx(), { now });
    const b = (await r.request('GET', '/api/tech/home')).body as Record<string, unknown>;
    expect(b.until).toBe(now + 600_000); // 10 minutes left, as when recorded
    expect(b.at).toBe('2026-10-11T08:00:00.000Z'); // 12:00 Muscat, three days later
    expect(b.day).toBe('2026-10-11');
    expect(b.month).toBe('2026-10');
    expect(b.amount).toBe(4500);
    expect(b.dob).toBe('1990-05-01');
    expect(String(b.photo)).toBe(demoImage('photo'));
  });

  it('moves query dates back to the recording before the lookup', async () => {
    const r = createReplay(fx(), { now: recordedAt + 40 * 86_400_000 });
    const res = await r.request('GET', '/api/tech/statement?month=2026-11');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ month: '2026-11' });
  });
});

describe('replay', () => {
  it('falls back to the recorded list when filters differ, and reports real misses', async () => {
    const r = createReplay(fx(), { now: recordedAt });
    expect((await r.request('GET', '/api/tech/jobs?tab=today&q=x')).status).toBe(200);
    expect((await r.request('GET', '/api/tech/jobs?tab=past')).status).toBe(200);
    expect((await r.request('GET', '/api/tech/earnings')).status).toBe(404);
    expect(r.misses).toEqual(['GET /api/tech/earnings']);
  });

  it('steps through the recorded job in order; anything else is read-only', async () => {
    const later: (() => void)[] = [];
    const r = createReplay(fx(), { now: recordedAt, schedule: (fn) => later.push(fn) });
    expect((await r.request('POST', '/api/tech/jobs/b1/quote')).body).toEqual({ error: 'demo_read_only' });
    expect((await r.request('POST', '/api/tech/jobs/b1/accept')).status).toBe(200);
    expect((await r.request('GET', '/api/tech/jobs/b1')).body).toEqual({ id: 'b1', status: 'accepted' });
    expect((await r.request('POST', '/api/tech/jobs/b1/accept')).status).toBe(403);
    await r.request('POST', '/api/tech/jobs/b1/quote');
    expect((await r.request('GET', '/api/tech/jobs/b1')).body).toEqual({ id: 'b1', status: 'quote_sent' });
    later.forEach((fn) => fn());
    expect((await r.request('GET', '/api/tech/jobs/b1')).body).toEqual({ id: 'b1', status: 'in_progress' });
    expect((await r.request('PATCH', '/api/tech/profile')).status).toBe(403);
  });

  it('labels every picture as demo content', () => {
    expect(decodeURIComponent(demoImage('photo'))).toContain('صورة تجريبية');
    expect(decodeURIComponent(demoImage('document'))).toContain('Demo document');
  });
});
