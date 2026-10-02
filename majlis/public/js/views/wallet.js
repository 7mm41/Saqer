import { api, qs } from "../api.js";
import { put, h, clear, sar, num, dateFmt, timeAgo, countdown, empty, toast, confirmSheet, skeleton } from "../ui.js";
import { state, go } from "../app.js";
import { statusPill, pct, CANCEL_KINDS } from "./parts.js";
import { policyList } from "./book.js";

const cycleName = (d) => (d === 7 ? "أسبوع" : d === 14 ? "أسبوعين" : d + " يوم");

export async function walletView(root) {
  const w = await api.get("/wallet");
  const paymentStatus = (p) =>
    p.status === "held" ? h("span.pill.wait", "محتجز") :
    p.status === "settled" ? h("span.pill.ok", "حُوِّل لمقدم الخدمة") :
    h("span.pill.go", "مُسترد " + sar(p.refunded));
  put(root,
    h("div.page-head", h("h1", "المحفظة")),
    h("div.stats",
      h("div.card.stat.accent", h("div.label", "أرباح محتجزة"), h("div.value", sar(w.held)), h("div.tiny", "تُصرف " + dateFmt(w.nextPayoutAt) + " (" + countdown(w.nextPayoutAt) + ")")),
      h("div.card.stat", h("div.label", "في طلبات جارية"), h("div.value", sar(w.inProgress)), h("div.tiny.muted", "تُضاف بعد تأكيد العملاء")),
      h("div.card.stat", h("div.label", "إجمالي ما تم صرفه"), h("div.value", sar(w.paidOut)))
    ),
    h("div.notice", { style: { marginTop: "14px" } }, h("span.ico", "🗓️"),
      h("span.small", `تُحتجز الأرباح داخل التطبيق وتُصرف لحسابك البنكي نهاية كل ${cycleName(w.payoutIntervalDays)}. هذا يحمي العملاء ويتيح حل أي اعتراض قبل الصرف.`)),
    !w.hasIban && (w.held || w.inProgress)
      ? h("div.notice.warn", { style: { marginTop: "10px" } }, h("span.ico", "⚠️"), h("span.small", "أضف رقم الآيبان لتصلك أرباحك. ", h("a.link", { href: "#/me" }, "إضافة الآيبان")))
      : null,
    h("div.section-title", h("h2", "الأرباح")),
    h("div.card", w.earnings.length
      ? h("div.list", w.earnings.map((e) =>
          h("a.row.between", { href: "#/order/" + e.order_id },
            h("div.grow", h("div.ellipsis", e.title), h("div.tiny.muted", (e.kind === "compensation" ? "تعويض إلغاء · " : "") + timeAgo(e.created_at))),
            h("div", { style: { textAlign: "left" } }, h("b", "+" + sar(e.amount)), h("div", e.status === "held" ? h("span.pill.wait", "محتجز") : h("span.pill.ok", "صُرف"))))))
      : empty("💼", "لا توجد أرباح بعد")),
    w.payouts.length ? h("div.section-title", h("h2", "عمليات الصرف")) : null,
    w.payouts.length ? h("div.card", h("div.list", w.payouts.map((p) =>
      h("div.row.between", h("div", h("b", sar(p.amount)), h("div.tiny.muted", dateFmt(p.created_at))), h("span.small.muted.ltr", p.iban))))) : null,
    h("div.section-title", h("h2", "مدفوعاتي")),
    h("div.card", w.payments.length
      ? h("div.list", w.payments.map((p) =>
          h("a.row.between", { href: "#/order/" + p.order_id },
            h("div.grow", h("div.ellipsis", p.title), h("div.tiny.muted", timeAgo(p.created_at) + " · منها رسوم " + sar(p.fee))),
            h("div", { style: { textAlign: "left" } }, h("b", sar(p.amount)), h("div", paymentStatus(p))))))
      : empty("🧾", "لم تدفع لأي طلب بعد"))
  );
}

