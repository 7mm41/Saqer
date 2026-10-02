import { api, qs } from "../api.js";
import { put, h, clear, empty, skeleton, getPosition, toast } from "../ui.js";
import { state, go } from "../app.js";
import { serviceCard } from "./parts.js";

export async function homeView(root) {
  const search = h("input", { type: "search", placeholder: "ابحث: مبرمج Python، ميكانيكي، مونتاج…", "aria-label": "بحث" });
  const onSearch = (e) => {
    e.preventDefault();
    go("/browse" + qs({ q: search.value.trim() }));
  };
  const online = h("div", skeleton(3));
  const top = h("div", skeleton(2));
  put(root,
    h("section.hero",
      h("h1", "المجلس"),
      h("p", "كل صاحب خبرة يعرض خدمته، وكل صاحب حاجة يجد من يخدمه — بدون عقود ولا شروط سوى الخبرة."),
      h("form.search", { onsubmit: onSearch }, search, h("button.btn", { type: "submit" }, "بحث"))
    ),
    h("div.section-title", h("h2", "التصنيفات")),
    h("div.cats",
      state.categories.map((c) =>
        h("a.cat", { href: "#/browse" + qs({ cat: c.id }) }, h("span.ico", c.icon), h("span", c.name), h("span.n", c.count + " خدمة"))
      )
    ),
    h("div.section-title", h("h2", "🟢 متصلون الآن"), h("a.link.small", { href: "#/browse?online=1" }, "عرض الكل")),
    online,
    h("div.section-title", h("h2", "⭐ الأعلى تقييماً"), h("a.link.small", { href: "#/browse?sort=rating" }, "عرض الكل")),
    top,
    h("div.section-title"),
    h("a.card.cta", { href: state.me ? "#/me/services/new" : "#/register" },
      h("div", { style: { fontSize: "32px" } }, "🧑‍🔧"),
      h("div.grow", h("b", "عندك خبرة؟ اعرض خدماتك"), h("p.small.muted", "سجّل خبرتك وسعرك، واستقبل الطلبات، وتُصرف أرباحك كل " +
        (state.config.payoutIntervalDays === 7 ? "أسبوع" : state.config.payoutIntervalDays + " يوم") + ".")),
      h("span.btn.sm", "ابدأ")
    )
  );
  const [on, best] = await Promise.all([api.get("/services?online=1"), api.get("/services?sort=rating")]);
  put(clear(online),
    on.items.length ? h("div.scroller", on.items.slice(0, 9).map(serviceCard)) : empty("😴", "لا يوجد مقدمو خدمات متصلون الآن")
  );
  put(clear(top), h("div.grid-cards.three", best.items.slice(0, 6).map(serviceCard)));
}

export async function browseView(root, { query }) {
  const f = { q: query.q || "", cat: query.cat || "", online: query.online || "", mode: query.mode || "", sort: query.sort || "", lat: query.lat, lng: query.lng };
  const apply = (patch) => go("/browse" + qs({ ...f, ...patch }));

  const q = h("input.input.grow", { type: "search", value: f.q, placeholder: "ابحث بالاسم أو المهارة أو اللغة…", "aria-label": "بحث" });
  const cat = h("select", { "aria-label": "التصنيف", onchange: () => apply({ cat: cat.value }) },
    h("option", { value: "" }, "كل التصنيفات"),
    state.categories.map((c) => h("option", { value: c.id, selected: c.id === f.cat }, c.icon + " " + c.name))
  );
  const mode = h("select", { "aria-label": "نوع الخدمة", onchange: () => apply({ mode: mode.value }) },
    h("option", { value: "" }, "في موقعي وعن بُعد"),
    h("option", { value: "onsite", selected: f.mode === "onsite" }, "📍 يأتي لموقعي"),
    h("option", { value: "remote", selected: f.mode === "remote" }, "💻 عن بُعد")
  );
  const sort = h("select", {
    "aria-label": "الترتيب",
    onchange: async () => {
      if (sort.value === "distance" && !f.lat) {
        try {
          const p = await getPosition();
          return apply({ sort: "distance", lat: p.lat, lng: p.lng });
        } catch (e) {
          toast(e.message, "", { error: true });
          sort.value = f.sort;
          return;
        }
      }
      apply({ sort: sort.value });
    },
  },
    h("option", { value: "" }, "الترتيب: المقترح"),
    h("option", { value: "distance", selected: f.sort === "distance" }, "الأقرب لي"),
    h("option", { value: "rating", selected: f.sort === "rating" }, "الأعلى تقييماً"),
    h("option", { value: "price", selected: f.sort === "price" }, "الأقل سعراً")
  );
  const onlineSw = h("label.check", { style: { alignItems: "center" } },
    h("input", { type: "checkbox", checked: f.online === "1", onchange: (e) => apply({ online: e.target.checked ? "1" : "" }) }),
    "🟢 متصل الآن فقط"
  );
  const results = h("div", skeleton(4));
  const current = state.categories.find((c) => c.id === f.cat);
  put(root,
    h("div.page-head", h("h1", current ? current.icon + " " + current.name : "تصفّح الخدمات")),
    h("form.toolbar", { onsubmit: (e) => (e.preventDefault(), apply({ q: q.value.trim() })) },
      q, h("button.btn.sm", { type: "submit" }, "بحث")),
    h("div.toolbar", { style: { marginTop: "10px" } }, cat, mode, sort, onlineSw),
    h("div", { style: { marginTop: "16px" } }, results)
  );
  const { items } = await api.get("/services" + qs(f));
  put(clear(results),
    items.length
      ? h("div.stack", h("p.small.muted", items.length + " نتيجة"), h("div.grid-cards.three", items.map(serviceCard)))
      : empty("🔍", "لا توجد نتائج مطابقة. جرّب كلمات أخرى أو أزل بعض الفلاتر.",
          h("a.btn.ghost", { href: "#/browse" }, "مسح الفلاتر"))
  );
}
