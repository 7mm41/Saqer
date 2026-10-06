/**
 * Records the offline demo (D72): packages/demo/fixtures/tech.json and admin.json.
 *
 * It starts the real API in memory with DEMO_MODE=true and a fake clock, builds a small world through the
 * same flows the API tests use (registration and approval, bookings, quotes, payments, a payout, a dispute,
 * chat, support), and saves the responses the technician app and the admin panel read. One request is left
 * open and walked through every step (accept → … → confirmed), so the demo can replay the whole job.
 *
 * Every person's name carries "تجريبي" (demo), and every screen shows the demo banner. Before saving: file links become labelled demo pictures, phone
 * numbers become 0000-numbers that cannot be dialled, and link signatures are dropped.
 *
 * Usage: pnpm demo:record   (then rebuild the iPhone bundle with pnpm ios:sync and commit both)
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import { muscatDate, muscatToEpoch } from '@katf/shared';
import type { Fixture, Recorded, Step } from '@katf/demo';
import { IMAGE_PREFIX, requestKey } from '@katf/demo';
import { files, quotes } from '../src/db/schema';
import { ADMIN_PATH, adminSession, advance, bookAndPay, expectOk, json, makeWorld, payMock, registeredTechnician, upload, type Session, type World } from '../test/helpers';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'packages', 'demo', 'fixtures');

const w: World = await makeWorld({ DEMO_MODE: 'true' });
const phones: string[] = ['90000000']; // every phone number used, replaced before saving
/** Moves the fake clock forward to a Muscat date and time. */
const until = (date: string, time: string) => advance(w, Math.max(0, muscatToEpoch(date, time) - w.clock.now()));
const inject = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, headers: Record<string, string> = {}, payload?: unknown) =>
  expectOk(await w.app.inject({ method, url, headers: { 'x-requested-with': 'katf', ...headers }, payload: payload as never }));

// ---------------------------------------------------------------- people
const owner = await adminSession(w, 'owner', 'المالك — تجريبي');
const tech = await registeredTechnician(w, owner, { name: 'سالم تجريبي', nameEn: 'Salim Demo' });
const other = await registeredTechnician(w, owner, { name: 'خالد تجريبي', nameEn: 'Khalid Demo' });
const applicant = await registeredTechnician(w, owner, { name: 'يوسف تجريبي', nameEn: 'Yousuf Demo', approve: false });
phones.push(tech.phone, other.phone, applicant.phone);

type Customer = Session & { bookingId: string; code: string };
const book = async (slug: string, name: string, opts: { day?: 'today' | 'later'; text?: string; neighbourhood?: string } = {}): Promise<Customer> => {
  const today = muscatDate(w.clock.now());
  const c = await bookAndPay(w, slug, {
    name,
    problemText: opts.text ?? 'المكيف لا يبرد (طلب تجريبي)',
    neighbourhood: opts.neighbourhood ?? 'khoud',
    slot: (slots) =>
      (opts.day === 'later' ? slots.find((s) => muscatDate(Number(s.start)) > today) : opts.day === 'today' ? slots.find((s) => muscatDate(Number(s.start)) === today) : slots[1]) ?? slots[1]!,
  });
  phones.push(c.phone);
  return c;
};

const H = (s: Session) => s.H;
const step = async (s: Session, id: string, path: string, payload: unknown = {}) => json(await inject('POST', `/api/tech/jobs/${id}/${path}`, H(s), payload));
const arrive = async (s: Session, id: string) => {
  const b = json(await inject('GET', `/api/tech/jobs/${id}`, H(s)));
  const photo = await upload(w, s.token, 'arrival');
  return step(s, id, 'arrive', { lat: b.location.lat + 0.0005, lng: b.location.lng, photoFileId: photo });
};
const sendQuote = async (s: Session, id: string, items = [
  { kind: 'labor', label: 'تنظيف وإعادة تعبئة الغاز', qty: 1, unitPrice: 12000 },
  { kind: 'part', label: 'صمام', qty: 1, unitPrice: 8000 },
]) => step(s, id, 'quote', { faults: ['not_cooling'], notes: 'نقص غاز وتسريب بسيط عند الصمام', photos: [await upload(w, s.token, 'diagnosis'), await upload(w, s.token, 'diagnosis')], durationMin: 60, items });
const latestQuote = async (bookingId: string) => (await w.ctx.db.select().from(quotes).where(eq(quotes.bookingId, bookingId))).sort((a, b) => b.version - a.version)[0]!;
const approveAndPay = async (c: Customer) => {
  const q = await latestQuote(c.bookingId);
  const appr = json(await inject('POST', `/api/bookings/${c.bookingId}/quote/${q.id}/approve`, H(c), { returnUrl: 'http://localhost:3000/b/x' }));
  await payMock(w, appr.checkoutUrl);
};
const complete = async (s: Session, id: string) =>
  step(s, id, 'complete', { before: [await upload(w, s.token, 'before')], after: [await upload(w, s.token, 'after')], notes: 'تم الإصلاح وتجربة التبريد', parts: [{ label: 'صمام' }] });
