import sharp from 'sharp';
import * as OTPAuth from 'otpauth';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { loadConfig } from '../src/config';
import { createContext } from '../src/context';
import { buildApp } from '../src/app';
import { seedProduction } from '../src/seed';
import { FakeClock } from '../src/lib/clock';
import type { Ctx } from '../src/ctx';
import type { MockSms } from '../src/providers';
import { createAdmin } from '../src/services/auth';
import { runDueJobs } from '../src/services/scheduler';
import { muscatToEpoch, muscatDate, SEED_AREAS } from '@katf/shared';

export const ADMIN_PATH = 'test-admin-path-0123456789abcdef';

export interface Session {
  token: string;
  refreshToken: string;
  deviceId: string;
  userId: string;
  H: Record<string, string>;
}

export interface World {
  ctx: Ctx;
  app: FastifyInstance;
  clock: FakeClock;
  logs: string[];
  sessions: Session[];
}

/** Access tokens live 10 minutes; after moving the fake clock, rotate every test session. */
export async function renew(w: World) {
  for (const s of w.sessions) {
    const r = await w.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { 'x-device-id': s.deviceId }, payload: { refreshToken: s.refreshToken } });
    if (r.statusCode !== 200) continue;
    const b = JSON.parse(r.body);
    s.token = b.accessToken;
    s.refreshToken = b.refreshToken;
    s.H.authorization = `Bearer ${b.accessToken}`;
  }
}

export async function advance(w: World, ms: number) {
  w.clock.advance(ms);
  await renew(w);
}

export async function makeWorld(env: Record<string, string> = {}): Promise<World> {
  // Sunday 4 Oct 2026, 07:00 Muscat
  const clock = new FakeClock(muscatToEpoch('2026-10-04', '07:00'));
  const logs: string[] = [];
  const log = { info: (...a: unknown[]) => logs.push(JSON.stringify(a)), warn: (...a: unknown[]) => logs.push(JSON.stringify(a)), error: (...a: unknown[]) => logs.push(JSON.stringify(a)), debug: () => {} };
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_KEY: randomBytes(32).toString('hex'),
    ADMIN_PATH,
    SMS_PROVIDER: 'mock',
    PUBLIC_ORIGIN: 'http://localhost:3000',
    TECH_ORIGIN: 'http://localhost:5173',
    API_PUBLIC_URL: 'http://localhost:4000',
    DATA_DIR: '/tmp/katf-test-unused',
    RATE_LIMIT_SCALE: '1000',
    ...env,
  } as NodeJS.ProcessEnv);
  const ctx = await createContext({ config, memory: true, clock, log: log as never });
  await seedProduction(ctx);
  const app = await buildApp(ctx);
  await app.ready();
  return { ctx, app, clock, logs, sessions: [] };
}

export const sms = (w: World) => w.ctx.providers.sms as MockSms;

export function json<T = any>(r: LightMyRequestResponse): T {
  return JSON.parse(r.body) as T;
}

export function expectOk(r: LightMyRequestResponse) {
  if (r.statusCode >= 400) throw new Error(`HTTP ${r.statusCode}: ${r.body}`);
  return r;
}

let phoneCounter = 0;
export function nextPhone(prefix = '9'): string {
  phoneCounter++;
  return `${prefix}${String(1000000 + phoneCounter).slice(-7)}`;
}

export async function setSetting(w: World, key: string, value: unknown) {
  await w.ctx.settings.set(w.ctx.db, key, value, { id: null }, 'test');
}

/** OTP sign-in in bearer mode; returns the access token. */
export async function signIn(w: World, phone: string, role: 'customer' | 'technician'): Promise<Session> {
  const deviceId = `dev-${randomBytes(6).toString('hex')}`;
  const req = expectOk(await w.app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: { phone, role } }));
  const { challengeId } = json(req);
  const code = sms(w).lastTo(`+968${phone}`)!.body.match(/\d{6}/)![0];
  const v = expectOk(await w.app.inject({ method: 'POST', url: '/api/auth/otp/verify', headers: { 'x-device-id': deviceId }, payload: { challengeId, phone, code, role, tokenMode: 'bearer' } }));
  w.clock.advance(61_000); // OTP resend spacing
  const body = json(v);
  const session: Session = { token: body.accessToken, refreshToken: body.refreshToken, userId: body.userId, deviceId, H: bearer(body.accessToken) };
  w.sessions.push(session);
  return session;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export async function jpeg(seed = 0): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 120 + seed, g: 130, b: 140 } } }).jpeg().toBuffer();
}

export async function png(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 32, channels: 3, background: '#ffffff' } }).png().toBuffer();
}

export async function upload(w: World, token: string | null, purpose: string, data?: Buffer): Promise<string> {
  const img = data ?? (await jpeg(Math.floor(Math.random() * 50)));
  const boundary = `----katf${randomBytes(8).toString('hex')}`;
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\n${purpose}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    img,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const r = expectOk(
    await w.app.inject({ method: 'POST', url: '/api/uploads', headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'x-requested-with': 'katf', ...(token ? bearer(token) : {}) }, payload }),
  );
  return json(r).id;
}

