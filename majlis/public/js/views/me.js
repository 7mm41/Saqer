import { api } from "../api.js";
import { put, h, clear, avatar, field, toast, sar, empty, icon, getPosition, confirmSheet, stars } from "../ui.js";
import { state, go, setUser, categoryById } from "../app.js";
import { unitLabel, modeLabel, years, backLink } from "./parts.js";

export async function meView(root) {
  const me = state.me;
  const availability = h("input", {
    type: "checkbox",
    checked: me.available,
    "aria-label": "متاح لاستقبال الطلبات",
    onchange: async (e) => {
      try {
        const { user } = await api.put("/me", { available: e.target.checked });
        state.me = user;
        statusText.textContent = user.available ? "🟢 أنت متاح وتظهر «متصل الآن» للآخرين" : "⚪ لن تستقبل طلبات جديدة";
      } catch (ex) {
        e.target.checked = !e.target.checked;
        toast(ex.message, "", { error: true });
      }
    },
  });
  const statusText = h("div.small.muted", me.available ? "🟢 أنت متاح وتظهر «متصل الآن» للآخرين" : "⚪ لن تستقبل طلبات جديدة");

  const f = {
    name: h("input", { value: me.name, required: true, minlength: 2, maxlength: 60 }),
    city: h("input", { value: me.city, maxlength: 60, placeholder: "مثال: الرياض" }),
    bio: h("textarea", { maxlength: 600, placeholder: "عرّف بنفسك وبخبرتك باختصار" }),
    languages: h("input", { value: me.languages.join("، "), placeholder: "العربية، English" }),
    iban: h("input", { value: me.iban, dir: "ltr", placeholder: "SA00 0000 0000 0000 0000 0000", maxlength: 40 }),
  };
  f.bio.value = me.bio;
  let loc = me.lat !== null ? { lat: me.lat, lng: me.lng } : null;
  const locText = h("span.small.muted", loc ? "✓ تم تحديد موقعك" : "لم يُحدَّد");
  const err = h("p.form-error", { hidden: true });

  put(root,
    h("div.narrow.stack.loose",
      h("div.card.stack",
        h("div.profile-head",
          avatar(me, "lg", me.online),
          h("div.grow", h("h1", { style: { fontSize: "22px" } }, me.name), h("div.small.muted.ltr", me.phone),
            h("div.small", stars(me.rating, me.reviews_count)))
        ),
        h("div.row.between",
          h("div", h("b", "متاح لاستقبال الطلبات"), statusText),
          h("label.switch", availability, h("span"))
        )
      ),
      h("div.stack",
        h("a.card.tap.row", { href: "#/me/services" }, h("span", { style: { fontSize: "22px" } }, "🧰"), h("div.grow", h("b", "خدماتي"), h("div.small.muted", "أضف خبرتك وخدماتك وأسعارك")), h("span.muted", "←")),
        h("a.card.tap.row", { href: "#/u/" + me.id }, h("span", { style: { fontSize: "22px" } }, "👤"), h("div.grow", h("b", "ملفي كما يراه الآخرون")), h("span.muted", "←")),
        h("a.card.tap.row", { href: "#/wallet" }, h("span", { style: { fontSize: "22px" } }, "💰"), h("div.grow", h("b", "المحفظة والأرباح")), h("span.muted", "←")),
        h("a.card.tap.row", { href: "#/policy" }, h("span", { style: { fontSize: "22px" } }, "📜"), h("div.grow", h("b", "الأحكام وسياسة الاسترداد")), h("span.muted", "←")),
        me.is_admin ? h("a.card.tap.row", { href: "#/admin" }, h("span", { style: { fontSize: "22px" } }, "🛡️"), h("div.grow", h("b", "لوحة المشرف")), h("span.muted", "←")) : null
      ),
      h("form.card.form-grid", {
        onsubmit: async (e) => {
          e.preventDefault();
          err.hidden = true;
          try {
            const { user } = await api.put("/me", {
              name: f.name.value, city: f.city.value, bio: f.bio.value, languages: f.languages.value, iban: f.iban.value,
              lat: loc ? loc.lat : null, lng: loc ? loc.lng : null,
            });
            state.me = user;
            toast("تم حفظ التعديلات ✅");
          } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
          }
        },
      },
        h("b", "بياناتي"),
        field("الاسم", f.name),
        field("المدينة", f.city),
        field("نبذة", f.bio),
        field("اللغات التي أتحدثها", f.languages, "افصل بينها بفاصلة"),
        field("رقم الآيبان (IBAN)", f.iban, "لتحويل أرباحك نهاية كل دورة صرف"),
        h("div.field", h("span", "موقعي", h("span.hint", " — لعرض المسافة للعملاء القريبين (لا يظهر موقعك الدقيق)")),
          h("div.row", h("button.btn.sm.soft", { type: "button", onclick: async () => {
            try {
              loc = await getPosition();
              locText.textContent = "✓ تم تحديد موقعك — احفظ التعديلات";
            } catch (ex) {
              toast(ex.message, "", { error: true });
            }
          } }, "📍 تحديد موقعي"), locText)),
        err,
        h("button.btn", { type: "submit" }, "حفظ")
      ),
      h("button.btn.ghost", {
        onclick: async () => {
          await api.post("/auth/logout");
          await setUser(null);
          go("/");
        },
      }, icon("logout"), "تسجيل الخروج")
    )
  );
}