const fullJob = async (s: Session, c: Customer, rating?: { rating: number; comment: string }, confirm = true) => {
  await step(s, c.bookingId, 'accept');
  await step(s, c.bookingId, 'travel', { etaMinutes: 20 });
  await arrive(s, c.bookingId);
  await step(s, c.bookingId, 'diagnose');
  await sendQuote(s, c.bookingId);
  await approveAndPay(c);
  await complete(s, c.bookingId);
  if (!confirm) return;
  await inject('POST', `/api/bookings/${c.bookingId}/confirm`, H(c));
  if (rating) await inject('POST', `/api/bookings/${c.bookingId}/rate`, H(c), { ...rating, tags: ['on_time'] });
};

// ---------------------------------------------------------------- history (Sunday to Wednesday)
const b1 = await book(tech.slug, 'مريم — تجريبي');
await fullJob(tech, b1, { rating: 5, comment: 'ممتاز وفي الموعد (تقييم تجريبي)' });
const b2 = await book(tech.slug, 'أحمد — تجريبي', { neighbourhood: 'mabela' });
await step(tech, b2.bookingId, 'accept');
await step(tech, b2.bookingId, 'travel', { etaMinutes: 10 });
await arrive(tech, b2.bookingId);
await step(tech, b2.bookingId, 'diagnose');
await sendQuote(tech, b2.bookingId, [{ kind: 'labor', label: 'تغيير الضاغط', qty: 1, unitPrice: 95000 }]);
await inject('POST', `/api/bookings/${b2.bookingId}/quote/reject`, H(b2));

await until('2026-10-05', '09:00');
const b3 = await book(tech.slug, 'فاطمة — تجريبي', { neighbourhood: 'ghubra' });
await fullJob(tech, b3, { rating: 4, comment: 'عمل جيد، تأخر قليلاً (تقييم تجريبي)' });
const b4 = await book(other.slug, 'سعيد — تجريبي');
await fullJob(other, b4, undefined, false); // the customer reports a problem instead of confirming
await inject('POST', `/api/bookings/${b4.bookingId}/dispute`, H(b4), { reasonCode: 'not_fixed', description: 'ما زال لا يبرد بعد يوم (نزاع تجريبي)', evidence: [] });

await until('2026-10-07', '11:00');
const due = json(await owner.call('GET', '/payouts'));
if (due.due.length) {
  const batch = json(expectOk(await owner.call('POST', '/payouts/batches', { reason: 'دفعة الأسبوع (تجريبية)', confirm: true })));
  expectOk(await owner.call('POST', `/payouts/batches/${batch.id}/paid`, { bankReference: 'DEMO-REF-1', reason: 'حُوّل (تجريبي)', confirm: true }));
}
await inject('POST', '/api/support/tickets', H(tech), { subject: 'موعد التحويل (تذكرة تجريبية)', body: 'متى يصل تحويل هذا الأسبوع؟' });
await inject('POST', '/api/waitlist', {}, { phone: '90000000', wilayat: 'sohar' });

// ---------------------------------------------------------------- today (Thursday)
await until('2026-10-08', '08:30');
const b5 = await book(tech.slug, 'نورة — تجريبي', { day: 'today', neighbourhood: 'mawaleh' });
await step(tech, b5.bookingId, 'accept');
await inject('POST', `/api/bookings/${b5.bookingId}/messages`, H(b5), { body: 'أنا في البيت من الساعة 10 (رسالة تجريبية)' });
await inject('POST', `/api/bookings/${b5.bookingId}/messages`, H(b5), { body: 'أو كلمني على 90000000' }); // flagged: off-platform contact
const b6 = await book(tech.slug, 'هلال — تجريبي', { day: 'later', neighbourhood: 'khuwair' });
await step(tech, b6.bookingId, 'accept');
await advance(w, 30 * 60_000);
const live = await book(tech.slug, 'عائشة — تجريبي', { day: 'today', text: 'المكيف يسرّب ماء ولا يبرد (طلب تجريبي)', neighbourhood: 'khoud' });
await advance(w, 2 * 60_000);

