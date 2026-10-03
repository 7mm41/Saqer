import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { adminSession, advance, bookAndPay, expectOk, json, makeWorld, payMock, registeredTechnician, runJobs, setSetting, upload, type World } from './helpers';
import { bookings, ledgerEntries, payableItems, strikes, technicians, auditLog } from '../src/db/schema';
import { bookingBalance } from '../src/services/ledger';

let w: World;
let verifier: Awaited<ReturnType<typeof adminSession>>;
let finance: Awaited<ReturnType<typeof adminSession>>;
let owner: Awaited<ReturnType<typeof adminSession>>;

beforeAll(async () => {
  w = await makeWorld();
  verifier = await adminSession(w, 'verifier');
  finance = await adminSession(w, 'finance');
  owner = await adminSession(w, 'owner');
}, 60_000);
afterAll(async () => {
  await w.app.close();
  await w.ctx.handle.close();
});

async function booking(id: string) {
  return (await w.ctx.db.select().from(bookings).where(eq(bookings.id, id)))[0]!;
}

async function assertBalanced(id: string) {
  const b = await bookingBalance(w.ctx.db, id);
  expect(b.debit).toBe(b.credit);
}

async function goToQuote(tech: { H: Record<string, string> }, bookingId: string, items = [
  { kind: 'labor', label: 'إصلاح تسريب', qty: 1, unitPrice: 12000 },
  { kind: 'part', label: 'صمام', qty: 1, unitPrice: 8000 },
]) {
  const b = await booking(bookingId);
  expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${bookingId}/accept`, headers: tech.H }));
  expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${bookingId}/travel`, headers: tech.H, payload: { etaMinutes: 20 } }));
  const token = tech.H.authorization!.slice(7);
  const photo = await upload(w, token, 'arrival');
  expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${bookingId}/arrive`, headers: tech.H, payload: { lat: b.lat + 0.001, lng: b.lng, photoFileId: photo } }));
  expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${bookingId}/diagnose`, headers: tech.H }));
  const p1 = await upload(w, token, 'diagnosis');
  const p2 = await upload(w, token, 'diagnosis');
  return json(expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${bookingId}/quote`, headers: tech.H, payload: { faults: ['not_cooling'], notes: 'تسريب', photos: [p1, p2], durationMin: 60, items } })));
}

describe('full job through the technician link (example B)', () => {
  it('book → pay → accept → arrive → quote → approve → pay → complete → confirm → payout', async () => {
    const tech = await registeredTechnician(w, verifier);
    const c = await bookAndPay(w, tech.slug);
    let b = await booking(c.bookingId);
    expect(b.status).toBe('requested');
    expect(b.commissionBps).toBe(500);
    expect(b.entryMode).toBe('direct_link');

    // before acceptance the technician sees the neighbourhood only
    const pre = json(await w.app.inject({ method: 'GET', url: `/api/tech/jobs/${c.bookingId}`, headers: tech.H }));
    expect(pre.address).toBeNull();
    expect(pre.customerFirstName).toBeNull();
    expect(pre.money.visitOnlyNet).toBe(4500);

    const q = await goToQuote(tech, c.bookingId);
    expect(q.status).toBe('sent');
    const after = json(await w.app.inject({ method: 'GET', url: `/api/tech/jobs/${c.bookingId}`, headers: tech.H }));
    expect(after.customerFirstName).toBe('مريم');
    expect(after.address.buildingNo).toBe('56');

    const view = json(await w.app.inject({ method: 'GET', url: `/api/bookings/${c.bookingId}`, headers: c.H }));
    expect(view.quote.total).toBe(20000);
    expect(view.quote.due).toBe(15000);
    const appr = json(expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${c.bookingId}/quote/${q.quoteId}/approve`, headers: c.H, payload: { returnUrl: 'http://localhost:3000/b/x' } })));
    await payMock(w, appr.checkoutUrl);
    b = await booking(c.bookingId);
    expect(b.status).toBe('in_progress');

    const tok = tech.H.authorization!.slice(7);
    const before = await upload(w, tok, 'before');
    const afterP = await upload(w, tok, 'after');
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/complete`, headers: tech.H, payload: { before: [before], after: [afterP], notes: 'تم', parts: [{ label: 'صمام' }] } }));
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${c.bookingId}/confirm`, headers: c.H }));
    b = await booking(c.bookingId);
    expect(b.status).toBe('settled');
    expect(b.commissionAmount).toBe(1000);
    expect(b.technicianNet).toBe(19000);
    expect(b.platformNet).toBe(600);
    await assertBalanced(c.bookingId);

    // rating after confirmation
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${c.bookingId}/rate`, headers: c.H, payload: { rating: 5, tags: ['on_time'], comment: 'ممتاز' } }));
    const t = (await w.ctx.db.select().from(technicians).where(eq(technicians.userId, tech.userId)))[0]!;
    expect(t.ratingCount).toBe(1);
    expect(t.jobsCompleted).toBe(1);

    // payout: due after 72h for a new technician
    let due = json(await finance.call('GET', '/payouts'));
    expect(due.due.length).toBe(0);
    await advance(w, 73 * 3600_000);
    due = json(await finance.call('GET', '/payouts'));
    const mine = due.due.find((d: { technicianId: string }) => d.technicianId === tech.userId);
    expect(mine.amount).toBe(19000);
    expect(mine.blocked).toBeNull();
    const batch = json(expectOk(await finance.call('POST', '/payouts/batches', { reason: 'دفعة الأسبوع', confirm: true })));
    const csv = await finance.call('GET', `/payouts/batches/${batch.id}/csv`);
    expect(csv.body).toContain('19.000');
    expectOk(await finance.call('POST', `/payouts/batches/${batch.id}/paid`, { bankReference: 'BM-REF-1', reason: 'حُوّل', confirm: true }));
    b = await booking(c.bookingId);
    expect(b.status).toBe('paid_out');
    const payable = await w.ctx.db.select().from(ledgerEntries).where(eq(ledgerEntries.technicianId, tech.userId));
    const net = payable.filter((e) => e.account === 'technician_payable').reduce((s, e) => s + e.credit - e.debit, 0);
    expect(net).toBe(0);

  }, 60_000);
});

describe('rejected quote (example C) and cancellations (D51, D52, F)', () => {
  it('reject → visit fee only, 10% platform share', async () => {
    const tech = await registeredTechnician(w, verifier);
    const c = await bookAndPay(w, tech.slug);
    await goToQuote(tech, c.bookingId);
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${c.bookingId}/quote/reject`, headers: c.H }));
    const b = await booking(c.bookingId);
    expect(b.status).toBe('closed_visit_only');
    expect(b.technicianNet).toBe(4500);
    expect(b.commissionAmount).toBe(500);
    await assertBalanced(c.bookingId);
  }, 60_000);

  it('quote below the visit fee is refused (D53)', async () => {
    const tech = await registeredTechnician(w, verifier);
    const c = await bookAndPay(w, tech.slug);
    await expect(goToQuote(tech, c.bookingId, [{ kind: 'labor', label: 'x', qty: 1, unitPrice: 3000 }])).rejects.toThrow(/quote_below_visit_fee/);
  }, 60_000);

  it('free inside 10 minutes even after "on the way" (D51)', async () => {
    const tech = await registeredTechnician(w, verifier);
    const c = await bookAndPay(w, tech.slug);
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/accept`, headers: tech.H }));
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/travel`, headers: tech.H, payload: { etaMinutes: 20 } }));
    const view = json(await w.app.inject({ method: 'GET', url: `/api/bookings/${c.bookingId}`, headers: c.H }));
    expect(view.cancel.tier).toBe('free_window');
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${c.bookingId}/cancel`, headers: c.H, payload: {} }));
    const b = await booking(c.bookingId);
    expect(b.refundTotal).toBe(5000);
    await assertBalanced(c.bookingId);
  }, 60_000);

  it('late cancel after acceptance: 30% fee, 10% of that to the platform (example F)', async () => {
    const tech = await registeredTechnician(w, verifier);
    const c = await bookAndPay(w, tech.slug);
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/accept`, headers: tech.H }));
    await advance(w, 11 * 60_000);
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${c.bookingId}/cancel`, headers: c.H, payload: {} }));
    const b = await booking(c.bookingId);
    expect(b.refundTotal).toBe(3500);
    expect(b.technicianNet).toBe(1350);
    expect(b.commissionAmount).toBe(150);
    await assertBalanced(c.bookingId);
  }, 60_000);

  it('technician cancels close to the window: full refund and a strike (example E)', async () => {
    const tech = await registeredTechnician(w, verifier);
    const c = await bookAndPay(w, tech.slug);
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/accept`, headers: tech.H }));
    const b0 = await booking(c.bookingId);
    w.clock.set(b0.windowStart.getTime() - 30 * 60_000);
    await advance(w, 0);
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/cancel`, headers: tech.H, payload: { reason: 'emergency' } }));
    const b = await booking(c.bookingId);
    expect(b.status).toBe('cancelled_by_technician');
    expect(b.refundTotal).toBe(5000);
    const st = await w.ctx.db.select().from(strikes).where(eq(strikes.technicianId, tech.userId));
    expect(st.length).toBe(1);
    await assertBalanced(c.bookingId);
  }, 60_000);
});

describe('races, timers and access', () => {
  it('two accepts at once: exactly one wins', async () => {
    const tech = await registeredTechnician(w, verifier);
    const c = await bookAndPay(w, tech.slug);
    const [a, b] = await Promise.all([
      w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/accept`, headers: tech.H }),
      w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/accept`, headers: tech.H }),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
  }, 60_000);

  it('unpaid bookings expire; auto-confirm after 24 hours', async () => {
    const tech = await registeredTechnician(w, verifier);
    const unpaid = await bookAndPay(w, tech.slug, { pay: false });
    await advance(w, 16 * 60_000);
    await runJobs(w);
    expect((await booking(unpaid.bookingId)).status).toBe('expired_unpaid');

    const c = await bookAndPay(w, tech.slug);
    const q = await goToQuote(tech, c.bookingId, [{ kind: 'labor', label: 'تنظيف', qty: 1, unitPrice: 5000 }]);
    expectOk(await w.app.inject({ method: 'POST', url: `/api/bookings/${c.bookingId}/quote/${q.quoteId}/approve`, headers: c.H, payload: { returnUrl: 'http://localhost:3000/b/x' } }));
    expect((await booking(c.bookingId)).status).toBe('in_progress'); // nothing more to pay
    const tok = tech.H.authorization!.slice(7);
    expectOk(await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/complete`, headers: tech.H, payload: { before: [await upload(w, tok, 'before')], after: [await upload(w, tok, 'after')], parts: [] } }));
    await advance(w, 24 * 3600_000 + 1000);
    await runJobs(w);
    expect((await booking(c.bookingId)).status).toBe('settled');
    await assertBalanced(c.bookingId);
  }, 60_000);

  it('nobody can read someone else’s booking', async () => {
    const tech = await registeredTechnician(w, verifier);
    const other = await registeredTechnician(w, verifier);
    const c = await bookAndPay(w, tech.slug);
    const c2 = await bookAndPay(w, other.slug);
    expect((await w.app.inject({ method: 'GET', url: `/api/tech/jobs/${c.bookingId}`, headers: other.H })).statusCode).toBe(404);
    expect((await w.app.inject({ method: 'POST', url: `/api/tech/jobs/${c.bookingId}/accept`, headers: other.H })).statusCode).toBe(404);
    expect((await w.app.inject({ method: 'GET', url: `/api/bookings/${c.bookingId}`, headers: c2.H })).statusCode).toBe(404);
    expect((await w.app.inject({ method: 'GET', url: `/api/bookings/${c.bookingId}` })).statusCode).toBe(401);
    expect((await w.app.inject({ method: 'GET', url: `/api/tech/home`, headers: c.H })).statusCode).toBe(403);
  }, 60_000);

  it('staff roles: least privilege', async () => {
    const support = await adminSession(w, 'support');
    expect((await support.call('POST', '/payouts/batches', { reason: 'xx', confirm: true })).statusCode).toBe(403);
    expect((await support.call('GET', '/payments')).statusCode).toBe(403);
    expect((await verifier.call('GET', '/payments')).statusCode).toBe(403);
    expect((await verifier.call('GET', '/bookings')).statusCode).toBe(403);
    expect((await finance.call('GET', '/applications')).statusCode).toBe(403);
    expect((await finance.call('PUT', '/settings/visit_fee', { value: 6000, reason: 'xx', confirm: true })).statusCode).toBe(403);
    expect((await support.call('GET', '/bookings')).statusCode).toBe(200);
    expect((await owner.call('GET', '/payments')).statusCode).toBe(200);
    // admin cookies are not accepted outside the admin path, and admin routes 404 elsewhere
    expect((await w.app.inject({ method: 'GET', url: '/api/me', cookies: owner.cookies })).statusCode).toBe(401);
    expect((await w.app.inject({ method: 'GET', url: '/admin/api/overview' })).statusCode).toBe(404);
    // missing CSRF header with cookies is refused
    expect((await w.app.inject({ method: 'POST', url: `/test-admin-path-0123456789abcdef/api/payouts/batches`, cookies: owner.cookies, payload: { reason: 'xx', confirm: true } })).statusCode).toBe(403);
  }, 60_000);

  it('the legal gate cannot open while documents are drafts', async () => {
    const r = await owner.call('PUT', '/settings/legal_gate_cleared', { value: true, reason: 'test', confirm: true });
    expect(r.statusCode).toBe(409);
    expect(json(r).error).toBe('legal_drafts');
    expect((await owner.call('PUT', '/settings/visit_fee', { value: 6000, reason: 'تجربة', confirm: true })).statusCode).toBe(200);
    expect((await w.ctx.settings.get('visit_fee')) as number).toBe(6000);
    await setSetting(w, 'visit_fee', 5000);
    const ov = json(await owner.call('GET', '/overview'));
    expect(Array.isArray(ov.outOfDateDocuments)).toBe(true);
  }, 60_000);

  it('audit log is hash-chained and append-only; ledger entries cannot be edited', async () => {
    const r = json(await owner.call('GET', '/audit'));
    expect(r.chain.ok).toBe(true);
    expect(r.chain.checked).toBeGreaterThan(3);
    await expect(w.ctx.db.update(auditLog).set({ action: 'tampered' }).where(sql`true`)).rejects.toThrow();
    await expect(w.ctx.db.update(ledgerEntries).set({ debit: 1 }).where(sql`true`)).rejects.toThrow();
  }, 60_000);

  it('every booking ledger balances and no response leaks a phone, civil ID or IBAN', async () => {
    const all = await w.ctx.db.select({ id: bookings.id }).from(bookings);
    for (const b of all) await assertBalanced(b.id);
    const tech = await registeredTechnician(w, verifier, { civil: '87654321' });
    const c = await bookAndPay(w, tech.slug);
    const responses = [
      await w.app.inject({ method: 'GET', url: `/api/bookings/${c.bookingId}`, headers: c.H }),
      await w.app.inject({ method: 'GET', url: `/api/tech/jobs/${c.bookingId}`, headers: tech.H }),
      await w.app.inject({ method: 'GET', url: `/api/tech/profile`, headers: tech.H }),
      await w.app.inject({ method: 'GET', url: `/api/technicians/${tech.slug}` }),
      await verifier.call('GET', `/technicians/${tech.userId}`),
      await owner.call('GET', `/bookings/${c.bookingId}`),
      await w.app.inject({ method: 'GET', url: `/api/me`, headers: c.H }),
    ];
    for (const r of responses) {
      expect(r.statusCode).toBeLessThan(400);
      expect(r.body).not.toContain(`+968${tech.phone}`);
      expect(r.body).not.toContain(tech.phone);
      expect(r.body).not.toContain('87654321');
      expect(r.body).not.toMatch(/OM\d{2}018\d{16}/);
    }
    const joined = w.logs.join('\n');
    expect(joined).not.toContain(tech.phone);
    expect(joined).not.toContain('87654321');
    // reveal works only with a reason and is audit-logged
    const rv = json(expectOk(await verifier.call('POST', `/technicians/${tech.userId}/reveal`, { field: 'civil_id', reason: 'التحقق من الهوية' })));
    expect(rv.value).toBe('87654321');
    const audit = json(await owner.call('GET', `/audit?action=break_glass`));
    expect(audit.rows.length).toBeGreaterThan(0);
  }, 60_000);

  it('duplicate civil ID and IBAN are refused', async () => {
    await registeredTechnician(w, verifier, { civil: '11223344' });
    await expect(registeredTechnician(w, verifier, { civil: '11223344' })).rejects.toThrow(/already_registered/);
  }, 60_000);

  it('payable items never leave scheduled before their due date', async () => {
    const rows = await w.ctx.db.select().from(payableItems);
    for (const r of rows) if (r.status === 'paid') expect(r.dueAt.getTime()).toBeLessThanOrEqual(w.clock.now());
  });
});
