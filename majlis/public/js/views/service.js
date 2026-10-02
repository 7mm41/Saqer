import { api } from "../api.js";
import { put, h, avatar, stars, sar, onlineLabel, dateFmt, timeAgo, empty } from "../ui.js";
import { state } from "../app.js";
import { serviceCard, unitLabel, modeLabel, years, backLink } from "./parts.js";

function reviewList(reviews) {
  if (!reviews.length) return h("p.muted.small", "لا توجد تقييمات بعد.");
  return h("div.list", reviews.map((r) =>
    h("div",
      h("div.row.between", h("b", r.customer_name), h("span.stars", "★".repeat(r.rating) + "☆".repeat(5 - r.rating))),
      r.service_title ? h("div.tiny.muted", r.service_title) : null,
      r.comment ? h("p.small", r.comment) : null,
      h("div.tiny.muted", timeAgo(r.created_at))
    )));
}

export async function serviceView(root, { params }) {
  const { service: s, provider: p, reviews } = await api.get("/services/" + params.id);
  const mine = state.me && state.me.id === p.id;
  const canOrder = s.active && p.available && !mine;
  put(root,
    h("div.narrow.stack.loose",
      h("div", backLink("#/browse")),
      h("div.card.stack",
        h("div.chips", h("span.chip.accent", s.category.icon + " " + s.category.name), h("span.chip", modeLabel(s.mode))),
        h("h1", { style: { fontSize: "24px" } }, s.title),
        h("div.row.wrap", stars(s.rating, s.reviews_count), s.completed_count ? h("span.small.muted", "✅ " + s.completed_count + " طلب منجز") : null),
        s.description ? h("p", { style: { whiteSpace: "pre-wrap" } }, s.description) : null,
        h("div.card.flat", { style: { background: "var(--gold-soft)", borderColor: "transparent" } },
          h("b", "🏅 الخبرة: " + years(s.experience_years)),
          h("p.small", { style: { whiteSpace: "pre-wrap", marginTop: "4px" } }, s.experience_note)
        ),
        s.skills.length ? h("div.stack.tight", h("b.small", s.category.id === "programming" ? "اللغات والتقنيات" : "المهارات"),
          h("div.chips", s.skills.map((k) => h("span.chip", { dir: "auto" }, k)))) : null,
        h("div.row.between", { style: { marginTop: "6px" } },
          h("span.price", { style: { fontSize: "22px" } }, sar(s.price), h("small", " " + unitLabel(s.unit))),
          h("span.small.muted", "+ رسوم التطبيق " + Math.round(state.config.feeRate * 100) + "%")
        )
      ),
      h("a.card.tap", { href: "#/u/" + p.id },
        h("div.row",
          avatar(p, "", p.online),
          h("div.grow", h("b", p.name), h("div.small", onlineLabel(p), p.city ? h("span.muted", " · " + p.city) : null)),
          h("span.small.muted", "الملف ←")
        ),
        p.languages.length ? h("div.chips", { style: { marginTop: "10px" } }, p.languages.map((l) => h("span.chip", "🗣️ " + l))) : null
      ),
      h("div.notice",
        h("span.ico", "🛡️"),
        h("div.small",
          h("b", "مبلغك محمي: "),
          "يُحتجز داخل التطبيق ولا يصل لمقدم الخدمة إلا بعد تأكيدك اكتمال العمل. إن تعذّر الإصلاح يُعاد لك سعر الخدمة. ",
          h("a.link", { href: "#/policy" }, "السياسة كاملة")
        )
      ),
      h("div.stack", h("h2", { style: { fontSize: "18px" } }, "التقييمات"), reviewList(reviews)),
      h("div.sticky-cta",
        mine
          ? h("a.btn.block.ghost", { href: "#/me/services/" + s.id, style: { background: "var(--card)" } }, "تعديل خدمتي")
          : canOrder
            ? h("a.btn.block", { href: "#/book/" + s.id }, "اطلب الخدمة — " + sar(s.price))
            : h("button.btn.block", { disabled: true }, "غير متاح لاستقبال الطلبات حالياً")
      )
    )
  );
}

export async function profileView(root, { params }) {
  const { user: u, services, reviews } = await api.get("/users/" + params.id);
  put(root,
    h("div.stack.loose",
      h("div.card.stack",
        h("div.profile-head",
          avatar(u, "lg", u.online),
          h("div.grow.stack.tight",
            h("h1", { style: { fontSize: "22px" } }, u.name),
            h("div.small", onlineLabel(u), u.city ? h("span.muted", " · 📍 " + u.city) : null),
            h("div.row.wrap.small", stars(u.rating, u.reviews_count),
              h("span.muted", "✅ " + u.completed_count + " منجز"), h("span.muted", "عضو منذ " + dateFmt(u.member_since)))
          )
        ),
        u.bio ? h("p", u.bio) : null,
        u.languages.length ? h("div.chips", u.languages.map((l) => h("span.chip", "🗣️ " + l))) : null
      ),
      h("div.section-title", h("h2", "الخدمات")),
      services.length ? h("div.grid-cards.three", services.map(serviceCard)) : empty("🧰", "لا توجد خدمات معروضة"),
      h("div.section-title", h("h2", "آراء العملاء")),
      h("div.card", reviewList(reviews))
    )
  );
}
