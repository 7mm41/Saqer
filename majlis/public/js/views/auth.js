import { api } from "../api.js";
import { put, h, field } from "../ui.js";
import { setUser, go } from "../app.js";

function authForm(root, { title, sub, fields, submitLabel, endpoint, footer, next }) {
  const err = h("p.form-error", { hidden: true });
  const btn = h("button.btn.block", { type: "submit" }, submitLabel);
  put(root,
    h("div.narrow", { style: { maxWidth: "420px" } },
      h("div.card.stack.loose", { style: { marginTop: "20px" } },
        h("div", { style: { textAlign: "center" } }, h("img", { src: "/icon.svg", width: 56, height: 56, alt: "" }), h("h1", { style: { fontSize: "22px", marginTop: "8px" } }, title), h("p.small.muted", sub)),
        h("form.form-grid", {
          onsubmit: async (e) => {
            e.preventDefault();
            err.hidden = true;
            btn.disabled = true;
            const body = Object.fromEntries(Object.entries(fields).map(([k, [, input]]) => [k, input.value]));
            try {
              const { user } = await api.post(endpoint, body);
              await setUser(user);
              go(next || "/");
            } catch (ex) {
              err.textContent = ex.message;
              err.hidden = false;
            }
            btn.disabled = false;
          },
        }, Object.values(fields).map(([label, input, hint]) => field(label, input, hint)), err, btn),
        h("p.small", { style: { textAlign: "center" } }, footer)
      )
    )
  );
}

const phoneInput = () => h("input", { type: "tel", required: true, dir: "ltr", placeholder: "05xxxxxxxx", autocomplete: "tel", inputmode: "tel" });

export function loginView(root, { query }) {
  authForm(root, {
    title: "تسجيل الدخول",
    sub: "أهلاً بعودتك إلى المجلس",
    endpoint: "/auth/login",
    submitLabel: "دخول",
    next: query.next,
    fields: {
      phone: ["رقم الجوال", phoneInput()],
      password: ["كلمة المرور", h("input", { type: "password", required: true, autocomplete: "current-password" })],
    },
    footer: ["ليس لديك حساب؟ ", h("a.link", { href: "#/register" + (query.next ? "?next=" + encodeURIComponent(query.next) : "") }, "أنشئ حساباً")],
  });
}

export function registerView(root, { query }) {
  authForm(root, {
    title: "إنشاء حساب",
    sub: "حساب واحد لطلب الخدمات وتقديمها",
    endpoint: "/auth/register",
    submitLabel: "إنشاء الحساب",
    next: query.next || "/me",
    fields: {
      name: ["الاسم", h("input", { required: true, minlength: 2, maxlength: 60, autocomplete: "name" })],
      phone: ["رقم الجوال", phoneInput()],
      city: ["المدينة", h("input", { maxlength: 60, placeholder: "مثال: الرياض" })],
      password: ["كلمة المرور", h("input", { type: "password", required: true, minlength: 8, autocomplete: "new-password" }), "8 أحرف على الأقل"],
    },
    footer: ["لديك حساب؟ ", h("a.link", { href: "#/login" }, "سجّل الدخول")],
  });
}