/** Admin with TOTP; returns cookie jar for the admin path. */
export async function adminSession(w: World, role: 'owner' | 'verifier' | 'support' | 'finance', displayName = `${role} admin`) {
  const email = `${role}-${randomBytes(3).toString('hex')}@example.invalid`;
  const password = 'correct horse battery staple';
  await createAdmin(w.ctx, { email, password, role, displayName });
  const first = json(await w.app.inject({ method: 'POST', url: `/${ADMIN_PATH}/api/auth/sign-in`, payload: { email, password } }));
  const secret = first.enrollment.secret as string;
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: w.clock.now() });
  const r = expectOk(await w.app.inject({ method: 'POST', url: `/${ADMIN_PATH}/api/auth/sign-in`, payload: { email, password, enrollSecret: secret, totp } }));
  const cookies: Record<string, string> = {};
  for (const c of r.cookies) cookies[c.name] = c.value;
  const relogin = async () => {
    const code = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: w.clock.now() });
    const again = await w.app.inject({ method: 'POST', url: `/${ADMIN_PATH}/api/auth/sign-in`, payload: { email, password, totp: code } });
    for (const c of again.cookies) cookies[c.name] = c.value;
  };
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, payload?: unknown) => {
    const go = () => w.app.inject({ method, url: `/${ADMIN_PATH}/api${path}`, cookies, headers: { 'x-requested-with': 'katf' }, payload: payload as never });
    let res = await go();
    if (res.statusCode === 401) {
      await relogin(); // the fake clock moved past the 30-minute idle limit
      res = await go();
    }
    return res;
  };
  return { email, password, secret, cookies, call, recoveryCodes: json(r).recoveryCodes as string[] };
}

/** Full technician registration through the wizard, then approval by a verifier. Returns token and slug. */
export async function registeredTechnician(w: World, verifier: Awaited<ReturnType<typeof adminSession>>, opts: { name?: string; nameEn?: string; iban?: string; civil?: string; approve?: boolean } = {}) {
  const phone = nextPhone('9');
  const allow = (await w.ctx.settings.get<string[]>('registration_allowlist')) ?? [];
  await setSetting(w, 'registration_allowlist', [...allow, `+968${phone}`]);
  const t = await signIn(w, phone, 'technician');
  const H = t.H;
  const name = opts.name ?? 'سالم بن خميس البلوشي';
  const photo = await upload(w, t.token, 'profile_photo');
  const civil = opts.civil ?? String(10000000 + Math.floor(Math.random() * 89999999));
  expectOk(await w.app.inject({ method: 'PUT', url: '/api/tech/application/step/2', headers: H, payload: { fullNameAr: name, fullNameEn: opts.nameEn ?? 'Salim Al Balushi', dob: '1990-05-01', nationality: 'OM', civilId: civil, locale: 'ar', photoFileId: photo } }));
  expectOk(await w.app.inject({ method: 'PUT', url: '/api/tech/application/step/3', headers: H, payload: { workStatus: 'omani_self_employed', declaration: true } }));
  const expiry = muscatDate(w.clock.now() + 400 * 86_400_000);
  for (const type of ['civil_id_front', 'civil_id_back', 'selfie_with_id']) {
    const f = await upload(w, t.token, 'document');
    expectOk(await w.app.inject({ method: 'POST', url: '/api/tech/application/documents', headers: H, payload: { type, fileId: f, expiresAt: type === 'civil_id_front' ? expiry : null } }));
  }
  expectOk(await w.app.inject({ method: 'PUT', url: '/api/tech/application/step/4', headers: H, payload: {} }));
  const work = [await upload(w, t.token, 'work_sample'), await upload(w, t.token, 'work_sample'), await upload(w, t.token, 'work_sample')];
  expectOk(await w.app.inject({ method: 'PUT', url: '/api/tech/application/step/5', headers: H, payload: { services: ['cleaning', 'gas', 'leak'], acTypes: ['split'], brands: ['LG'], experienceBand: '5-10', workPhotoIds: work, bio: 'فني مكيفات بخبرة', ownVehicle: true, tools: ['gauge'], teamSize: 'solo' } }));
  expectOk(await w.app.inject({ method: 'PUT', url: '/api/tech/application/step/6', headers: H, payload: { areas: [{ wilayat: 'seeb', neighbourhoods: [] }, { wilayat: 'bawshar', neighbourhoods: [] }], workingDays: [0, 1, 2, 3, 4], from: '08:00', to: '20:00', maxJobsPerDay: 4 } }));
  expectOk(await w.app.inject({ method: 'PUT', url: '/api/tech/application/step/7', headers: H, payload: { bankName: 'بنك مسقط', iban: opts.iban ?? makeIban(), holderName: name } }));
  expectOk(await w.app.inject({ method: 'PUT', url: '/api/tech/application/step/8', headers: H, payload: { references: [{ name: 'أحمد', phone: '91111111', relation: 'زميل' }], emergency: { name: 'خالد', phone: '92222222' } } }));
  const quiz = json(await w.app.inject({ method: 'GET', url: '/api/tech/quiz', headers: H }));
  const { QUIZ } = await import('../src/services/technicians');
  const answers = Object.fromEntries(QUIZ.map((q) => [q.id, q.correct]));
  if (quiz.length !== 10) throw new Error(`quiz has ${quiz.length} questions, expected 10`);
  const qr = json(expectOk(await w.app.inject({ method: 'POST', url: '/api/tech/quiz', headers: H, payload: { answers } })));
  if (!qr.passed) throw new Error('quiz not passed');
  const docs = json(await w.app.inject({ method: 'GET', url: '/api/legal' })) as { type: string; id: string }[];
  const need = ['technician_agreement', 'code_of_conduct', 'cancellation_refund', 'privacy'];
  const sig = await upload(w, t.token, 'signature', await png());
  expectOk(
    await w.app.inject({
      method: 'POST',
      url: '/api/tech/application/submit',
      headers: H,
      payload: { acceptedDocIds: docs.filter((d) => need.includes(d.type)).map((d) => d.id), truthDeclaration: true, marketing: false, signatureName: name, signatureFileId: sig },
    }),
  );
  if (opts.approve === false) return Object.assign(t, { phone, slug: '' });
  expectOk(await verifier.call('POST', `/applications/${t.userId}/decide`, { decision: 'approve', reason: 'كل المستندات سليمة' }));
  const link = json(expectOk(await w.app.inject({ method: 'GET', url: '/api/tech/link', headers: H })));
  return Object.assign(t, { phone, slug: link.url.split('/t/')[1] as string });
}