export async function adminView(root) {
  const body = h("div", skeleton(4));
  put(root, h("div.page-head", h("h1", "🛡️ لوحة المشرف"),
    h("button.btn", {
      onclick: async () => {
        const ok = await confirmSheet({ title: "صرف الأرباح الآن؟", body: "سيُصرف كل ما هو محتجز من أرباح مقدمي الخدمات (ممن أضافوا الآيبان) دون انتظار نهاية الدورة.", ok: "صرف الآن" });
        if (!ok) return;
        const { run } = await api.post("/admin/payouts/run");
        toast("تم الصرف", `${run.count} مقدم خدمة · ${sar(run.total)}` + (run.skipped.length ? ` · ${run.skipped.length} بدون آيبان` : ""));
        go("/admin");
      },
    }, "💸 صرف الأرباح الآن")), body);

  const [s, disputes, recent, runs] = await Promise.all([
    api.get("/admin/summary"), api.get("/admin/orders" + qs({ status: "disputed" })), api.get("/admin/orders"), api.get("/admin/payouts"),
  ]);
  const stat = (label, value, cls = "") => h("div.card.stat" + cls, h("div.label", label), h("div.value", value));
  const row = (o) =>
    h("a.row.between", { href: "#/order/" + o.id },
      h("div.grow", h("div.ellipsis", "#" + o.id + " " + o.title), h("div.tiny.muted", o.customer_name + " ← " + o.provider_name + " · " + timeAgo(o.updated_at)),
        o.dispute_reason && o.status === "disputed" ? h("div.small", "«" + o.dispute_reason + "»") : null,
        o.cancel_kind ? h("div.tiny.muted", CANCEL_KINDS[o.cancel_kind]) : null),
      h("div", { style: { textAlign: "left" } }, h("b", sar(o.price)), h("div", statusPill(o.status))));
  put(clear(body),
    h("div.stats",
      stat("رسوم التطبيق المحصّلة", sar(s.feesRevenue), ".accent"),
      stat("قيمة الخدمات المكتملة", sar(s.gmv)),
      stat("محتجز في طلبات مفتوحة", sar(s.escrowOpen)),
      stat("أرباح بانتظار الصرف", sar(s.earningsHeld)),
      stat("إجمالي المُسترد", sar(s.refunded)),
      stat("إجمالي المصروف", sar(s.paidOut)),
      stat("المستخدمون", num(s.users)),
      stat("مقدمو الخدمات", num(s.providers))
    ),
    h("p.small.muted", { style: { marginTop: "8px" } }, "الصرف التلقائي القادم: " + dateFmt(s.nextPayoutAt) + " (" + countdown(s.nextPayoutAt) + ")"),
    h("div.section-title", h("h2", "⚖️ نزاعات بانتظار الحسم (" + disputes.items.length + ")")),
    h("div.card", disputes.items.length ? h("div.list", disputes.items.map(row)) : empty("✅", "لا توجد نزاعات")),
    h("div.section-title", h("h2", "أحدث الطلبات")),
    h("div.card", recent.items.length ? h("div.list", recent.items.slice(0, 30).map(row)) : empty("🧾", "لا توجد طلبات")),
    h("div.section-title", h("h2", "دورات الصرف")),
    h("div.card", runs.items.length
      ? h("div.list", runs.items.map((r) => h("div.row.between", h("div", h("b", dateFmt(r.period_end)), h("div.tiny.muted", r.count + " مقدم خدمة")), h("b", sar(r.total)))))
      : empty("🗓️", "لم تتم أي دورة صرف بعد"))
  );
}

export function policyView(root) {
  const c = state.config;
  put(root,
    h("div.narrow.stack.loose",
      h("h1", { style: { fontSize: "24px" } }, "📜 الأحكام وسياسة الاسترداد"),
      h("div.card.stack",
        h("h2", { style: { fontSize: "18px" } }, "فكرة المجلس"),
        h("p", "كل مستخدم يستطيع أن يطلب الخدمات وأن يقدّمها. العمل شخصي ومباشر بين الطرفين بدون عقود ولا شروط، والشرط الوحيد لعرض خدمة هو الخبرة (" + c.minExperienceYears + " سنة على الأقل مع وصف لها). يأخذ التطبيق عمولة بسيطة فقط.")
      ),
      h("div.card.stack",
        h("h2", { style: { fontSize: "18px" } }, "الدفع والاحتجاز"),
        h("ul.rules",
          h("li", `يدفع صاحب الطلب سعر الخدمة + رسوم التطبيق (${pct(c.feeRate)}، بحد أدنى ${sar(c.feeMin)}) عبر التطبيق.`),
          h("li", "يُحتجز المبلغ داخل التطبيق، ولا يُضاف لأرباح مقدم الخدمة إلا بعد تأكيد صاحب الطلب اكتمال العمل."),
          h("li", `أرباح مقدمي الخدمات تبقى محتجزة وتُصرف لحساباتهم البنكية نهاية كل ${cycleName(c.payoutIntervalDays)}.`)
        )
      ),
      h("div.card.stack",
        h("h2", { style: { fontSize: "18px" } }, "الإلغاء والاسترداد"),
        policyList(c),
        h("p.small.muted", "إذا أبلغ صاحب الطلب أن المشكلة لم تُحل، يبقى المبلغ محتجزاً: يستطيع مقدم الخدمة إعادة المحاولة أو إعادة المبلغ، وإلا يحسم المشرف النزاع.")
      )
    )
  );
}
