"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");
const money = require("../server/money");
const { validIban } = require("../server/routes/account");

const HOUR = 3600000, DAY = 24 * HOUR;
const IBAN = "SA0380000000608010167519"; // آيبان سعودي صالح (مثال منشور)

test("money: fee, quote, settlements", () => {
  assert.equal(money.feeFor(20000), 1000); // 5% من 200 ريال
  assert.equal(money.feeFor(1000), 100); // الحد الأدنى 1 ريال
  assert.deepEqual(money.quote(15000, 2), { price: 30000, fee: 1500, total: 31500 });
  assert.deepEqual(money.settlement("completed", 20000), { refund: 0, provider: 20000, earningKind: "service" });
  assert.deepEqual(money.settlement("customer_late", 20000), { refund: 18000, provider: 2000, earningKind: "compensation" });
  for (const k of ["customer_early", "provider_declined", "provider_failed", "dispute_refund", "expired"]) {
    assert.deepEqual(money.settlement(k, 20000), { refund: 20000, provider: 0, earningKind: null }, k);
  }
});

test("money: weekly payout boundaries fall on Friday 00:00 Riyadh", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");
  assert.equal(new Date(money.lastPayoutBoundary(now)).toISOString(), "2026-10-01T21:00:00.000Z");
  assert.equal(new Date(money.nextPayoutAt(now)).toISOString(), "2026-10-08T21:00:00.000Z");
});

test("iban validation", () => {
  assert.equal(validIban(IBAN), IBAN);
  assert.equal(validIban("sa03 8000 0000 6080 1016 7519"), IBAN);
  assert.equal(validIban("SA0380000000608010167518"), null);
});

async function setup(t, serviceOverrides = {}) {
  const env = await startApp();
  t.after(env.close);
  const provider = await env.user("الميكانيكي");
  const customer = await env.user("العميل");
  const svc = await provider.post("/api/services", {
    category: "mechanic",
    title: "فحص وإصلاح أعطال السيارات",
    description: "أصل لموقعك",
    skills: "كهرباء سيارات, محركات",
    experience_years: 8,
    experience_note: "ثماني سنوات في ورش الصيانة",
    price: 200,
    unit: "visit",
    ...serviceOverrides,
  });
  assert.equal(svc.status, 200, svc.error);
  async function order() {
    const o = await customer.post("/api/orders", {
      serviceId: svc.service.id,
      description: "السيارة لا تشتغل",
      address: "الرياض، حي النرجس",
      lat: 24.8, lng: 46.6,
    });
    assert.equal(o.status, 200, o.error);
    assert.equal(o.order.status, "pending_payment");
    const paid = await customer.post(`/api/orders/${o.order.id}/pay`);
    assert.equal(paid.status, 200, paid.error);
    assert.equal(paid.order.status, "requested");
    return paid.order.id;
  }
  const act = async (who, id, action, note) => {
    const r = await who.post(`/api/orders/${id}/actions/${action}`, note ? { note } : {});
    assert.equal(r.status, 200, `${action}: ${r.error}`);
    return r.order;
  };
  return { ...env, provider, customer, service: svc.service, order, act };
}

test("experience is the only requirement to offer a service", async (t) => {
  const env = await startApp();
  t.after(env.close);
  const u = await env.user("مبرمج");
  const base = { category: "programming", title: "تطوير مواقع", price: 100, unit: "project", experience_note: "خمس سنوات في تطوير الويب" };
  assert.equal((await u.post("/api/services", { ...base, experience_years: 0 })).status, 400);
  assert.equal((await u.post("/api/services", { ...base, experience_years: 5, experience_note: "" })).status, 400);
  const ok = await u.post("/api/services", { ...base, experience_years: 5, skills: ["JavaScript", "Python"] });
  assert.equal(ok.status, 200);
  assert.equal(ok.service.mode, "remote");
  assert.deepEqual(ok.service.skills, ["JavaScript", "Python"]);
  const found = await env.client().get("/api/services?q=Python");
  assert.equal(found.items.length, 1);
});

