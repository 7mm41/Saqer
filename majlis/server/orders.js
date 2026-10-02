"use strict";
// دورة حياة الطلب والمال المحتجز.
//
// pending_payment → requested → accepted → [on_the_way] → in_progress → delivered → completed
//                                                                          ↘ disputed ↗ (أو استرداد)
// ويمكن الإلغاء (cancelled) في المراحل المسموحة، وتُحسب المبالغ عبر money.settlement.
const cfg = require("./config");
const { tx } = require("./db");
const money = require("./money");
const { getGateway, processPendingRefunds } = require("./payments");
const { bad, forbidden, notFound, str, coord } = require("./http");

const ACTIVE = ["requested", "accepted", "on_the_way", "in_progress", "delivered", "disputed"];

const ACTIONS = {
  accept: { by: "provider", from: ["requested"], to: "accepted", stamp: "accepted_at" },
  decline: { by: "provider", from: ["requested"], close: () => "provider_declined" },
  depart: { by: "provider", from: ["accepted"], to: "on_the_way", stamp: "on_the_way_at", mode: "onsite" },
  start: {
    by: "provider",
    from: (o) => (o.mode === "onsite" ? ["on_the_way"] : ["accepted"]),
    to: "in_progress",
    stamp: "started_at",
  },
  deliver: { by: "provider", from: ["in_progress"], to: "delivered", stamp: "delivered_at" },
  retry: { by: "provider", from: ["disputed"], to: "in_progress" },
  fail: {
    by: "provider",
    from: ["accepted", "on_the_way", "in_progress", "delivered", "disputed"],
    close: () => "provider_failed",
  },
  cancel: {
    by: "customer",
    from: ["requested", "accepted", "on_the_way", "in_progress"],
    // بعد تحرّك مقدم الخدمة نحو الموقع (أو بدء العمل عن بُعد) يستحق تعويضاً.
    close: (o) => (o.status === "on_the_way" || o.status === "in_progress" ? "customer_late" : "customer_early"),
  },
  confirm: { by: "customer", from: ["delivered"], close: () => "completed" },
  dispute: { by: "customer", from: ["delivered"], to: "disputed", needsNote: true },
  release: { by: "admin", from: ["disputed"], close: () => "completed" },
  refund: { by: "admin", from: ["disputed"], close: () => "dispute_refund" },
};