export async function myServicesView(root) {
  const { items } = await api.get("/me/services");
  put(root,
    h("div.page-head", h("div", backLink("#/me", "حسابي"), h("h1", "خدماتي")), h("a.btn", { href: "#/me/services/new" }, icon("plus"), "إضافة خدمة")),
    !state.me.available ? h("div.notice.warn", { style: { marginBottom: "12px" } }, h("span.ico", "⚪"), h("span", "أنت غير متاح حالياً ولن تصلك طلبات جديدة. ", h("a.link", { href: "#/me" }, "تفعيل الإتاحة"))) : null,
    items.length
      ? h("div.grid-cards", items.map((s) =>
          h("div.card.stack",
            h("div.row.between", h("span.chip.accent", s.category.icon + " " + s.category.name), s.active ? h("span.pill.ok", "معروضة") : h("span.pill.neutral", "مخفية")),
            h("b", s.title),
            h("div.small.muted", modeLabel(s.mode) + " · خبرة " + years(s.experience_years)),
            h("div.row.between", h("span.price", sar(s.price), h("small", " " + unitLabel(s.unit))), stars(s.rating, s.reviews_count)),
            h("div.row",
              h("a.btn.sm.ghost", { href: "#/me/services/" + s.id }, "تعديل"),
              h("a.btn.sm.ghost", { href: "#/service/" + s.id }, "معاينة"),
              h("button.btn.sm.danger", { onclick: async () => {
                if (!(await confirmSheet({ title: "حذف الخدمة؟", body: "إذا كانت لها طلبات سابقة ستُخفى فقط.", ok: "حذف", danger: true }))) return;
                await api.del("/services/" + s.id);
                go("/me/services");
              } }, "حذف")
            )
          )))
      : empty("🧑‍🔧", "لم تضف أي خدمة بعد. أضف خبرتك وابدأ باستقبال الطلبات.", h("a.btn", { href: "#/me/services/new" }, "إضافة خدمة"))
  );
}

