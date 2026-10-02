"use strict";
// حسابات المال كدوال نقية (بدون قاعدة بيانات) لسهولة اختبارها.
const cfg = require("./config");

const DAY = 86400000;

function feeFor(price) {
  return Math.max(cfg.platformFeeMin, Math.round(price * cfg.platformFeeRate));
}

function quote(unitPrice, qty) {
  const price = unitPrice * qty;
  const fee = feeFor(price);
  return { price, fee, total: price + fee };
}

// كيف يُوزَّع سعر الخدمة المحتجز عند إغلاق الطلب. رسوم التطبيق لا تُسترد في أي حالة.
//   refund: ما يُعاد لصاحب الطلب   provider: ما يُضاف لأرباح مقدم الخدمة (محتجزاً حتى موعد الصرف)
function settlement(kind, price) {
  switch (kind) {
    case "completed":
      return { refund: 0, provider: price, earningKind: "service" };
    case "customer_late": {
      const comp = Math.round(price * cfg.lateCancelCompensationRate);
      return { refund: price - comp, provider: comp, earningKind: "compensation" };
    }
    case "customer_early": // ألغى صاحب الطلب قبل تحرّك مقدم الخدمة
    case "provider_declined": // رفض مقدم الخدمة الطلب
    case "provider_failed": // لم يستطع إكمال العمل أو فشل الإصلاح
    case "dispute_refund": // حكم المشرف لصالح صاحب الطلب
    case "expired": // لم يُقبل الطلب في الوقت المحدد
      return { refund: price, provider: 0, earningKind: null };
    default:
      throw new Error("unknown settlement kind: " + kind);
  }
}

// دورات الصرف ثابتة تبدأ من payoutAnchor وتتكرر كل payoutIntervalDays.
function lastPayoutBoundary(now) {
  const anchor = Date.parse(cfg.payoutAnchor);
  const step = cfg.payoutIntervalDays * DAY;
  return anchor + Math.floor((now - anchor) / step) * step;
}

function nextPayoutAt(now) {
  return lastPayoutBoundary(now) + cfg.payoutIntervalDays * DAY;
}

module.exports = { feeFor, quote, settlement, lastPayoutBoundary, nextPayoutAt, DAY };
