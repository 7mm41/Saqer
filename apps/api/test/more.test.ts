import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { adminSession, advance, bookAndPay, expectOk, json, makeIban, makeWorld, nextPhone, payMock, registeredTechnician, sms, upload, type World } from './helpers';
import { bookings, disputes, payments, webhookEvents } from '../src/db/schema';
import { bookingBalance } from '../src/services/ledger';
import { loadConfig } from '../src/config';
import { createContext } from '../src/context';

let w: World;
let verifier: Awaited<ReturnType<typeof adminSession>>;
let finance: Awaited<ReturnType<typeof adminSession>>;

beforeAll(async () => {
  w = await makeWorld();
  verifier = await adminSession(w, 'verifier');
  finance = await adminSession(w, 'finance');
}, 60_000);
afterAll(async () => {
  await w.app.close();
  await w.ctx.handle.close();
});

const booking = async (id: string) => (await w.ctx.db.select().from(bookings).where(eq(bookings.id, id)))[0]!;
const balanced = async (id: string) => {
  const b = await bookingBalance(w.ctx.db, id);
  expect(b.debit).toBe(b.credit);
};

async function completedJob(items = [
  { kind: 'labor', label: 'عمل', qty: 1, unitPrice: 12000 },
  { kind: 'part', label: 'قطعة', qty: 1, unitPrice: 8000 },
]) {
  const tech = await registeredTechnician(w, verifier);
  const c = await bookAndPay(w, tech.slug);
  const b = await booking(c.bookingId);
  const tok = () => tech.H.authorization!.slice(7);
  expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${b.id}/accept`, headers: tech.H }));
  expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${b.id}/travel`, headers: tech.H, payload: { etaMinutes: 30 } }));
  expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${b.id}/arrive`, headers: tech.H, payload: { lat: b.lat, lng: b.lng, photoFileId: await upload(w, tok(), 'arrival') } }));
  expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${b.id}/diagnose`, headers: tech.H }));
  const q = json(
    expectOk(
      await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${b.id}/quote`, headers: tech.H, payload: { faults: ['water_leak'], photos: [await upload(w, tok(), 'diagnosis'), await upload(w, tok(), 'diagnosis')], items } }),
    ),
  );
  const appr = json(expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${b.id}/quote/${q.quoteId}/approve`, headers: c.H, payload: { returnUrl: 'http://localhost:3000/b/x' } })));
  if (appr.checkoutUrl) await payMock(w, appr.checkoutUrl);
  expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${b.id}/complete`, headers: tech.H, payload: { before: [await upload(w, tok(), 'before')], after: [await upload(w, tok(), 'after')], parts: [{ label: 'قطعة' }] } }));
  return { tech, c, id: b.id };
}

describe('disputes (§9.2 #7)', () => {
  it('a report freezes the job; a split decision refunds the customer and pays the technician the rest', async () => {
    const { c, id } = await completedJob();
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${id}/dispute`, headers: c.H, payload: { reasonCode: 'not_fixed', description: 'ما زال لا يبرد', evidence: [] } }));
    expect((await booking(id)).status).toBe('disputed');
    const d = (await w.ctx.db.select().from(disputes).where(eq(disputes.bookingId, id)))[0]!;
    const detail = json(expectOk(await finance.call('GET', `/disputes/${d.id}`)));
    expect(detail.preview.captured).toBe(20000);
    expectOk(await finance.call('POST', `/disputes/${d.id}/decide`, { decision: 'split', amounts: { refund: 6000, technician: 12000, platform: 2000 }, note: 'إصلاح جزئي', confirm: true }));
    const b = await booking(id);
    expect(b.status).toBe('refunded_partial');
    expect(b.refundTotal).toBe(6000);
    expect(b.technicianNet).toBe(12000);
    await balanced(id);
    // amounts that do not add up are refused
    const other = await completedJob();
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${other.id}/dispute`, headers: other.c.H, payload: { reasonCode: 'price', evidence: [] } }));
    const d2 = (await w.ctx.db.select().from(disputes).where(eq(disputes.bookingId, other.id)))[0]!;
    const bad = await finance.call('POST', `/disputes/${d2.id}/decide`, { decision: 'split', amounts: { refund: 1, technician: 1, platform: 1 }, note: 'خطأ', confirm: true });
    expect(bad.statusCode).toBe(409);
  }, 90_000);
});

describe('warranty revisit and failed repair (example D)', () => {
  it('free revisit, then failure: labour refunded, evidenced parts and the visit fee kept by the technician', async () => {
    const { tech, c, id } = await completedJob();
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${id}/confirm`, headers: c.H }));
    const settled = await booking(id);
    expect(settled.technicianNet).toBe(19000); // own link: 5%
    // the admin accepts the receipt for the part line (D54)
    expectOk(await finance.call('POST', `/bookings/${id}/evidence`, { lineIndex: 1, evidenced: true, reason: 'إيصال سليم' }));
    // the fault returns: a free revisit inside the warranty
    const view = json(await w.app.inject({ method: 'GET', url: `/api/bookings/${id}`, headers: c.H }));
    expect(view.can.revisit).toBe(true);
    const slots = json(await w.app.inject({ method: 'GET', url: `/api/slots?slug=${tech.slug}` }));
    const rv = json(expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${id}/revisit`, headers: c.H, payload: { windowStart: slots[2].start, windowEnd: slots[2].end, note: 'عاد العطل' } })));
    const child = await booking(rv.id);
    expect(child.visitFee).toBe(0);
    expect(child.status).toBe('requested');
    const tok = () => tech.H.authorization!.slice(7);
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${child.id}/accept`, headers: tech.H }));
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${child.id}/travel`, headers: tech.H, payload: { etaMinutes: 20 } }));
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${child.id}/arrive`, headers: tech.H, payload: { lat: child.lat, lng: child.lng, photoFileId: await upload(w, tok(), 'arrival') } }));
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${child.id}/diagnose`, headers: tech.H }));
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${child.id}/revisit-failed`, headers: tech.H, payload: { note: 'الكمبروسر تالف ولا يمكن إصلاحه' } }));
    const parent = await booking(id);
    expect(parent.status).toBe('repair_failed_closed');
    expect(parent.refundTotal).toBe(15000 - 8000);
    expect(parent.technicianNet).toBe(5000 + 8000);
    expect(parent.commissionAmount).toBe(0);
    await balanced(id);
    expect((await booking(child.id)).status).toBe('repair_failed_closed');
    // a second free revisit is not offered
    const again = json(await w.app.inject({ method: 'GET', url: `/api/bookings/${id}`, headers: c.H }));
    expect(again.can.revisit).toBe(false);
  }, 90_000);
});