test("happy path (on-site): money held, released on confirm, paid out weekly", async (t) => {
  const s = await setup(t);
  const id = await s.order();
  let o = await s.act(s.provider, id, "accept");
  assert.equal(o.status, "accepted");
  assert.ok(o.customer.phone, "phone shared after acceptance");
  // لا يمكن بدء العمل في موقع العميل قبل التحرك إليه
  assert.equal((await s.provider.post(`/api/orders/${id}/actions/start`)).status, 400);
  await s.act(s.provider, id, "depart");
  assert.equal((await s.provider.post(`/api/orders/${id}/location`, { lat: 24.7, lng: 46.7 })).status, 200);
  await s.act(s.provider, id, "start");
  await s.act(s.provider, id, "deliver");
  o = await s.act(s.customer, id, "confirm");
  assert.equal(o.status, "completed");
  assert.equal(o.payment.refunded, 0);
  assert.equal(o.payment.amount, 21000);

  let w = await s.provider.get("/api/wallet");
  assert.equal(w.held, 20000);
  assert.equal(w.paidOut, 0);

  // لا يُصرف قبل نهاية الدورة
  assert.equal(s.app.orders.runPayouts(Date.now()).count, 0);
  w = await s.provider.get("/api/wallet");
  assert.equal(w.held, 20000);

  // نهاية الأسبوع بدون آيبان: تبقى الأرباح محتجزة
  const r1 = s.app.orders.runPayouts(Date.now() + 8 * DAY);
  assert.equal(r1.count, 0);
  assert.deepEqual(r1.skipped, [s.provider.id]);
  assert.equal((await s.provider.put("/api/me", { iban: IBAN })).status, 200);
  const r2 = s.app.orders.runPayouts(Date.now() + 15 * DAY);
  assert.equal(r2.count, 1);
  assert.equal(r2.total, 20000);
  // نفس الدورة لا تُصرف مرتين
  assert.equal(s.app.orders.runPayouts(Date.now() + 15 * DAY), null);
  w = await s.provider.get("/api/wallet");
  assert.equal(w.held, 0);
  assert.equal(w.paidOut, 20000);

  const review = await s.customer.post(`/api/orders/${id}/review`, { rating: 5, comment: "ممتاز" });
  assert.equal(review.status, 200);
  const profile = await s.client().get(`/api/users/${s.provider.id}`);
  assert.equal(profile.user.rating, 5);
  assert.equal(profile.user.completed_count, 1);
});

test("customer cancels before provider moves: full refund, app fee kept", async (t) => {
  const s = await setup(t);
  const id = await s.order();
  await s.act(s.provider, id, "accept");
  const o = await s.act(s.customer, id, "cancel");
  assert.equal(o.status, "cancelled");
  assert.equal(o.cancel_kind, "customer_early");
  assert.equal(o.refund_amount, 20000);
  assert.equal(o.payment.refunded, 20000); // من أصل 21000؛ الـ 1000 رسوم لا تُسترد
  assert.equal(o.payment.status, "refunded");
  assert.equal((await s.provider.get("/api/wallet")).held, 0);
});

test("customer cancels after provider set out: 10% to provider, rest refunded", async (t) => {
  const s = await setup(t);
  const id = await s.order();
  await s.act(s.provider, id, "accept");
  await s.act(s.provider, id, "depart");
  const o = await s.act(s.customer, id, "cancel", "لم أعد بحاجة");
  assert.equal(o.cancel_kind, "customer_late");
  assert.equal(o.compensation_amount, 2000);
  assert.equal(o.refund_amount, 18000);
  const w = await s.provider.get("/api/wallet");
  assert.equal(w.held, 2000);
  assert.equal(w.earnings[0].kind, "compensation");
});

test("provider declines or fails: full refund of service price, fee kept", async (t) => {
  const s = await setup(t);
  const a = await s.order();
  let o = await s.act(s.provider, a, "decline");
  assert.equal(o.cancel_kind, "provider_declined");
  assert.equal(o.refund_amount, 20000);

  const b = await s.order();
  await s.act(s.provider, b, "accept");
  await s.act(s.provider, b, "depart");
  await s.act(s.provider, b, "start");
  o = await s.act(s.provider, b, "fail", "القطعة غير متوفرة");
  assert.equal(o.cancel_kind, "provider_failed");
  assert.equal(o.refund_amount, 20000);
  assert.equal(o.compensation_amount, 0);
  assert.equal((await s.provider.get("/api/wallet")).held, 0);
});

test("repair failed: customer disputes, admin refunds or releases", async (t) => {
  const s = await setup(t);
  const admin = await s.user("المشرف");
  s.app.db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(admin.id);

  const deliver = async () => {
    const id = await s.order();
    for (const a of ["accept", "depart", "start", "deliver"]) await s.act(s.provider, id, a);
    return id;
  };

  const a = await deliver();
  assert.equal((await s.customer.post(`/api/orders/${a}/actions/dispute`, {})).status, 400, "reason required");
  await s.act(s.customer, a, "dispute", "العطل ما زال موجوداً");
  assert.equal((await s.customer.post(`/api/orders/${a}/actions/refund`)).status, 403);
  let o = await s.act(admin, a, "refund");
  assert.equal(o.cancel_kind, "dispute_refund");
  assert.equal(o.refund_amount, 20000);

  const b = await deliver();
  await s.act(s.customer, b, "dispute", "لم يعمل");
  await s.act(s.provider, b, "retry");
  await s.act(s.provider, b, "deliver");
  await s.act(s.customer, b, "dispute", "لا يزال لا يعمل");
  o = await s.act(admin, b, "release");
  assert.equal(o.status, "completed");
  assert.equal((await s.provider.get("/api/wallet")).held, 20000);

  const sum = await admin.get("/api/admin/summary");
  assert.equal(sum.feesRevenue, 2000);
  assert.equal(sum.gmv, 20000);
});

