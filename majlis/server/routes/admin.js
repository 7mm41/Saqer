"use strict";
const money = require("../money");

module.exports = function register(r, { db, auth, orders }) {
  r.get("/api/admin/summary", ({ req }) => {
    auth.requireAdmin(req);
    const one = (sql) => db.prepare(sql).get().n || 0;
    const byStatus = {};
    for (const row of db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all()) byStatus[row.status] = row.n;
    return {
      users: one("SELECT COUNT(*) AS n FROM users"),
      providers: one("SELECT COUNT(DISTINCT user_id) AS n FROM services WHERE active = 1"),
      services: one("SELECT COUNT(*) AS n FROM services WHERE active = 1"),
      byStatus,
      // قيمة الخدمات المكتملة
      gmv: one("SELECT SUM(price) AS n FROM orders WHERE status = 'completed'"),
      // رسوم التطبيق المحصّلة (غير قابلة للاسترداد)
      feesRevenue: one("SELECT SUM(o.fee) AS n FROM orders o JOIN payments p ON p.order_id = o.id"),
      // مبالغ محتجزة في طلبات مفتوحة
      escrowOpen: one(
        "SELECT SUM(price) AS n FROM orders WHERE status IN ('requested','accepted','on_the_way','in_progress','delivered','disputed')"
      ),
      // أرباح مقدمي الخدمات بانتظار الصرف
      earningsHeld: one("SELECT SUM(amount) AS n FROM earnings WHERE status = 'held'"),
      refunded: one("SELECT SUM(refunded) AS n FROM payments"),
      paidOut: one("SELECT SUM(amount) AS n FROM payouts"),
      nextPayoutAt: money.nextPayoutAt(Date.now()),
    };
  });

  r.get("/api/admin/orders", ({ req, query }) => {
    auth.requireAdmin(req);
    const status = query.status ? String(query.status) : null;
    return {
      items: db
        .prepare(
          `SELECT o.id, o.title, o.status, o.price, o.fee, o.dispute_reason, o.cancel_kind, o.updated_at,
                  c.name AS customer_name, p.name AS provider_name
           FROM orders o JOIN users c ON c.id = o.customer_id JOIN users p ON p.id = o.provider_id
           WHERE (?1 IS NULL OR o.status = ?1) AND o.status NOT IN ('pending_payment','abandoned')
           ORDER BY o.updated_at DESC LIMIT 100`
        )
        .all(status),
    };
  });

  r.get("/api/admin/payouts", ({ req }) => {
    auth.requireAdmin(req);
    return { items: db.prepare("SELECT * FROM payout_runs ORDER BY id DESC LIMIT 30").all() };
  });

  r.post("/api/admin/payouts/run", ({ req }) => {
    auth.requireAdmin(req);
    return { run: orders.runPayouts(Date.now(), { force: true }) };
  });
};