describe('security', () => {
  it('OTP: five wrong codes lock the number', async () => {
    const phone = nextPhone('7');
    const ch = json(expectOk(await w.app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: { phone, role: 'customer' } })));
    let last = 0;
    for (let i = 0; i < 5; i++) {
      const r = await w.app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { challengeId: ch.challengeId, phone, code: '000000', role: 'customer', tokenMode: 'bearer' } });
      last = r.statusCode;
    }
    expect(last).toBe(429);
    const code = sms(w).lastTo(`+968${phone}`)!.body.match(/\d{6}/)![0];
    const r = await w.app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { challengeId: ch.challengeId, phone, code, role: 'customer', tokenMode: 'bearer' } });
    expect(r.statusCode).toBe(429);
  });

  it('refresh tokens rotate; reusing an old one revokes the whole session family', async () => {
    const phone = nextPhone('7');
    const ch = json(await w.app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: { phone, role: 'customer' } }));
    const code = sms(w).lastTo(`+968${phone}`)!.body.match(/\d{6}/)![0];
    const s = json(await w.app.inject({ method: 'POST', url: '/api/auth/otp/verify', headers: { 'x-device-id': 'device-aaaaaaaa' }, payload: { challengeId: ch.challengeId, phone, code, role: 'customer', tokenMode: 'bearer' } }));
    const r1 = json(expectOk(await w.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { 'x-device-id': 'device-aaaaaaaa' }, payload: { refreshToken: s.refreshToken } })));
    const reuse = await w.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { 'x-device-id': 'device-aaaaaaaa' }, payload: { refreshToken: s.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    const after = await w.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { 'x-device-id': 'device-aaaaaaaa' }, payload: { refreshToken: r1.refreshToken } });
    expect(after.statusCode).toBe(401);
    // a refresh token from another device is refused
    w.clock.advance(61_000);
    const ch2 = json(await w.app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: { phone, role: 'customer' } }));
    const code2 = sms(w).lastTo(`+968${phone}`)!.body.match(/\d{6}/)![0];
    const s2 = json(await w.app.inject({ method: 'POST', url: '/api/auth/otp/verify', headers: { 'x-device-id': 'device-bbbbbbbb' }, payload: { challengeId: ch2.challengeId, phone, code: code2, role: 'customer', tokenMode: 'bearer' } }));
    expect((await w.app.inject({ method: 'POST', url: '/api/auth/refresh', headers: { 'x-device-id': 'device-cccccccc' }, payload: { refreshToken: s2.refreshToken } })).statusCode).toBe(401);
  });

  it('changing bank details needs a bank-change OTP; a sign-in code is refused and the OTP cannot sign in', async () => {
    const t = await registeredTechnician(w, verifier);
    const body = { bankName: 'بنك ظفار', iban: makeIban(), holderName: 'سالم بن خميس البلوشي' };
    // a code sent for sign-in cannot change bank details
    const login = json(expectOk(await w.app.inject({ method: 'POST', url: '/api/auth/otp/request', payload: { phone: t.phone, role: 'technician' } })));
    const loginCode = sms(w).lastTo(`+968${t.phone}`)!.body.match(/\d{6}/)![0];
    expect((await w.app.inject({ method: 'POST', url: '/api/tech/bank', headers: t.H, payload: { ...body, challengeId: login.challengeId, code: loginCode } })).statusCode).toBe(400);
    w.clock.advance(61_000);
    const ch = json(expectOk(await w.app.inject({ method: 'POST', url: '/api/tech/bank/otp', headers: t.H })));
    const code = sms(w).lastTo(`+968${t.phone}`)!.body.match(/\d{6}/)![0];
    // the bank-change code cannot be used to sign in
    expect((await w.app.inject({ method: 'POST', url: '/api/auth/otp/verify', payload: { challengeId: ch.challengeId, phone: t.phone, code, role: 'technician', tokenMode: 'bearer' } })).statusCode).toBe(400);
    // a wrong code counts as a failed attempt
    expect((await w.app.inject({ method: 'POST', url: '/api/tech/bank', headers: t.H, payload: { ...body, challengeId: ch.challengeId, code: code === '000000' ? '111111' : '000000' } })).statusCode).toBe(400);
    expectOk(await w.app.inject({ method: 'POST', url: '/api/tech/bank', headers: t.H, payload: { ...body, challengeId: ch.challengeId, code } }));
    // single use
    expect((await w.app.inject({ method: 'POST', url: '/api/tech/bank', headers: t.H, payload: { ...body, challengeId: ch.challengeId, code } })).statusCode).toBe(400);
    w.clock.advance(61_000);
  }, 60_000);

  it('payment return links must be exactly our own origin (no look-alike hosts)', async () => {
    const t = await registeredTechnician(w, verifier);
    const b = await bookAndPay(w, t.slug, { pay: false });
    for (const bad of ['http://localhost:3000.evil.example/x', 'https://evil.example/?u=http://localhost:3000', 'javascript:alert(1)']) {
      const r = await w.app.inject({ method: 'POST', url: `/api/bookings/${b.bookingId}/pay`, headers: b.H, payload: { returnUrl: bad } });
      expect(r.statusCode, bad).toBe(400); // look-alikes: bad_return_url; non-URLs fail validation earlier
    }
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${b.bookingId}/pay`, headers: b.H, payload: { returnUrl: 'http://localhost:3000/book/return' } }));
  }, 60_000);

  it('admin: wrong TOTP fails, five failures lock the account', async () => {
    const a = await adminSession(w, 'support');
    let code = 0;
    for (let i = 0; i < 5; i++) code = (await w.app.inject({ method: 'POST', url: '/test-admin-path-0123456789abcdef/api/auth/sign-in', payload: { email: a.email, password: a.password, totp: '000000' } })).statusCode;
    expect(code).toBe(401);
    const locked = await w.app.inject({ method: 'POST', url: '/test-admin-path-0123456789abcdef/api/auth/sign-in', payload: { email: a.email, password: a.password, totp: '000000' } });
    expect(locked.statusCode).toBe(429);
    // unknown emails get the same answer as a wrong password
    const unknown = await w.app.inject({ method: 'POST', url: '/test-admin-path-0123456789abcdef/api/auth/sign-in', payload: { email: 'nobody@example.invalid', password: 'x' } });
    expect(unknown.statusCode).toBe(401);
    expect(json(unknown).error).toBe('invalid_credentials');
  });

  it('webhooks: unsigned events are refused and each event is processed once', async () => {
    const r = await w.app.inject({ method: 'POST', url: '/api/webhooks/payments', payload: { data: { session_id: 'x' } } });
    expect(r.statusCode).toBe(401);
    // a provider that accepts every signature, to exercise idempotency
    const real = w.ctx.providers.payments;
    w.ctx.providers.payments = Object.assign(Object.create(Object.getPrototypeOf(real)), real, { verifyWebhook: () => ({ eventId: 'evt-1', providerRef: 'nope' }) });
    const a = json(await w.app.inject({ method: 'POST', url: '/api/webhooks/payments', payload: {} }));
    const b = json(await w.app.inject({ method: 'POST', url: '/api/webhooks/payments', payload: {} }));
    w.ctx.providers.payments = real;
    expect(a.duplicate).toBeUndefined();
    expect(b.duplicate).toBe(true);
    expect((await w.ctx.db.select().from(webhookEvents)).length).toBe(1);
  });

  it('paying twice does not capture twice', async () => {
    const tech = await registeredTechnician(w, verifier);
    const c = await bookAndPay(w, tech.slug, { pay: false });
    await payMock(w, c.checkoutUrl);
    await payMock(w, c.checkoutUrl);
    const p = await w.ctx.db.select().from(payments).where(eq(payments.bookingId, c.bookingId));
    expect(p.filter((x) => x.status === 'paid').length).toBe(1);
    const bal = await bookingBalance(w.ctx.db, c.bookingId);
    expect(bal.debit).toBe(5000 + 100); // capture + gateway estimate, once
  }, 60_000);

  it('refuses to start when DATA_KEY changed', async () => {
    const dir = `/tmp/katf-keytest-${randomBytes(4).toString('hex')}`;
    const base = { NODE_ENV: 'test', DATA_DIR: dir, ADMIN_PATH: 'x'.repeat(24) } as NodeJS.ProcessEnv;
    const one = await createContext({ config: loadConfig({ ...base, DATA_KEY: randomBytes(32).toString('hex') }) });
    await one.handle.close();
    await expect(createContext({ config: loadConfig({ ...base, DATA_KEY: randomBytes(32).toString('hex') }) })).rejects.toThrow(/DATA_KEY/);
  }, 60_000);
});

void advance;