let ibanSeq = 1000;
export function makeIban(): string {
  ibanSeq++;
  const bban = `018${String(ibanSeq).padStart(16, '0')}`;
  const rearranged = bban + 'OM00';
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return `OM${String(98 - rem).padStart(2, '0')}${bban}`;
}

/** A customer books the technician through their link and pays the visit fee with the mock provider. */
export async function bookAndPay(w: World, techSlug: string, opts: { pay?: boolean; name?: string; problemText?: string; neighbourhood?: string; slot?: (slots: { start: number; end: number }[]) => { start: number; end: number } } = {}) {
  const phone = nextPhone('7');
  const area = SEED_AREAS.find((a) => a.neighbourhoods.some((n) => n.id === (opts.neighbourhood ?? 'khoud')))!;
  const pin = area.neighbourhoods.find((n) => n.id === (opts.neighbourhood ?? 'khoud'))!;
  const c = await signIn(w, phone, 'customer');
  const H = c.H;
  const slots = json(expectOk(await w.app.inject({ method: 'GET', url: `/api/slots?slug=${techSlug}` })));
  const slot = opts.slot ? opts.slot(slots) : slots[1];
  const docs = json(await w.app.inject({ method: 'GET', url: '/api/legal' })) as { type: string; id: string }[];
  const media = await upload(w, null, 'booking_problem');
  const res = json(
    expectOk(
      await w.app.inject({
        method: 'POST',
        url: '/api/bookings',
        headers: H,
        payload: {
          technicianSlug: techSlug,
          problem: 'not_cooling',
          units: [{ type: 'split', count: 1 }],
          problemText: opts.problemText ?? 'المكيف لا يبرد',
          mediaIds: [media],
          urgency: 'day',
          address: { wilayat: area.wilayat, neighbourhood: pin.id, wayNo: '1234', buildingNo: '56', landmark: 'قرب المسجد', notes: 'الطابق الثاني' },
          lat: pin.lat + 0.0003,
          lng: pin.lng,
          windowStart: slot.start,
          windowEnd: slot.end,
          name: opts.name ?? 'مريم',
          acceptedDocIds: docs.filter((d) => ['customer_terms', 'cancellation_refund'].includes(d.type)).map((d) => d.id),
          returnUrl: 'http://localhost:3000/book/return',
        },
      }),
    ),
  );
  if (opts.pay !== false) await payMock(w, res.checkoutUrl);
  return Object.assign(c, { phone, bookingId: res.id as string, code: res.code as string, checkoutUrl: res.checkoutUrl as string });
}

export async function payMock(w: World, checkoutUrl: string, result: 'paid' | 'cancelled' = 'paid') {
  const u = new URL(checkoutUrl);
  const ref = decodeURIComponent(u.pathname.split('/').pop()!);
  const r = await w.app.inject({
    method: 'POST',
    url: `/api/mock-pay/${encodeURIComponent(ref)}/complete?sig=${u.searchParams.get('sig')}`,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ result, ok: u.searchParams.get('ok')!, cancel: u.searchParams.get('cancel')! }).toString(),
  });
  if (r.statusCode !== 303) throw new Error(`mock pay failed ${r.statusCode} ${r.body}`);
}

export async function runJobs(w: World) {
  let n = 0;
  while ((await runDueJobs(w.ctx)) > 0 && n < 20) n++;
}
