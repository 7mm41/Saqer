"use strict";
// بيانات تجريبية: npm run seed  (أضف --reset لحذف القاعدة وإعادة إنشائها)
const fs = require("node:fs");
const cfg = require("./config");
const { open, tx } = require("./db");
const { hashPassword } = require("./auth");

if (process.argv.includes("--reset")) {
  for (const f of [cfg.dbFile, cfg.dbFile + "-wal", cfg.dbFile + "-shm"]) fs.rmSync(f, { force: true });
}

const db = open(cfg.dbFile);
if (db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0) {
  console.log("القاعدة تحتوي بيانات بالفعل. استخدم: npm run seed -- --reset");
  process.exit(0);
}

const PASSWORD = "majlis123";
const hash = hashPassword(PASSWORD);
const now = Date.now();
const DAY = 86400000;

const people = [
  { name: "مشرف المجلس", phone: "+966500000000", city: "الرياض", admin: 1 },
  { name: "سارة العتيبي", phone: "+966500000001", city: "الرياض", bio: "أبحث عن خدمات موثوقة.", lat: 24.77, lng: 46.74 },
  {
    name: "صقر الحربي", phone: "+966500000002", city: "الرياض", lat: 24.71, lng: 46.67, langs: ["العربية", "English"],
    bio: "مبرمج Full-Stack، أبني مواقع وتطبيقات وأتمتة أعمال.",
    services: [
      ["programming", "remote", "تطوير مواقع وتطبيقات ويب", "مواقع سريعة ومتجاوبة، لوحات تحكم، وربط مع أنظمة الدفع.",
        ["JavaScript", "TypeScript", "Python", "React", "Node.js", "SQL"], 7, "7 سنوات في شركات ناشئة ومشاريع حكومية، أكثر من 40 مشروعاً مسلّماً.", 1500, "project"],
      ["programming", "remote", "استشارة وحل مشاكل برمجية", "جلسة لحل الأخطاء ومراجعة الكود.", ["Python", "JavaScript", "Git"], 7,
        "مراجعة كود وحل مشاكل لفرق تطوير متعددة.", 120, "hour"],
    ],
    reviews: [[5, "سلّم المشروع قبل الموعد وبجودة عالية"], [5, "محترف جداً"]],
  },
  {
    name: "نورة القحطاني", phone: "+966500000003", city: "جدة", lat: 21.54, lng: 39.17, langs: ["العربية", "English"],
    bio: "مصممة ومونتيرة فيديو لصنّاع المحتوى والشركات.",
    services: [["video", "remote", "مونتاج فيديو احترافي", "مونتاج ريلز ويوتيوب، تلوين، ترجمة نصية ومؤثرات.",
      ["Premiere Pro", "After Effects", "DaVinci Resolve"], 5, "5 سنوات مع قنوات يوتيوب ووكالات تسويق.", 250, "project"]],
    reviews: [[5, "إبداع في المونتاج"], [4, "ممتاز وسريع"]],
  },
  {
    name: "أبو فهد", phone: "+966500000004", city: "الرياض", lat: 24.74, lng: 46.71, langs: ["العربية"],
    bio: "ميكانيكي متنقل، أصل لموقعك لإصلاح الأعطال الشائعة.",
    services: [["mechanic", "onsite", "فحص وإصلاح أعطال السيارات في موقعك", "بطارية، تشغيل، حرارة، كهرباء سيارات، تغيير زيت.",
      ["كهرباء سيارات", "محركات", "بطاريات"], 12, "12 سنة في ورش الصيانة وخبرة في السيارات اليابانية والكورية.", 150, "visit"]],
    reviews: [[5, "وصل بسرعة وأصلح العطل"], [4, "ممتاز"], [5, "أمين وسعره معقول"]],
  },
  {
    name: "خالد الشمري", phone: "+966500000005", city: "الرياض", lat: 24.69, lng: 46.72, langs: ["العربية", "English", "اردو"],
    bio: "فني كهرباء منازل معتمد.",
    services: [["electric", "onsite", "صيانة وتمديدات كهرباء منزلية", "إصلاح الأعطال، تركيب إنارة ومفاتيح، فحص اللوحات.",
      ["تمديدات", "لوحات كهرباء", "إنارة"], 9, "9 سنوات في صيانة الفلل والشقق.", 120, "visit"]],
    reviews: [[4, "شغل نظيف"]],
  },
  {
    name: "عبدالله المالكي", phone: "+966500000006", city: "الدمام", lat: 26.42, lng: 50.09, langs: ["العربية", "English"],
    bio: "متداول ومدرّب في الأسواق المالية.",
    services: [["trading", "remote", "تعليم التداول من الصفر", "التحليل الفني، إدارة المخاطر، وبناء خطة تداول. (تعليمي وليس توصيات)",
      ["تحليل فني", "إدارة مخاطر", "الأسهم السعودية"], 8, "8 سنوات تداول ودورات لأكثر من 300 متدرب.", 200, "session"]],
    reviews: [[5, "شرح واضح ومنظم"]],
  },
  {
    name: "ريم الدوسري", phone: "+966500000007", city: "الرياض", lat: 24.8, lng: 46.63, langs: ["العربية", "English", "Français"],
    bio: "مصممة هويات بصرية ومترجمة.",
    services: [
      ["graphic", "remote", "تصميم شعار وهوية بصرية", "شعار + ألوان + خطوط + دليل استخدام.", ["Illustrator", "Figma", "Branding"], 4,
        "4 سنوات مع متاجر ومطاعم ناشئة.", 800, "project"],
      ["translation", "remote", "ترجمة عربي ↔ إنجليزي ↔ فرنسي", "ترجمة مستندات ومحتوى مواقع.", ["إنجليزي", "فرنسي"], 6,
        "مترجمة مستقلة منذ 6 سنوات.", 60, "project"],
    ],
  },
  {
    name: "ماجد السبيعي", phone: "+966500000008", city: "الرياض", lat: 24.66, lng: 46.77, langs: ["العربية"],
    bio: "فني تكييف وتبريد.",
    services: [["ac", "onsite", "صيانة وتنظيف المكيفات", "سبليت وشباك ومركزي، تعبئة فريون وكشف تسريب.", ["سبليت", "فريون"], 10,
      "10 سنوات في شركات صيانة التكييف.", 100, "visit"]],
    reviews: [[5, "المكيف صار يبرد ممتاز"]],
  },
];

