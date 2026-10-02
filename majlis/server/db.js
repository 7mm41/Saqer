"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// المبالغ كلها أعداد صحيحة بالهللة، والأوقات بالمللي ثانية (epoch).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  languages TEXT NOT NULL DEFAULT '[]',
  iban TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL,
  available INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  mode TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '[]',
  experience_years INTEGER NOT NULL,
  experience_note TEXT NOT NULL,
  price INTEGER NOT NULL,
  unit TEXT NOT NULL,
  mode TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS services_user ON services(user_id);
CREATE INDEX IF NOT EXISTS services_cat ON services(category_id);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  provider_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  mode TEXT NOT NULL,
  unit TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  price INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  total INTEGER NOT NULL,
  description TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  lat REAL, lng REAL,
  scheduled_at INTEGER,
  status TEXT NOT NULL,
  cancel_kind TEXT,
  cancel_reason TEXT,
  dispute_reason TEXT,
  refund_amount INTEGER NOT NULL DEFAULT 0,
  compensation_amount INTEGER NOT NULL DEFAULT 0,
  provider_lat REAL, provider_lng REAL, provider_loc_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  accepted_at INTEGER, on_the_way_at INTEGER, started_at INTEGER,
  delivered_at INTEGER, closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_provider ON orders(provider_id);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  actor_id INTEGER,
  type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  refunded INTEGER NOT NULL DEFAULT 0,
  gateway TEXT NOT NULL,
  gateway_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS earnings (
  id INTEGER PRIMARY KEY,
  provider_id INTEGER NOT NULL REFERENCES users(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held',
  payout_id INTEGER REFERENCES payouts(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS earnings_provider ON earnings(provider_id, status);

CREATE TABLE IF NOT EXISTS payout_runs (
  id INTEGER PRIMARY KEY,
  period_end INTEGER NOT NULL UNIQUE,
  total INTEGER NOT NULL,
  count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES payout_runs(id),
  provider_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  iban TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_order ON messages(order_id);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  provider_id INTEGER NOT NULL REFERENCES users(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_provider ON reviews(provider_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read);
`;

const CATEGORIES = [
  ["programming", "برمجة وتطوير", "💻", "remote"],
  ["video", "تصميم ومونتاج فيديو", "🎬", "remote"],
  ["graphic", "تصميم جرافيك", "🎨", "remote"],
  ["mechanic", "ميكانيكا سيارات", "🔧", "onsite"],
  ["electric", "كهرباء", "⚡", "onsite"],
  ["plumbing", "سباكة", "🚿", "onsite"],
  ["ac", "تكييف وتبريد", "❄️", "onsite"],
  ["trading", "تعليم التداول", "📈", "both"],
  ["tutoring", "دروس خصوصية", "📚", "both"],
  ["translation", "ترجمة", "🌐", "remote"],
  ["photo", "تصوير", "📷", "onsite"],
  ["devices", "صيانة جوالات وأجهزة", "📱", "both"],
  ["carpentry", "نجارة", "🪚", "onsite"],
  ["painting", "دهانات", "🖌️", "onsite"],
  ["marketing", "تسويق رقمي", "📣", "remote"],
  ["writing", "كتابة محتوى", "✍️", "remote"],
  ["other", "خدمات أخرى", "🧰", "both"],
];

function open(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  const insertCat = db.prepare(
    "INSERT INTO categories (id, name, icon, mode, sort) VALUES (?, ?, ?, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET name = excluded.name, icon = excluded.icon, mode = excluded.mode, sort = excluded.sort"
  );
  CATEGORIES.forEach((c, i) => insertCat.run(c[0], c[1], c[2], c[3], i));
  return db;
}

// تنفيذ عدة عمليات كوحدة واحدة: إما أن تنجح كلها أو لا يُحفظ شيء.
function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

module.exports = { open, tx, CATEGORIES };