// ---------------------------------------------------------------- record: technician app
const techH = H(tech);
const tGet = async (path: string): Promise<Recorded> => {
  const r = await w.app.inject({ method: 'GET', url: path, headers: { ...techH, 'x-requested-with': 'katf' } });
  if (r.statusCode !== 200) throw new Error(`GET ${path} → ${r.statusCode} ${r.body}`);
  return { status: 200, body: json(r) };
};
const techKeys = async (): Promise<string[]> => {
  const keys = ['/api/tech/home', '/api/tech/jobs?tab=today', '/api/tech/jobs?tab=upcoming', '/api/tech/jobs?tab=past', '/api/notifications', '/api/tech/earnings'];
  const ids = new Set<string>([live.bookingId]);
  for (const tab of ['today', 'upcoming', 'past']) for (const j of json(await w.app.inject({ method: 'GET', url: `/api/tech/jobs?tab=${tab}`, headers: techH })) as { id: string }[]) ids.add(j.id);
  for (const id of ids) keys.push(`/api/tech/jobs/${id}`, `/api/bookings/${id}/messages`);
  return keys;
};
const recordedAt = w.clock.now();
const month = muscatDate(recordedAt).slice(0, 7);
const prevMonth = muscatDate(recordedAt - 31 * 86_400_000).slice(0, 7);
const techResponses: Record<string, Recorded> = {};
const legalTypes = (json(await w.app.inject({ method: 'GET', url: '/api/legal' })) as { type: string }[]).map((d) => d.type);
for (const path of [
  '/api/config',
  '/api/me',
  ...(await techKeys()),
  '/api/tech/profile',
  '/api/tech/link',
  '/api/tech/reviews',
  '/api/tech/catalog',
  `/api/tech/statement?month=${month}`,
  `/api/tech/statement?month=${prevMonth}`,
  '/api/terms/pending',
  '/api/legal',
  '/api/areas',
  ...[...new Set(legalTypes)].flatMap((t) => [`/api/legal/${t}?lang=ar`, `/api/legal/${t}?lang=en`]),
])
  techResponses[requestKey('GET', path)] = await tGet(path);

