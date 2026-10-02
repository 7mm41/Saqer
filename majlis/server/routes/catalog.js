"use strict";
const cfg = require("../config");
const money = require("../money");
const { bad, forbidden, notFound, str, int, list, coord } = require("../http");
const { SERVICE_SELECT } = require("../present");
const { UNITS } = require("./account");

module.exports = function register(r, { db, auth, presenter }) {
  r.get("/api/categories", () => ({
    items: db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM services s WHERE s.category_id = c.id AND s.active = 1) AS count
         FROM categories c ORDER BY c.sort`
      )
      .all(),
  }));

  // البحث والتصفح: ?cat= &q= &online=1 &mode=onsite|remote &city= &lat= &lng= &sort=recommended|rating|price|distance
  r.get("/api/services", ({ query }) => {
    const where = ["s.active = 1"];
    const args = [];
    if (query.cat) where.push("s.category_id = ?"), args.push(query.cat);
    if (query.mode === "onsite" || query.mode === "remote") where.push("s.mode = ?"), args.push(query.mode);
    if (query.city) where.push("(s.city LIKE ? OR u.city LIKE ?)"), args.push(`%${query.city}%`, `%${query.city}%`);
    if (query.q) {
      const like = `%${String(query.q).trim().slice(0, 60)}%`;
      where.push(
        "(s.title LIKE ? OR s.description LIKE ? OR s.skills LIKE ? OR u.name LIKE ? OR u.languages LIKE ? " +
          "OR s.category_id IN (SELECT id FROM categories WHERE name LIKE ?))"
      );
      args.push(like, like, like, like, like, like);
    }
    const lat = coord(query.lat, 90), lng = coord(query.lng, 180);
    const near = lat !== null && lng !== null ? { lat, lng } : null;
    let items = db
      .prepare(SERVICE_SELECT + " WHERE " + where.join(" AND ") + " ORDER BY s.id DESC LIMIT 300")
      .all(...args)
      .map((row) => presenter.service(row, near));
    if (query.online === "1") items = items.filter((s) => s.provider.online);
    const by = {
      price: (a, b) => a.price - b.price,
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.reviews_count - a.reviews_count,
      distance: (a, b) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9),
      recommended: (a, b) =>
        b.provider.online - a.provider.online ||
        (b.rating || 0) - (a.rating || 0) ||
        b.completed_count - a.completed_count,
    };
    items.sort(by[query.sort] || by.recommended);
    return { items: items.slice(0, 60) };
  });

  r.get("/api/services/:id", ({ params }) => {
    const row = db.prepare(SERVICE_SELECT + " WHERE s.id = ?").get(Number(params.id));
    if (!row) throw notFound("الخدمة غير موجودة");
    const provider = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
    const reviews = db
      .prepare(
        `SELECT r.rating, r.comment, r.created_at, c.name AS customer_name FROM reviews r
         JOIN users c ON c.id = r.customer_id WHERE r.service_id = ? ORDER BY r.id DESC LIMIT 30`
      )
      .all(row.id);
    return { service: presenter.service(row), provider: presenter.user(provider), reviews };
  });

  r.get("/api/quote", ({ query }) => {
    const s = db.prepare("SELECT * FROM services WHERE id = ?").get(Number(query.serviceId));
    if (!s) throw notFound("الخدمة غير موجودة");
    const qty = s.unit === "hour" || s.unit === "session" ? int(query.qty || 1, { min: 1, max: 100, field: "الكمية" }) : 1;
    return { qty, ...money.quote(s.price, qty), lateCancelRate: cfg.lateCancelCompensationRate };
  });

  r.get("/api/me/services", ({ req }) => {
    const u = auth.requireUser(req);
    return {
      items: db.prepare(SERVICE_SELECT + " WHERE s.user_id = ? ORDER BY s.id DESC").all(u.id).map((row) => presenter.service(row)),
    };
  });

  // الشرط الوحيد لتقديم خدمة هو الخبرة: عدد سنوات + وصف مختصر لها.
  function readService(body) {
    const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(String(body.category || ""));
    if (!cat) throw bad("اختر تصنيف الخدمة");
    const unit = String(body.unit || "");
    if (!UNITS[unit]) throw bad("اختر طريقة التسعير");
    let mode = String(body.mode || cat.mode);
    if (cat.mode !== "both") mode = cat.mode;
    if (mode !== "onsite" && mode !== "remote") throw bad("حدّد هل الخدمة في موقع العميل أم عن بُعد");
    const priceSar = Number(body.price);
    if (!Number.isFinite(priceSar) || priceSar < 1 || priceSar > 1000000) throw bad("السعر يجب أن يكون بين 1 و 1,000,000 ريال");
    return {
      category_id: cat.id,
      title: str(body.title, { min: 3, max: 80, field: "عنوان الخدمة" }),
      description: str(body.description, { max: 2000, field: "الوصف" }),
      skills: JSON.stringify(list(body.skills, { maxItems: 20 })),
      experience_years: int(body.experience_years, {
        min: cfg.minExperienceYears,
        max: 60,
        field: `سنوات الخبرة (الحد الأدنى ${cfg.minExperienceYears})`,
      }),
      experience_note: str(body.experience_note, { min: 10, max: 1000, field: "وصف الخبرة" }),
      price: Math.round(priceSar * 100),
      unit,
      mode,
      city: str(body.city, { max: 60, field: "المدينة" }),
      active: body.active === undefined ? 1 : body.active ? 1 : 0,
    };
  }

  r.post("/api/services", ({ req, body }) => {
    const u = auth.requireUser(req);
    const s = readService(body);
    const count = db.prepare("SELECT COUNT(*) AS n FROM services WHERE user_id = ?").get(u.id).n;
    if (count >= 20) throw bad("الحد الأقصى 20 خدمة لكل مستخدم");
    const rr = db
      .prepare(
        `INSERT INTO services (user_id, category_id, title, description, skills, experience_years, experience_note,
           price, unit, mode, city, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(u.id, s.category_id, s.title, s.description, s.skills, s.experience_years, s.experience_note,
        s.price, s.unit, s.mode, s.city || u.city, s.active, Date.now());
    const row = db.prepare(SERVICE_SELECT + " WHERE s.id = ?").get(Number(rr.lastInsertRowid));
    return { service: presenter.service(row) };
  });

  function own(req, id) {
    const u = auth.requireUser(req);
    const s = db.prepare("SELECT * FROM services WHERE id = ?").get(Number(id));
    if (!s) throw notFound("الخدمة غير موجودة");
    if (s.user_id !== u.id) throw forbidden();
    return { u, s };
  }

  r.put("/api/services/:id", ({ req, params, body }) => {
    const { u, s: old } = own(req, params.id);
    const s = readService(body);
    db.prepare(
      `UPDATE services SET category_id = ?, title = ?, description = ?, skills = ?, experience_years = ?,
         experience_note = ?, price = ?, unit = ?, mode = ?, city = ?, active = ? WHERE id = ?`
    ).run(s.category_id, s.title, s.description, s.skills, s.experience_years, s.experience_note,
      s.price, s.unit, s.mode, s.city || u.city, s.active, old.id);
    return { service: presenter.service(db.prepare(SERVICE_SELECT + " WHERE s.id = ?").get(old.id)) };
  });

  // الحذف: إذا كانت للخدمة طلبات سابقة تُخفى فقط حفاظاً على السجل.
  r.del("/api/services/:id", ({ req, params }) => {
    const { s } = own(req, params.id);
    const used = db.prepare("SELECT 1 FROM orders WHERE service_id = ? LIMIT 1").get(s.id);
    if (used) db.prepare("UPDATE services SET active = 0 WHERE id = ?").run(s.id);
    else db.prepare("DELETE FROM services WHERE id = ?").run(s.id);
    return { ok: true, hidden: !!used };
  });
};
