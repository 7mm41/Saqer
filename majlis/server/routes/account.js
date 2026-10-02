"use strict";
const cfg = require("../config");
const money = require("../money");
const { hashPassword, verifyPassword, normalizePhone } = require("../auth");
const { bad, notFound, str, coord, list } = require("../http");
const { SERVICE_SELECT } = require("../present");

const UNITS = { visit: "للزيارة", hour: "للساعة", project: "للمشروع", session: "للجلسة" };

// التحقق من رقم الآيبان (IBAN) بخوارزمية mod-97.
function validIban(iban) {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return null;
  const re = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let r = 0;
  for (const d of re) r = (r * 10 + Number(d)) % 97;
  return r === 1 ? s : null;
}

function self(u, presenter) {
  return {
    ...presenter.user(u),
    phone: u.phone,
    iban: u.iban,
    lat: u.lat,
    lng: u.lng,
    is_admin: !!u.is_admin,
  };
}

module.exports = function register(r, { db, hub, auth, presenter }) {
  r.get("/api/config", () => ({
    currency: cfg.currency,
    feeRate: cfg.platformFeeRate,
    feeMin: cfg.platformFeeMin,
    lateCancelRate: cfg.lateCancelCompensationRate,
    payoutIntervalDays: cfg.payoutIntervalDays,
    nextPayoutAt: money.nextPayoutAt(Date.now()),
    minExperienceYears: cfg.minExperienceYears,
    requestTimeoutHours: cfg.requestTimeoutHours,
    autoConfirmHours: cfg.autoConfirmHours,
    gateway: cfg.paymentGateway,
    units: UNITS,
  }));

  r.post("/api/auth/register", ({ body, res }) => {
    const name = str(body.name, { min: 2, max: 60, field: "الاسم" });
    const phone = normalizePhone(body.phone);
    if (!phone) throw bad("رقم الجوال غير صحيح");
    const password = String(body.password || "");
    if (password.length < 8) throw bad("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (db.prepare("SELECT 1 FROM users WHERE phone = ?").get(phone)) throw bad("هذا الرقم مسجّل مسبقاً، سجّل الدخول");
    const city = str(body.city, { max: 60, field: "المدينة" });
    const now = Date.now();
    const isAdmin = cfg.adminPhones.includes(phone) ? 1 : 0;
    const rr = db
      .prepare("INSERT INTO users (name, phone, password_hash, city, is_admin, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(name, phone, hashPassword(password), city, isAdmin, now, now);
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(rr.lastInsertRowid));
    res.setHeader("Set-Cookie", auth.startSession(u.id));
    return { user: self(u, presenter) };
  });

  r.post("/api/auth/login", ({ body, req, res }) => {
    const phone = normalizePhone(body.phone);
    const key = (phone || "") + "|" + req.socket.remoteAddress;
    auth.checkRate(key);
    const u = phone && db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
    if (!u || !verifyPassword(String(body.password || ""), u.password_hash)) {
      auth.recordFailure(key);
      throw bad("رقم الجوال أو كلمة المرور غير صحيحة");
    }
    res.setHeader("Set-Cookie", auth.startSession(u.id));
    return { user: self(u, presenter) };
  });

  r.post("/api/auth/logout", ({ req, res }) => {
    res.setHeader("Set-Cookie", auth.endSession(req));
    return { ok: true };
  });

  r.get("/api/me", ({ req }) => {
    const u = auth.currentUser(req);
    return { user: u ? self(u, presenter) : null };
  });

  r.put("/api/me", ({ req, body }) => {
    const u = auth.requireUser(req);
    const next = {
      name: body.name !== undefined ? str(body.name, { min: 2, max: 60, field: "الاسم" }) : u.name,
      bio: body.bio !== undefined ? str(body.bio, { max: 600, field: "النبذة" }) : u.bio,
      city: body.city !== undefined ? str(body.city, { max: 60, field: "المدينة" }) : u.city,
      languages: body.languages !== undefined ? JSON.stringify(list(body.languages, { maxItems: 10 })) : u.languages,
      iban: u.iban,
      lat: body.lat !== undefined ? coord(body.lat, 90) : u.lat,
      lng: body.lng !== undefined ? coord(body.lng, 180) : u.lng,
      available: body.available !== undefined ? (body.available ? 1 : 0) : u.available,
    };
    if (body.iban !== undefined) {
      const raw = str(body.iban, { max: 40, field: "الآيبان" });
      next.iban = raw ? validIban(raw) : "";
      if (next.iban === null) throw bad("رقم الآيبان غير صحيح");
    }
    db.prepare(
      "UPDATE users SET name = ?, bio = ?, city = ?, languages = ?, iban = ?, lat = ?, lng = ?, available = ? WHERE id = ?"
    ).run(next.name, next.bio, next.city, next.languages, next.iban, next.lat, next.lng, next.available, u.id);
    const fresh = db.prepare("SELECT * FROM users WHERE id = ?").get(u.id);
    if (!!fresh.available !== !!u.available) hub.broadcast("presence", { userId: u.id, online: hub.isOnline(fresh) });
    return { user: self(fresh, presenter) };
  });

  r.get("/api/users/:id", ({ params }) => {
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(params.id));
    if (!u) throw notFound("المستخدم غير موجود");
    const services = db
      .prepare(SERVICE_SELECT + " WHERE s.user_id = ? AND s.active = 1 ORDER BY s.id DESC")
      .all(u.id)
      .map((row) => presenter.service(row));
    const reviews = db
      .prepare(
        `SELECT r.rating, r.comment, r.created_at, c.name AS customer_name, s.title AS service_title
         FROM reviews r JOIN users c ON c.id = r.customer_id JOIN services s ON s.id = r.service_id
         WHERE r.provider_id = ? ORDER BY r.id DESC LIMIT 30`
      )
      .all(u.id);
    return { user: presenter.user(u), services, reviews };
  });

  r.get("/api/events", ({ req, res }) => {
    const u = auth.requireUser(req);
    hub.connect(u, req, res);
    return undefined;
  });

  r.get("/api/notifications", ({ req }) => {
    const u = auth.requireUser(req);
    const items = db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50").all(u.id);
    const unread = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0").get(u.id).n;
    return { items, unread };
  });

  r.post("/api/notifications/read", ({ req }) => {
    const u = auth.requireUser(req);
    db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0").run(u.id);
    return { ok: true };
  });
};

module.exports.UNITS = UNITS;
module.exports.validIban = validIban;