export async function serviceFormView(root, { params }) {
  const editing = params.id ? (await api.get("/services/" + params.id)).service : null;
  if (editing && editing.provider.id !== state.me.id) return go("/service/" + params.id);
  const s = editing || { category: { id: "" }, title: "", description: "", skills: [], experience_years: "", experience_note: "", price: "", unit: "visit", mode: "", city: state.me.city, active: true };

  const cat = h("select", { required: true },
    h("option", { value: "" }, "اختر التصنيف"),
    state.categories.map((c) => h("option", { value: c.id, selected: c.id === s.category.id }, c.icon + " " + c.name)));
  const mode = h("select",
    h("option", { value: "onsite", selected: s.mode === "onsite" }, "📍 أذهب لموقع العميل"),
    h("option", { value: "remote", selected: s.mode === "remote" }, "💻 عن بُعد / أونلاين"));
  const modeField = field("طريقة تقديم الخدمة", mode);
  const skillsLabel = h("span", "المهارات");
  const skills = h("input", { value: s.skills.join("، "), placeholder: "مثال: كهرباء سيارات، محركات" });
  const unit = h("select", Object.entries(state.config.units).map(([k, v]) => h("option", { value: k, selected: k === s.unit }, v.replace("لل", "لكل "))));

  function onCat() {
    const c = categoryById(cat.value);
    modeField.hidden = c.mode !== "both";
    if (c.mode !== "both") mode.value = c.mode;
    const prog = cat.value === "programming";
    skillsLabel.textContent = prog ? "لغات البرمجة والتقنيات التي تتقنها" : "المهارات";
    skills.placeholder = prog ? "JavaScript، Python، React، SQL" : "مثال: كهرباء سيارات، محركات";
    if (!editing) unit.value = c.mode === "onsite" ? "visit" : cat.value === "trading" || cat.value === "tutoring" ? "session" : "project";
  }
  cat.addEventListener("change", onCat);

  const f = {
    title: h("input", { value: s.title, required: true, minlength: 3, maxlength: 80, placeholder: "مثال: صيانة كهرباء منزلية" }),
    description: h("textarea", { maxlength: 2000, placeholder: "ماذا تقدّم بالضبط؟ ماذا يشمل السعر؟" }),
    years: h("input", { type: "number", min: state.config.minExperienceYears, max: 60, required: true, value: s.experience_years, inputmode: "numeric" }),
    note: h("textarea", { required: true, minlength: 10, maxlength: 1000, placeholder: "أين اكتسبت خبرتك؟ أعمال سابقة؟ شهادات؟" }),
    price: h("input", { type: "number", min: 1, step: "0.5", required: true, value: s.price ? s.price / 100 : "", inputmode: "decimal" }),
    city: h("input", { value: s.city, maxlength: 60 }),
    active: h("input", { type: "checkbox", checked: s.active }),
  };
  f.description.value = s.description;
  f.note.value = s.experience_note;
  const err = h("p.form-error", { hidden: true });

  put(root,
    h("div.narrow.stack",
      h("div", backLink("#/me/services", "خدماتي"), h("h1", { style: { fontSize: "22px" } }, editing ? "تعديل الخدمة" : "إضافة خدمة")),
      h("div.notice", h("span.ico", "🏅"), h("span.small", h("b", "بدون عقود ولا شروط — "), "الشرط الوحيد هو الخبرة: اذكر سنوات خبرتك ووصفاً مختصراً لها.")),
      h("form.card.form-grid", {
        onsubmit: async (e) => {
          e.preventDefault();
          err.hidden = true;
          const body = {
            category: cat.value, mode: mode.value, title: f.title.value, description: f.description.value, skills: skills.value,
            experience_years: Number(f.years.value), experience_note: f.note.value, price: Number(f.price.value), unit: unit.value,
            city: f.city.value, active: f.active.checked,
          };
          try {
            const r = editing ? await api.put("/services/" + editing.id, body) : await api.post("/services", body);
            toast(editing ? "تم حفظ الخدمة ✅" : "تمت إضافة خدمتك 🎉", "ستظهر للآخرين في التصفح والبحث");
            go("/service/" + r.service.id);
          } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
          }
        },
      },
        field("التصنيف", cat),
        modeField,
        field("عنوان الخدمة", f.title),
        field("الوصف", f.description),
        h("label.field", skillsLabel, skills),
        h("div.two-col", field("سنوات الخبرة", f.years), field("المدينة", f.city)),
        field("وصف خبرتك", f.note, "مطلوب"),
        h("div.two-col", field("السعر (ريال)", f.price), field("التسعير", unit)),
        h("p.small.muted", "يدفع العميل رسوم تطبيق " + Math.round(state.config.feeRate * 100) + "% فوق سعرك، وتحصل أنت على سعرك كاملاً بعد اكتمال الطلب."),
        h("label.check", f.active, "معروضة للعملاء"),
        err,
        h("button.btn", { type: "submit" }, editing ? "حفظ" : "نشر الخدمة")
      )
    )
  );
  if (s.category.id) onCat();
  else modeField.hidden = true;
}