// the open request, step by step; the customer's side happens a few seconds after the technician's
const current = { ...techResponses };
/** File links are signed with the time; compare without the signature. */
const stable = (v: unknown) => JSON.stringify(v ?? null).replace(/(\/api\/files\/[0-9a-f-]{36})\?[^"]*/g, '$1');
/** Reads that changed since the last step. */
const diff = async () => {
  const out: Record<string, Recorded> = {};
  for (const path of await techKeys()) {
    const k = requestKey('GET', path);
    const r = await tGet(path);
    if (stable(r.body) !== stable(current[k]?.body)) out[k] = r;
    current[k] = r;
  }
  return out;
};
const flow: Step[] = [];
const act = async (path: string, payload: unknown, before?: () => Promise<unknown>) => {
  await advance(w, 60_000);
  if (before) await before();
  const response = { status: 200, body: await step(tech, live.bookingId, path, payload) };
  const s: Step = { on: requestKey('POST', `/api/tech/jobs/${live.bookingId}/${path}`), response, set: await diff() };
  flow.push(s);
  return s;
};
await act('accept', {});
await act('travel', { etaMinutes: 20 });
{
  await advance(w, 60_000);
  const b = json(await inject('GET', `/api/tech/jobs/${live.bookingId}`, techH));
  const photo = await upload(w, tech.token, 'arrival');
  const response = { status: 200, body: await step(tech, live.bookingId, 'arrive', { lat: b.location.lat + 0.0005, lng: b.location.lng, photoFileId: photo }) };
  flow.push({ on: requestKey('POST', `/api/tech/jobs/${live.bookingId}/arrive`), response, set: await diff() });
}
await act('diagnose', {});
{
  await advance(w, 60_000);
  const response = { status: 200, body: await sendQuote(tech, live.bookingId) };
  const s: Step = { on: requestKey('POST', `/api/tech/jobs/${live.bookingId}/quote`), response, set: await diff() };
  await approveAndPay(live);
  s.then = { afterMs: 6000, set: await diff() };
  flow.push(s);
}
{
  await advance(w, 60_000);
  const response = { status: 200, body: await complete(tech, live.bookingId) };
  const s: Step = { on: requestKey('POST', `/api/tech/jobs/${live.bookingId}/complete`), response, set: await diff() };
  await inject('POST', `/api/bookings/${live.bookingId}/confirm`, H(live));
  await inject('POST', `/api/bookings/${live.bookingId}/rate`, H(live), { rating: 5, tags: ['on_time'], comment: 'شكراً، المكيف يبرد الآن (تقييم تجريبي)' });
  s.then = { afterMs: 6000, set: await diff() };
  flow.push(s);
}

// ---------------------------------------------------------------- record: admin panel (as the owner)
const aGet = async (path: string): Promise<Recorded> => {
  const r = await owner.call('GET', path);
  if (r.statusCode !== 200) throw new Error(`admin GET ${path} → ${r.statusCode} ${r.body}`);
  return { status: 200, body: json(r) };
};
const adminResponses: Record<string, Recorded> = {};
const rec = async (path: string) => {
  const r = await aGet(path);
  adminResponses[requestKey('GET', path)] = r;
  return r.body as any;
};
for (const p of ['/me', '/overview', '/applications', '/dispatch', '/disputes', '/support', '/messages/flagged', '/reviews', '/payouts', '/reports', '/catalog', '/areas', '/legal', '/consents', '/templates', '/settings', '/staff', '/security', '/audit?page=1', '/waitlist', '/customers?page=1', '/payments?page=1', '/technicians?wilayat=seeb', '/technicians'])
  await rec(p);
const techList = await rec('/technicians?page=1');
const techIds = new Set<string>([applicant.userId, ...((techList.rows ?? techList) as { id: string }[]).map((t) => t.id)]);
for (const id of techIds) {
  const t = await rec(`/technicians/${id}`);
  for (const d of (t.documents ?? []) as { id: string }[]) await rec(`/documents/${d.id}`);
}
const bookingList = await rec('/bookings?page=1');
await rec('/bookings?needsAdmin=true&page=1');
for (const b of (bookingList.rows ?? bookingList) as { id: string }[]) await rec(`/bookings/${b.id}`);
for (const d of adminResponses[requestKey('GET', '/disputes')]!.body as { id: string }[]) await rec(`/disputes/${d.id}`);

// ---------------------------------------------------------------- clean and save
const fileIds = new Set<string>();
const collect = (v: unknown): void => {
  if (typeof v === 'string') for (const m of v.matchAll(/\/api\/files\/([0-9a-f-]{36})/g)) fileIds.add(m[1]!);
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === 'object') Object.values(v).forEach(collect);
};
collect([techResponses, flow, adminResponses]);
const purposes = new Map<string, string>();
if (fileIds.size) for (const f of await w.ctx.db.select({ id: files.id, purpose: files.purpose }).from(files).where(inArray(files.id, [...fileIds]))) purposes.set(f.id, f.purpose);
const kind = (purpose: string | undefined) =>
  purpose === 'profile_photo' ? 'profile' : purpose === 'signature' ? 'signature' : purpose === 'document' || purpose?.startsWith('civil') ? 'document' : 'photo';

const fakePhone = new Map<string, string>();
for (const p of phones.filter(Boolean)) fakePhone.set(p.replace(/^\+968/, ''), `0000${String(fakePhone.size + 1).padStart(4, '0')}`);
const clean = (v: unknown): unknown => {
  if (typeof v === 'string') {
    const file = /^https?:\/\/[^/]+\/api\/files\/([0-9a-f-]{36})(\?.*)?$/.exec(v);
    if (file) return `${IMAGE_PREFIX}${kind(purposes.get(file[1]!))}`;
    // local development addresses become the placeholder domain the iPhone build also uses
    let s = v
      .replace(/([?&]sig=)[^&#"]+/g, '$1demo')
      .replaceAll(ADMIN_PATH, 'admin-demo')
      .replace(/http:\/\/localhost:(3000|4000|5173)/g, 'https://katf.example');
    for (const [real, fake] of fakePhone) s = s.replaceAll(real, fake);
    return s;
  }
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)]));
  return v;
};

const save = (name: string, fx: Fixture) => {
  const text = `${JSON.stringify(clean(fx), null, 1)}\n`;
  for (const p of fakePhone.keys()) if (text.includes(p)) throw new Error('a phone number survived cleaning');
  if (/\/api\/files\/[0-9a-f-]{36}/.test(text)) throw new Error('a file link survived cleaning');
  writeFileSync(join(OUT, name), text);
  console.log(`${name}: ${Object.keys(fx.responses).length} reads, ${fx.flows.reduce((n, f) => n + f.length, 0)} steps, ${(text.length / 1024).toFixed(0)} KB`);
};
save('tech.json', { version: 1, app: 'tech', recordedAt, responses: techResponses, flows: [flow] });
save('admin.json', { version: 1, app: 'admin', recordedAt, responses: adminResponses, flows: [] });

await w.app.close();
await w.ctx.handle.close();
