// مكوّنات مشتركة بين الصفحات.
import { h, avatar, stars, sar, onlineLabel } from "../ui.js";
import { state } from "../app.js";

export const STATUS = {
  pending_payment: ["بانتظار الدفع", "neutral"],
  requested: ["بانتظار قبول مقدم الخدمة", "wait"],
  accepted: ["تم القبول", "go"],
  on_the_way: ["في الطريق", "go"],
  in_progress: ["جارٍ التنفيذ", "go"],
  delivered: ["تم التسليم — بانتظار التأكيد", "wait"],
  disputed: ["نزاع قيد المراجعة", "bad"],
  completed: ["مكتمل", "ok"],
  cancelled: ["ملغي", "neutral"],
  abandoned: ["لم يكتمل الدفع", "neutral"],
};

export const CANCEL_KINDS = {
  customer_early: "ألغاه صاحب الطلب قبل تحرّك مقدم الخدمة",
  customer_late: "ألغاه صاحب الطلب بعد تحرّك مقدم الخدمة",
  provider_declined: "اعتذر مقدم الخدمة عن الطلب",
  provider_failed: "تعذّر على مقدم الخدمة إكمال العمل",
  dispute_refund: "استرداد بقرار المشرف بعد النزاع",
  expired: "لم يُقبل الطلب خلال المهلة",
};

export function statusPill(status) {
  const [label, tone] = STATUS[status] || [status, "neutral"];
  return h("span.pill." + tone, label);
}

export const unitLabel = (unit) => (state.config && state.config.units[unit]) || "";
export const modeLabel = (mode) => (mode === "onsite" ? "📍 في موقعك" : "💻 عن بُعد");
export const pct = (r) => Math.round(r * 100) + "%";
export function qtyLabel(n, unit) {
  const [one, two, few] = unit === "session" ? ["جلسة واحدة", "جلستان", "جلسات"] : ["ساعة واحدة", "ساعتان", "ساعات"];
  return n === 1 ? one : n === 2 ? two : n <= 10 ? n + " " + few : n + " " + one.split(" ")[0];
}
export const years = (n) => (n === 1 ? "سنة واحدة" : n === 2 ? "سنتان" : n <= 10 ? n + " سنوات" : n + " سنة");

export function serviceCard(s) {
  const p = s.provider;
  return h("a.card.tap.svc", { href: "#/service/" + s.id },
    h("div.row",
      avatar(p, "", p.online),
      h("div.grow",
        h("div.row.between", h("b.ellipsis", p.name), stars(s.rating, s.reviews_count)),
        h("div.row.between.small", onlineLabel(p), h("span.muted.ellipsis", p.city || s.city))
      )
    ),
    h("h3", s.title),
    h("div.chips",
      h("span.chip.accent", s.category.icon + " " + s.category.name),
      s.skills.slice(0, 3).map((k) => h("span.chip", { dir: "auto" }, k)),
      s.skills.length > 3 ? h("span.chip", "+" + (s.skills.length - 3)) : null
    ),
    h("div.meta",
      h("span", "🏅 خبرة " + years(s.experience_years)),
      h("span", modeLabel(s.mode)),
      s.completed_count ? h("span", "✅ " + s.completed_count + " منجز") : null,
      s.distance_km !== null && s.distance_km !== undefined ? h("span", "📏 " + s.distance_km + " كم") : null
    ),
    h("div.foot",
      h("span.price", sar(s.price), h("small", " " + unitLabel(s.unit))),
      h("span.btn.sm.soft", "التفاصيل")
    )
  );
}

export function backLink(href, label = "رجوع") {
  return h("a.back", { href, onclick: (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } } }, "→ " + label);
}
