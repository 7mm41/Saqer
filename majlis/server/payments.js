"use strict";
// بوابة الدفع. البوابة التجريبية (mock) تنجح فوراً بدون بطاقة حقيقية.
// لربط بوابة حقيقية (ميسّر Moyasar، تاب Tap، Stripe…) نفّذ نفس الواجهة:
//   charge({ amount, currency, description, metadata }) -> { ref }
//   refund({ ref, amount }) -> { ok }
// المبالغ دائماً بالهللة. في البوابات الحقيقية يتم الدفع عبر نموذج البوابة المستضاف ثم
// يؤكَّد بواسطة webhook، والاسترداد الجزئي مدعوم لديها جميعاً.
const crypto = require("node:crypto");

const gateways = {
  mock: {
    name: "mock",
    charge() {
      return { ref: "mock_" + crypto.randomBytes(8).toString("hex") };
    },
    refund() {
      return { ok: true };
    },
  },
};

function getGateway(name) {
  const g = gateways[name];
  if (!g) throw new Error("payment gateway not configured: " + name);
  return g;
}

// الاستردادات تُسجَّل داخل نفس معاملة قاعدة البيانات التي تغلق الطلب (refund_pending)،
// ثم تُرسل للبوابة بعد الحفظ. إن فشلت البوابة تبقى معلّقة ويعيد المجدول المحاولة.
function processPendingRefunds(db) {
  const pending = db.prepare("SELECT * FROM payments WHERE status = 'refund_pending'").all();
  const done = db.prepare("UPDATE payments SET status = 'refunded' WHERE id = ? AND status = 'refund_pending'");
  for (const p of pending) {
    try {
      getGateway(p.gateway).refund({ ref: p.gateway_ref, amount: p.refunded });
      done.run(p.id);
    } catch (e) {
      console.error("refund failed for payment", p.id, e.message);
    }
  }
}

module.exports = { getGateway, processPendingRefunds };
