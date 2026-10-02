"use strict";
const cfg = require("../config");
const money = require("../money");
const { bad, forbidden, str, int } = require("../http");

module.exports = function register(r, { db, hub, auth, orders }) {
  r.post("/api/orders", ({ req, body }) => {
    const u = auth.requireUser(req);
    const o = orders.create(u, body);
    return { order: orders.view(o, u) };
  });

  r.post("/api/orders/:id/pay", ({ req, params }) => {
    const u = auth.requireUser(req);
    return { order: orders.view(orders.pay(u, Number(params.id)), u) };
  });

  r.post("/api/orders/:id/actions/:action", ({ req, params, body }) => {
    const u = auth.requireUser(req);
    return { order: orders.view(orders.act(u, Number(params.id), params.action, body), u) };
  });

  r.post("/api/orders/:id/location", ({ req, params, body }) => {
    const u = auth.requireUser(req);
    orders.updateLocation(u, Number(params.id), body);
    return { ok: true };
  });

  // ?as=customer|provider &state=active|closed
  r.get("/api/orders", ({ req, query }) => {
    const u = auth.requireUser(req);
    const col = query.as === "provider" ? "provider_id" : "customer_id";
    const states = query.state === "closed" ? ["completed", "cancelled"] : orders.ACTIVE;
    const rows = db
      .prepare(
        `SELECT o.id, o.title, o.status, o.mode, o.price, o.total, o.created_at, o.updated_at, o.cancel_kind,
                c.name AS customer_name, p.name AS provider_name, s.category_id
         FROM orders o JOIN users c ON c.id = o.customer_id JOIN users p ON p.id = o.provider_id
         JOIN services s ON s.id = o.service_id
         WHERE o.${col} = ? AND o.status IN (${states.map(() => "?").join(",")})
         ORDER BY o.updated_at DESC LIMIT 100`
      )
      .all(u.id, ...states);
    const counts = db
      .prepare(
        `SELECT SUM(customer_id = ?1 AND status IN ('requested','accepted','on_the_way','in_progress','delivered','disputed')) AS customer,
                SUM(provider_id = ?1 AND status IN ('requested','accepted','on_the_way','in_progress','delivered','disputed')) AS provider,
                SUM(provider_id = ?1 AND status = 'requested') AS incoming
         FROM orders WHERE customer_id = ?1 OR provider_id = ?1`
      )
      .get(u.id);
    return { items: rows, counts: { customer: counts.customer || 0, provider: counts.provider || 0, incoming: counts.incoming || 0 } };
  });

  r.get("/api/orders/:id", ({ req, params }) => {
    const u = auth.requireUser(req);
    return { order: orders.view(orders.load(Number(params.id)), u) };
  });

  function party(req, id) {
    const u = auth.requireUser(req);
    const o = orders.load(Number(id));
    const role = orders.roleOf(o, u);
    if (!role) throw forbidden();
    return { u, o, role };
  }

  r.get("/api/orders/:id/messages", ({ req, params }) => {
    const { o } = party(req, params.id);
    return {
      items: db.prepare("SELECT id, sender_id, body, created_at FROM messages WHERE order_id = ? ORDER BY id").all(o.id),
    };
  });

  r.post("/api/orders/:id/messages", ({ req, params, body }) => {
    const { u, o, role } = party(req, params.id);
    if (role === "admin" && u.id !== o.customer_id && u.id !== o.provider_id) {
      // المشرف يستطيع الكتابة في محادثة الطلب أثناء النزاع.
      if (o.status !== "disputed") throw forbidden("المحادثة بين طرفي الطلب");
    }
    if (o.status === "pending_payment" || o.status === "abandoned") throw bad("أكمل الدفع أولاً");
    const text = str(body.body, { min: 1, max: 2000, field: "الرسالة" });
    const now = Date.now();
    const rr = db.prepare("INSERT INTO messages (order_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)").run(o.id, u.id, text, now);
    const msg = { id: Number(rr.lastInsertRowid), order_id: o.id, sender_id: u.id, sender_name: u.name, body: text, created_at: now };
    for (const uid of new Set([o.customer_id, o.provider_id])) hub.send(uid, "message", msg);
    return { message: msg };
  });

  r.post("/api/orders/:id/review", ({ req, params, body }) => {
    const { u, o } = party(req, params.id);
    if (o.customer_id !== u.id) throw forbidden("التقييم لصاحب الطلب فقط");
    if (o.status !== "completed") throw bad("يمكن التقييم بعد اكتمال الطلب");
    if (db.prepare("SELECT 1 FROM reviews WHERE order_id = ?").get(o.id)) throw bad("تم تقييم هذا الطلب مسبقاً");
    const rating = int(body.rating, { min: 1, max: 5, field: "التقييم" });
    const comment = str(body.comment, { max: 1000, field: "التعليق" });
    db.prepare(
      "INSERT INTO reviews (order_id, service_id, provider_id, customer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(o.id, o.service_id, o.provider_id, u.id, rating, comment, Date.now());
    hub.notify(o.provider_id, `تقييم جديد ${"★".repeat(rating)}`, comment || o.title, `#/order/${o.id}`);
    return { ok: true };
  });

  // المحفظة: أرباح مقدم الخدمة المحتجزة والمصروفة، ومدفوعات العميل واستردادها.
  r.get("/api/wallet", ({ req }) => {
    const u = auth.requireUser(req);
    const sum = (sql) => db.prepare(sql).get(u.id).n || 0;
    const now = Date.now();
    return {
      held: sum("SELECT SUM(amount) AS n FROM earnings WHERE provider_id = ? AND status = 'held'"),
      paidOut: sum("SELECT SUM(amount) AS n FROM payouts WHERE provider_id = ?"),
      // ما سيُستحق عند إكمال الطلبات الجارية حالياً (لا يزال محتجزاً كضمان للعميل).
      inProgress: sum(
        "SELECT SUM(price) AS n FROM orders WHERE provider_id = ? AND status IN ('requested','accepted','on_the_way','in_progress','delivered','disputed')"
      ),
      nextPayoutAt: money.nextPayoutAt(now),
      payoutIntervalDays: cfg.payoutIntervalDays,
      hasIban: !!u.iban,
      earnings: db
        .prepare(
          `SELECT e.id, e.amount, e.kind, e.status, e.created_at, e.order_id, o.title FROM earnings e
           JOIN orders o ON o.id = e.order_id WHERE e.provider_id = ? ORDER BY e.id DESC LIMIT 50`
        )
        .all(u.id),
      payouts: db
        .prepare("SELECT id, amount, iban, status, created_at FROM payouts WHERE provider_id = ? ORDER BY id DESC LIMIT 30")
        .all(u.id)
        .map((p) => ({ ...p, iban: "•••• " + p.iban.slice(-4) })),
      payments: db
        .prepare(
          `SELECT p.amount, p.refunded, p.status, p.created_at, o.id AS order_id, o.title, o.fee FROM payments p
           JOIN orders o ON o.id = p.order_id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 50`
        )
        .all(u.id),
    };
  });
};
