"use strict";
const crypto = require("node:crypto");
const cfg = require("./config");
const { HttpError, parseCookies } = require("./http");

const COOKIE = "majlis_session";

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return "scrypt$" + salt.toString("base64") + "$" + key.toString("base64");
}

function verifyPassword(pw, stored) {
  const [alg, salt, key] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(key, "base64");
  const actual = crypto.scryptSync(pw, Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// يقبل 05xxxxxxxx أو 9665xxxxxxxx أو +9665xxxxxxxx (والأرقام العربية ٠-٩) ويحوّلها إلى +9665xxxxxxxx.
function normalizePhone(input) {
  let s = String(input || "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[\s\-()]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^05\d{8}$/.test(s)) s = "+966" + s.slice(1);
  if (/^9665\d{8}$/.test(s)) s = "+" + s;
  if (!/^\+\d{8,15}$/.test(s)) return null;
  return s;
}

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

function createAuth(db) {
  const q = {
    session: db.prepare(
      "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?"
    ),
    insert: db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"),
    remove: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    purge: db.prepare("DELETE FROM sessions WHERE expires_at < ?"),
    touch: db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?"),
  };

  function startSession(userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    const maxAge = cfg.sessionDays * 86400;
    q.insert.run(sha(token), userId, now, now + maxAge * 1000);
    return cookieHeader(token, maxAge);
  }

  function cookieHeader(value, maxAge) {
    return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.secureCookies ? "; Secure" : ""}`;
  }

  function endSession(req) {
    const t = parseCookies(req.headers.cookie)[COOKIE];
    if (t) q.remove.run(sha(t));
    return cookieHeader("", 0);
  }

  function currentUser(req) {
    const t = parseCookies(req.headers.cookie)[COOKIE];
    if (!t) return null;
    const u = q.session.get(sha(t), Date.now()) || null;
    if (u && Date.now() - u.last_seen_at > 30000) {
      u.last_seen_at = Date.now();
      q.touch.run(u.last_seen_at, u.id);
    }
    return u;
  }

  function requireUser(req) {
    const u = currentUser(req);
    if (!u) throw new HttpError(401, "يجب تسجيل الدخول");
    return u;
  }

  function requireAdmin(req) {
    const u = requireUser(req);
    if (!u.is_admin) throw new HttpError(403, "للمشرفين فقط");
    return u;
  }

  // حد بسيط لمحاولات الدخول الفاشلة لكل رقم/عنوان.
  const attempts = new Map();
  function checkRate(key) {
    const now = Date.now();
    const a = attempts.get(key);
    if (a && a.until > now && a.count >= 8) throw new HttpError(429, "محاولات كثيرة، حاول بعد قليل");
  }
  function recordFailure(key) {
    const now = Date.now();
    const a = attempts.get(key);
    if (!a || a.until < now) attempts.set(key, { count: 1, until: now + 15 * 60000 });
    else a.count++;
  }

  return {
    startSession, endSession, currentUser, requireUser, requireAdmin, checkRate, recordFailure,
    purge: () => q.purge.run(Date.now()),
  };
}

module.exports = { createAuth, hashPassword, verifyPassword, normalizePhone };