test("permissions and invalid transitions are rejected", async (t) => {
  const s = await setup(t);
  const stranger = await s.user("غريب");
  const id = await s.order();
  assert.equal((await s.customer.post(`/api/orders/${id}/actions/accept`)).status, 403);
  assert.equal((await s.provider.post(`/api/orders/${id}/actions/cancel`)).status, 403);
  assert.equal((await s.provider.post(`/api/orders/${id}/actions/deliver`)).status, 400);
  assert.equal((await stranger.get(`/api/orders/${id}`)).status, 403);
  assert.equal((await stranger.get(`/api/orders/${id}/messages`)).status, 403);
  assert.equal((await s.customer.post(`/api/orders/${id}/pay`)).status, 400, "no double charge");
  const unpaid = await s.customer.post("/api/orders", { serviceId: s.service.id, description: "طلب لم يُدفع", address: "الرياض" });
  assert.equal((await s.provider.get(`/api/orders/${unpaid.order.id}`)).status, 404, "unpaid orders hidden from provider");
  const own = await s.provider.post("/api/orders", { serviceId: s.service.id, description: "طلب خدمتي", address: "x y z" });
  assert.equal(own.status, 400);
  await s.provider.put("/api/me", { available: false });
  const off = await s.customer.post("/api/orders", { serviceId: s.service.id, description: "طلب جديد", address: "الرياض" });
  assert.equal(off.status, 400);
  // الطلب لا يُقيّم قبل اكتماله
  assert.equal((await s.customer.post(`/api/orders/${id}/review`, { rating: 5 })).status, 400);
});

test("timeouts: unaccepted requests expire with refund; delivered work auto-confirms", async (t) => {
  const s = await setup(t);
  const a = await s.order();
  const b = await s.order();
  for (const x of ["accept", "depart", "start", "deliver"]) await s.act(s.provider, b, x);
  const res = s.app.orders.sweep(Date.now() + 49 * HOUR);
  assert.deepEqual(res, { expired: 1, autoConfirmed: 1 });
  const oa = (await s.customer.get(`/api/orders/${a}`)).order;
  assert.equal(oa.cancel_kind, "expired");
  assert.equal(oa.payment.refunded, 20000);
  const ob = (await s.customer.get(`/api/orders/${b}`)).order;
  assert.equal(ob.status, "completed");
});

test("hourly services multiply by quantity; remote cancel after start compensates", async (t) => {
  const env = await startApp();
  t.after(env.close);
  const teacher = await env.user("معلم تداول");
  const student = await env.user("طالب");
  const svc = await teacher.post("/api/services", {
    category: "trading", mode: "remote", title: "دروس تداول للمبتدئين", price: 150, unit: "hour",
    experience_years: 6, experience_note: "متداول منذ ست سنوات",
  });
  const q = await env.client().get(`/api/quote?serviceId=${svc.service.id}&qty=3`);
  assert.deepEqual([q.price, q.fee, q.total], [45000, 2250, 47250]);
  const o = await student.post("/api/orders", { serviceId: svc.service.id, qty: 3, description: "أريد تعلم التحليل الفني" });
  assert.equal(o.order.total, 47250);
  await student.post(`/api/orders/${o.order.id}/pay`);
  assert.equal((await teacher.post(`/api/orders/${o.order.id}/actions/depart`)).status, 400, "no travel for remote");
  await teacher.post(`/api/orders/${o.order.id}/actions/accept`);
  await teacher.post(`/api/orders/${o.order.id}/actions/start`);
  const c = await student.post(`/api/orders/${o.order.id}/actions/cancel`);
  assert.equal(c.order.compensation_amount, 4500);
  assert.equal(c.order.refund_amount, 40500);
});

test("order chat between the two parties", async (t) => {
  const s = await setup(t);
  const id = await s.order();
  assert.equal((await s.customer.post(`/api/orders/${id}/messages`, { body: "متى تصل؟" })).status, 200);
  assert.equal((await s.provider.post(`/api/orders/${id}/messages`, { body: "خلال ٢٠ دقيقة" })).status, 200);
  const m = await s.customer.get(`/api/orders/${id}/messages`);
  assert.deepEqual(m.items.map((x) => x.body), ["متى تصل؟", "خلال ٢٠ دقيقة"]);
  const n = await s.provider.get("/api/notifications");
  assert.ok(n.items.some((x) => x.title.startsWith("طلب جديد")));
});

test("cross-site writes are rejected", async (t) => {
  const env = await startApp();
  t.after(env.close);
  const post = (headers) => fetch(env.base + "/api/auth/logout", { method: "POST", headers, body: "{}" }).then((r) => r.status);
  assert.equal(await post({ "content-type": "text/plain" }), 415);
  assert.equal(await post({ "content-type": "application/json", origin: "https://evil.example" }), 403);
  assert.equal(await post({ "content-type": "application/json", origin: "null" }), 403);
  assert.equal(await post({ "content-type": "application/json", origin: env.base }), 200);
});