const insUser = db.prepare(
  `INSERT INTO users (name, phone, password_hash, bio, city, languages, iban, lat, lng, available, is_admin, created_at, last_seen_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
);
const insSvc = db.prepare(
  `INSERT INTO services (user_id, category_id, title, description, skills, experience_years, experience_note, price, unit, mode, city, active, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
);
const insOrder = db.prepare(
  `INSERT INTO orders (service_id, customer_id, provider_id, title, mode, unit, qty, unit_price, price, fee, total, description,
     status, created_at, updated_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`
);
const insReview = db.prepare(
  "INSERT INTO reviews (order_id, service_id, provider_id, customer_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
);

tx(db, () => {
  const ids = people.map((p, i) =>
    Number(
      insUser.run(p.name, p.phone, hash, p.bio || "", p.city, JSON.stringify(p.langs || []),
        p.services ? "SA0380000000608010167519" : "", p.lat ?? null, p.lng ?? null, p.admin || 0,
        now - (60 - i) * DAY, now - (i % 3) * 3600000).lastInsertRowid
    )
  );
  const customer = ids[1];
  people.forEach((p, i) => {
    (p.services || []).forEach((s, k) => {
      const [cat, mode, title, desc, skills, years, note, price, unit] = s;
      const sid = Number(insSvc.run(ids[i], cat, title, desc, JSON.stringify(skills), years, note, price * 100, unit, mode, p.city, now - 40 * DAY).lastInsertRowid);
      if (k !== 0) return;
      // طلبات مكتملة سابقة مع تقييمات (بيانات عرض فقط).
      (p.reviews || []).forEach(([rating, comment], j) => {
        const t = now - (20 - j) * DAY;
        const fee = Math.max(100, Math.round(price * 100 * cfg.platformFeeRate));
        const oid = Number(insOrder.run(sid, customer, ids[i], title, mode, unit, price * 100, price * 100, fee, price * 100 + fee, "طلب سابق", t, t, t).lastInsertRowid);
        insReview.run(oid, sid, ids[i], customer, rating, comment, t);
      });
    });
  });
});

console.log("تمت إضافة البيانات التجريبية. كلمة المرور لكل الحسابات:", PASSWORD);
console.log("  المشرف: 0500000000   عميل: 0500000001   مبرمج: 0500000002   ميكانيكي: 0500000004");