function sar(h) {
  return (h / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " ر.س";
}

function createOrders({ db, hub }) {
  const q = {
    order: db.prepare("SELECT * FROM orders WHERE id = ?"),
    service: db.prepare(
      "SELECT s.*, u.available AS provider_available FROM services s JOIN users u ON u.id = s.user_id WHERE s.id = ?"
    ),
    user: db.prepare("SELECT id, name, phone FROM users WHERE id = ?"),
    presence: db.prepare("SELECT id, available, last_seen_at FROM users WHERE id = ?"),
    admins: db.prepare("SELECT id FROM users WHERE is_admin = 1"),
    event: db.prepare("INSERT INTO order_events (order_id, actor_id, type, note, created_at) VALUES (?, ?, ?, ?, ?)"),
    events: db.prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY id"),
    payment: db.prepare("SELECT * FROM payments WHERE order_id = ?"),
    earning: db.prepare(
      "INSERT INTO earnings (provider_id, order_id, amount, kind, status, created_at) VALUES (?, ?, ?, ?, 'held', ?)"
    ),
    review: db.prepare("SELECT rating, comment, created_at FROM reviews WHERE order_id = ?"),
  };

  function load(id) {
    const o = q.order.get(id);
    if (!o) throw notFound("الطلب غير موجود");
    return o;
  }

  function roleOf(o, user) {
    if (user.id === o.customer_id) return "customer";
    if (user.id === o.provider_id) return "provider";
    if (user.is_admin) return "admin";
    return null;
  }

  function availableActions(o, role) {
    const out = [];
    for (const [name, a] of Object.entries(ACTIONS)) {
      if (a.by !== role) continue;
      if (a.mode && a.mode !== o.mode) continue;
      const from = typeof a.from === "function" ? a.from(o) : a.from;
      if (from.includes(o.status)) out.push(name);
    }
    return out;
  }

  // ما يراه كل طرف عن الطلب.
  function view(o, user) {
    const role = roleOf(o, user);
    if (!role) throw forbidden();
    // الطلب لا يصل لمقدم الخدمة قبل الدفع.
    if (role === "provider" && (o.status === "pending_payment" || o.status === "abandoned")) throw notFound("الطلب غير موجود");
    const customer = q.user.get(o.customer_id);
    const provider = q.user.get(o.provider_id);
    // رقم الجوال يظهر للطرفين فقط بعد قبول الطلب وأثناء تنفيذه.
    const sharePhone = ["accepted", "on_the_way", "in_progress", "delivered", "disputed"].includes(o.status);
    const party = (u) => ({ id: u.id, name: u.name, phone: sharePhone || role === "admin" ? u.phone : null, online: false });
    const c = party(customer);
    const p = party(provider);
    c.online = hub.isOnline(q.presence.get(c.id));
    p.online = hub.isOnline(q.presence.get(p.id));
    const payment = q.payment.get(o.id);
    return {
      ...o,
      role,
      customer: c,
      provider: p,
      actions: availableActions(o, role),
      events: q.events.all(o.id),
      payment: payment && { status: payment.status, amount: payment.amount, refunded: payment.refunded, gateway: payment.gateway },
      review: q.review.get(o.id) || null,
      expected_compensation: Math.round(o.price * cfg.lateCancelCompensationRate),
    };
  }

  function emit(o) {
    const fresh = q.order.get(o.id);
    for (const uid of [fresh.customer_id, fresh.provider_id]) hub.send(uid, "order", { id: fresh.id, status: fresh.status });
  }

  function create(user, input) {
    const s = q.service.get(Number(input.serviceId));
    if (!s || !s.active) throw notFound("الخدمة غير متاحة");
    if (s.user_id === user.id) throw bad("لا يمكنك طلب خدمتك");
    if (!s.provider_available) throw bad("مقدم الخدمة غير متاح لاستقبال الطلبات حالياً");
    const qty = s.unit === "hour" || s.unit === "session" ? Number(input.qty || 1) : 1;
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw bad("الكمية غير صحيحة");
    const description = str(input.description, { min: 5, max: 2000, field: "وصف الطلب" });
    let address = "", lat = null, lng = null;
    if (s.mode === "onsite") {
      address = str(input.address, { min: 3, max: 300, field: "العنوان" });
      lat = coord(input.lat, 90);
      lng = coord(input.lng, 180);
    }
    let scheduled = null;
    if (input.scheduledAt) {
      scheduled = Date.parse(input.scheduledAt);
      if (!Number.isFinite(scheduled)) throw bad("الموعد غير صحيح");
    }
    const { price, fee, total } = money.quote(s.price, qty);
    const now = Date.now();
    const r = db
      .prepare(
        `INSERT INTO orders (service_id, customer_id, provider_id, title, mode, unit, qty, unit_price, price, fee, total,
           description, address, lat, lng, scheduled_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?)`
      )
      .run(s.id, user.id, s.user_id, s.title, s.mode, s.unit, qty, s.price, price, fee, total,
        description, address, lat, lng, scheduled, now, now);
    const id = Number(r.lastInsertRowid);
    q.event.run(id, user.id, "created", "", now);
    return load(id);
  }

  // الدفع: يُحتجز (سعر الخدمة + رسوم التطبيق) داخل التطبيق حتى إغلاق الطلب.
  function pay(user, id) {
    const o = load(id);
    if (o.customer_id !== user.id) throw forbidden();
    if (o.status !== "pending_payment") throw bad("تم دفع هذا الطلب مسبقاً");
    const gw = getGateway(cfg.paymentGateway);
    const { ref } = gw.charge({
      amount: o.total,
      currency: cfg.currency,
      description: `طلب #${o.id}: ${o.title}`,
      metadata: { orderId: o.id },
    });
    const now = Date.now();
    tx(db, () => {
      db.prepare(
        "INSERT INTO payments (order_id, user_id, amount, gateway, gateway_ref, status, created_at) VALUES (?, ?, ?, ?, ?, 'held', ?)"
      ).run(o.id, user.id, o.total, gw.name, ref, now);
      db.prepare("UPDATE orders SET status = 'requested', updated_at = ? WHERE id = ?").run(now, o.id);
      q.event.run(o.id, user.id, "paid", sar(o.total), now);
    });
    hub.notify(o.provider_id, "طلب جديد: " + o.title, `${q.user.get(o.customer_id).name} — ${sar(o.price)}`, `#/order/${o.id}`);
    emit(o);
    return load(id);
  }

  // إغلاق الطلب وتوزيع المبلغ المحتجز (يُستدعى داخل معاملة).
  function closeOrder(o, kind, actorId, note, now) {
    const s = money.settlement(kind, o.price);
    db.prepare(
      `UPDATE orders SET status = ?, cancel_kind = ?, cancel_reason = COALESCE(?, cancel_reason),
         refund_amount = ?, compensation_amount = ?, closed_at = ?, updated_at = ? WHERE id = ?`
    ).run(
      kind === "completed" ? "completed" : "cancelled",
      kind === "completed" ? null : kind,
      kind === "completed" ? null : note || null,
      s.refund,
      kind === "customer_late" ? s.provider : 0,
      now, now, o.id
    );
    if (s.refund > 0) {
      db.prepare("UPDATE payments SET refunded = refunded + ?, status = 'refund_pending' WHERE order_id = ?").run(s.refund, o.id);
    } else {
      db.prepare("UPDATE payments SET status = 'settled' WHERE order_id = ?").run(o.id);
    }
    if (s.provider > 0) q.earning.run(o.provider_id, o.id, s.provider, s.earningKind, now);
    return s;
  }

  function notifyAfter(o, action, s, note) {
    const link = `#/order/${o.id}`;
    const C = o.customer_id, P = o.provider_id;
    const refundTxt = s && s.refund ? ` تم استرداد ${sar(s.refund)} (رسوم التطبيق غير مستردة).` : "";
    switch (action) {
      case "accept": return hub.notify(C, "تم قبول طلبك", o.title, link);
      case "decline": return hub.notify(C, "اعتذر مقدم الخدمة عن طلبك", o.title + "." + refundTxt, link);
      case "depart": return hub.notify(C, "مقدم الخدمة في الطريق إليك 🚗", o.title, link);
      case "start": return hub.notify(C, "بدأ العمل على طلبك", o.title, link);
      case "deliver": return hub.notify(C, "تم تسليم العمل", "أكّد الاكتمال أو أبلغ إن لم تُحل المشكلة", link);
      case "retry": return hub.notify(C, "مقدم الخدمة سيعيد المحاولة", o.title, link);
      case "fail": return hub.notify(C, "تعذّر إكمال الخدمة", o.title + "." + refundTxt, link);
      case "cancel":
        hub.notify(C, "تم إلغاء طلبك", o.title + "." + refundTxt, link);
        return hub.notify(P, "ألغى العميل الطلب",
          s.provider ? `أُضيف تعويض ${sar(s.provider)} إلى أرباحك المحتجزة.` : o.title, link);
      case "confirm":
      case "auto_confirm":
        return hub.notify(P, "اكتمل الطلب ✅", `أُضيف ${sar(s.provider)} إلى أرباحك وسيُصرف في موعد الصرف القادم.`, link);
      case "dispute":
        hub.notify(P, "أبلغ العميل أن المشكلة لم تُحل", note || o.title, link);
        for (const a of q.admins.all()) hub.notify(a.id, "نزاع جديد على طلب #" + o.id, note || "", link);
        return;
      case "release":
        hub.notify(P, "حُسم النزاع لصالحك", `أُضيف ${sar(s.provider)} إلى أرباحك.`, link);
        return hub.notify(C, "حُسم النزاع", "تم اعتماد العمل وتحويل المبلغ لمقدم الخدمة.", link);
      case "refund":
        hub.notify(C, "حُسم النزاع لصالحك", refundTxt.trim(), link);
        return hub.notify(P, "حُسم النزاع", "تمت إعادة المبلغ لصاحب الطلب.", link);
      case "expired": return hub.notify(C, "انتهت مهلة قبول طلبك", o.title + "." + refundTxt, link);
    }
  }

  function act(user, id, action, input = {}) {
    const a = ACTIONS[action];
    if (!a) throw notFound("إجراء غير معروف");
    const o = load(id);
    const role = roleOf(o, user);
    if (!role) throw forbidden();
    if (a.by !== role) throw forbidden("هذا الإجراء غير مسموح لك");
    if (!availableActions(o, role).includes(action)) throw bad("لا يمكن تنفيذ هذا الإجراء في حالة الطلب الحالية");
    const note = str(input.note, { max: 1000, min: a.needsNote ? 3 : 0, field: "السبب" });
    const now = Date.now();
    let s = null;
    tx(db, () => {
      // نتأكد أن الحالة لم تتغير منذ قراءتها (حماية من الضغط المزدوج).
      if (q.order.get(o.id).status !== o.status) throw bad("تغيّرت حالة الطلب، حدّث الصفحة");
      if (a.close) {
        s = closeOrder(o, a.close(o), user.id, note, now);
      } else {
        const sets = ["status = ?", "updated_at = ?"];
        const vals = [a.to, now];
        if (a.stamp) sets.push(`${a.stamp} = ?`), vals.push(now);
        if (action === "dispute") sets.push("dispute_reason = ?"), vals.push(note);
        db.prepare(`UPDATE orders SET ${sets.join(", ")} WHERE id = ?`).run(...vals, o.id);
      }
      q.event.run(o.id, user.id, action, note, now);
    });
    processPendingRefunds(db);
    notifyAfter(o, action, s, note);
    emit(o);
    return load(id);
  }

  function updateLocation(user, id, input) {
    const o = load(id);
    if (o.provider_id !== user.id) throw forbidden();
    if (!["on_the_way", "in_progress"].includes(o.status)) throw bad("مشاركة الموقع متاحة أثناء التوجه للعميل فقط");
    const lat = coord(input.lat, 90), lng = coord(input.lng, 180);
    if (lat === null || lng === null) throw bad("الموقع مطلوب");
    const now = Date.now();
    db.prepare("UPDATE orders SET provider_lat = ?, provider_lng = ?, provider_loc_at = ? WHERE id = ?").run(lat, lng, now, o.id);
    hub.send(o.customer_id, "location", { id: o.id, lat, lng, at: now });
  }

  // مهام دورية: انتهاء مهلة القبول، التأكيد التلقائي، تنظيف الطلبات غير المدفوعة.
  function sweep(now = Date.now()) {
    const expired = db.prepare(
      `SELECT o.* FROM orders o JOIN payments p ON p.order_id = o.id
       WHERE o.status = 'requested' AND p.created_at < ?`
    ).all(now - cfg.requestTimeoutHours * 3600000);
    for (const o of expired) {
      const s = tx(db, () => {
        const v = closeOrder(o, "expired", null, "لم يُقبل الطلب خلال المهلة", now);
        q.event.run(o.id, null, "expired", "", now);
        return v;
      });
      notifyAfter(o, "expired", s);
      emit(o);
    }
    const stale = db.prepare("SELECT * FROM orders WHERE status = 'delivered' AND delivered_at < ?")
      .all(now - cfg.autoConfirmHours * 3600000);
    for (const o of stale) {
      const s = tx(db, () => {
        const v = closeOrder(o, "completed", null, null, now);
        q.event.run(o.id, null, "auto_confirm", "", now);
        return v;
      });
      notifyAfter(o, "auto_confirm", s);
      emit(o);
    }
    db.prepare("UPDATE orders SET status = 'abandoned', updated_at = ? WHERE status = 'pending_payment' AND created_at < ?")
      .run(now, now - 3600000);
    processPendingRefunds(db);
    return { expired: expired.length, autoConfirmed: stale.length };
  }

  // صرف الأرباح المحتجزة في نهاية كل دورة (أسبوع أو أسبوعين).
  // force=true يصرف كل ما تم احتجازه حتى الآن (زر المشرف).
  function runPayouts(now = Date.now(), { force = false } = {}) {
    const periodEnd = force ? now : money.lastPayoutBoundary(now);
    if (!force) {
      const done = db.prepare("SELECT 1 FROM payout_runs WHERE period_end >= ?").get(periodEnd);
      if (done) return null;
    }
    const rows = db.prepare(
      `SELECT e.provider_id, SUM(e.amount) AS amount, u.iban, u.name FROM earnings e JOIN users u ON u.id = e.provider_id
       WHERE e.status = 'held' AND e.created_at < ? GROUP BY e.provider_id`
    ).all(periodEnd);
    const result = tx(db, () => {
      const run = db.prepare("INSERT INTO payout_runs (period_end, total, count, created_at) VALUES (?, 0, 0, ?)").run(periodEnd, now);
      const runId = Number(run.lastInsertRowid);
      let total = 0, count = 0;
      const skipped = [];
      for (const r of rows) {
        if (!r.iban) { skipped.push(r.provider_id); continue; }
        const p = db.prepare(
          "INSERT INTO payouts (run_id, provider_id, amount, iban, status, created_at) VALUES (?, ?, ?, ?, 'paid', ?)"
        ).run(runId, r.provider_id, r.amount, r.iban, now);
        db.prepare(
          "UPDATE earnings SET status = 'paid', payout_id = ? WHERE provider_id = ? AND status = 'held' AND created_at < ?"
        ).run(Number(p.lastInsertRowid), r.provider_id, periodEnd);
        total += r.amount;
        count++;
      }
      db.prepare("UPDATE payout_runs SET total = ?, count = ? WHERE id = ?").run(total, count, runId);
      return { runId, periodEnd, total, count, paid: rows.filter((r) => r.iban), skipped };
    });
    for (const r of result.paid) hub.notify(r.provider_id, "تم صرف أرباحك 💰", `${sar(r.amount)} إلى حسابك البنكي`, "#/wallet");
    for (const uid of result.skipped) hub.notify(uid, "لديك أرباح بانتظار الصرف", "أضف رقم الآيبان (IBAN) في حسابك ليتم تحويلها.", "#/me");
    delete result.paid;
    return result;
  }

  return { create, pay, act, view, load, updateLocation, sweep, runPayouts, roleOf, ACTIVE };
}

module.exports = { createOrders, ACTIONS, sar };
