"use strict";
// كل قواعد العمل والإعدادات في مكان واحد. يمكن تغيير أي قيمة عبر متغيرات البيئة.

const env = process.env;
const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

module.exports = {
  port: num(env.PORT, 3000),
  dbFile: env.DB_FILE || require("node:path").join(__dirname, "..", "data", "majlis.db"),
  currency: env.CURRENCY || "SAR",

  // رسوم التطبيق: نسبة تُضاف على سعر الخدمة وتُدفع مع الطلب، ولا تُسترد إطلاقاً.
  platformFeeRate: num(env.PLATFORM_FEE_RATE, 0.05),
  // حد أدنى للرسوم بالهللة (100 هللة = 1 ريال).
  platformFeeMin: num(env.PLATFORM_FEE_MIN, 100),

  // إذا ألغى صاحب الطلب بعد أن تحرّك مقدم الخدمة نحو الموقع (أو بدأ العمل)،
  // يُحوَّل هذا الجزء من سعر الخدمة لمقدم الخدمة تعويضاً، ويُعاد الباقي لصاحب الطلب.
  lateCancelCompensationRate: num(env.LATE_CANCEL_RATE, 0.1),

  // صرف الأرباح المحتجزة: كل 7 أيام (أو 14 لكل أسبوعين).
  payoutIntervalDays: num(env.PAYOUT_INTERVAL_DAYS, 7),
  // نقطة البداية لدورات الصرف: الجمعة 00:00 بتوقيت الرياض = نهاية الخميس (آخر أيام الأسبوع).
  payoutAnchor: env.PAYOUT_ANCHOR || "2026-01-01T21:00:00.000Z",

  // يُلغى الطلب ويُسترد المبلغ تلقائياً إن لم يقبله مقدم الخدمة خلال هذه المدة.
  requestTimeoutHours: num(env.REQUEST_TIMEOUT_HOURS, 24),
  // يُعتبر الطلب مكتملاً تلقائياً إن لم يؤكد العميل أو يعترض خلال هذه المدة بعد التسليم.
  autoConfirmHours: num(env.AUTO_CONFIRM_HOURS, 48),

  // يُعتبر المستخدم "متصلاً الآن" إذا كان التطبيق مفتوحاً لديه أو ظهر خلال هذه المدة.
  onlineWindowSeconds: num(env.ONLINE_WINDOW_SECONDS, 90),

  // الشرط الوحيد لتقديم خدمة: الخبرة.
  minExperienceYears: num(env.MIN_EXPERIENCE_YEARS, 1),

  sessionDays: num(env.SESSION_DAYS, 30),
  paymentGateway: env.PAYMENT_GATEWAY || "mock",
  // أرقام جوال تُمنح صلاحية المشرف عند التسجيل (مفصولة بفواصل).
  adminPhones: (env.ADMIN_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean),
  secureCookies: env.SECURE_COOKIES === "1",
};
