import { api, qs } from "../api.js";
import { put, h, clear, sar, field, avatar, sheet, toast, getPosition, osmEmbed } from "../ui.js";
import { state, go } from "../app.js";
import { unitLabel, modeLabel, pct, backLink } from "./parts.js";

export function policyList(c = state.config) {
  return h("ul.rules",
    h("li", "يُحتجز المبلغ داخل التطبيق ولا يُحوَّل لمقدم الخدمة إلا بعد تأكيدك اكتمال العمل (أو تلقائياً بعد " + c.autoConfirmHours + " ساعة من التسليم دون اعتراض)."),
    h("li", "إن ألغيت قبل تحرّك مقدم الخدمة، أو اعتذر هو، أو تعذّر عليه إكمال العمل/الإصلاح: يُعاد لك سعر الخدمة كاملاً."),
    h("li", "إن ألغيت بعد أن تحرّك مقدم الخدمة نحو موقعك (أو بدأ العمل): يحصل على " + pct(c.lateCancelRate) + " من سعر الخدمة تعويضاً ويُعاد لك الباقي."),
    h("li", h("b", "رسوم التطبيق (" + pct(c.feeRate) + ") لا تُسترد في أي حالة.")),
    h("li", "إن لم يقبل مقدم الخدمة طلبك خلال " + c.requestTimeoutHours + " ساعة يُلغى ويُعاد لك سعر الخدمة.")
  );
}

export async function bookView(root, { params }) {
  const { service: s, provider: p } = await api.get("/services/" + params.id);
  const hourly = s.unit === "hour" || s.unit === "session";
  let qty = 1;
  let loc = null;

  const breakdown = h("div");
  async function updateQuote() {
    const qt = await api.get("/quote" + qs({ serviceId: s.id, qty }));
    put(clear(breakdown),
      h("div.kv", h("span", "سعر الخدمة" + (hourly ? ` (${qty} × ${sar(s.price)})` : "")), h("b", sar(qt.price))),
      h("div.kv", h("span", "رسوم التطبيق ", h("span.chip.gold", "غير مستردة")), h("b", sar(qt.fee))),
      h("div.kv.total", h("span", "الإجمالي"), h("span", sar(qt.total)))
    );
    return qt;
  }

  const qtyOut = h("output", "1");
  const qtyBox = hourly
    ? field(s.unit === "hour" ? "عدد الساعات" : "عدد الجلسات",
        h("div.qty",
          h("button", { type: "button", "aria-label": "زيادة", onclick: () => { qty = Math.min(100, qty + 1); qtyOut.value = qty; updateQuote(); } }, "+"),
          qtyOut,
          h("button", { type: "button", "aria-label": "إنقاص", onclick: () => { qty = Math.max(1, qty - 1); qtyOut.value = qty; updateQuote(); } }, "−")
        ))
    : null;

  const desc = h("textarea", { name: "description", required: true, minlength: 5, maxlength: 2000,
    placeholder: s.mode === "onsite" ? "صف المشكلة: مثال — السيارة لا تشتغل وصوت طقطقة عند التشغيل" : "صف ما تحتاجه بالتفصيل" });
  const address = h("input", { name: "address", maxlength: 300, placeholder: "المدينة، الحي، الشارع، علامة مميزة", value: state.me.city || "" });
  const mapBox = h("div");
  const locBtn = h("button.btn.sm.soft", { type: "button", onclick: async () => {
    locBtn.disabled = true;
    try {
      loc = await getPosition();
      put(clear(mapBox), osmEmbed(loc.lat, loc.lng), h("p.tiny.muted", "✓ تم تحديد موقعك وسيظهر لمقدم الخدمة بعد الدفع"));
    } catch (e) {
      toast(e.message, "", { error: true });
    }
    locBtn.disabled = false;
  } }, "📍 استخدم موقعي الحالي");
  const when = h("input", { type: "datetime-local", name: "when" });
  const agree = h("input", { type: "checkbox", required: true });
  const err = h("p.form-error", { hidden: true });
  const submit = h("button.btn.block", { type: "submit" }, "متابعة للدفع");

  async function onSubmit(e) {
    e.preventDefault();
    err.hidden = true;
    submit.disabled = true;
    try {
      const { order } = await api.post("/orders", {
        serviceId: s.id,
        qty,
        description: desc.value,
        address: s.mode === "onsite" ? address.value : undefined,
        lat: loc && loc.lat,
        lng: loc && loc.lng,
        scheduledAt: when.value ? new Date(when.value).toISOString() : undefined,
      });
      paySheet(order);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
    submit.disabled = false;
  }

  put(root,
    h("div.narrow.stack.loose",
      h("div", backLink("#/service/" + s.id), h("h1", { style: { fontSize: "22px" } }, "طلب خدمة")),
      h("div.card.row",
        avatar(p, "sm", p.online),
        h("div.grow", h("b", s.title), h("div.small.muted", p.name + " · " + modeLabel(s.mode))),
        h("span.price", sar(s.price), h("small", " " + unitLabel(s.unit)))
      ),
      h("form.card.form-grid", { onsubmit: onSubmit },
        qtyBox,
        field("وصف الطلب", desc),
        s.mode === "onsite"
          ? h("div.stack", field("العنوان", address, "سيذهب مقدم الخدمة إلى موقعك"), h("div", locBtn), mapBox)
          : null,
        field("الموعد المفضل", when, "اتركه فارغاً لأقرب وقت"),
        h("div.stack.tight", h("b", "ملخص الدفع"), breakdown),
        h("div.notice.warn", h("span.ico", "📜"), h("div", h("b", "سياسة الإلغاء والاسترداد"), policyList())),
        h("label.check", agree, "قرأت سياسة الإلغاء والاسترداد وأوافق عليها"),
        err,
        submit
      )
    )
  );
  await updateQuote();
}

// بوابة الدفع التجريبية. عند ربط بوابة حقيقية (ميسّر/تاب/Stripe) يُستبدل هذا بنموذج البوابة.
function paySheet(order) {
  sheet("الدفع", (close) => {
    const btn = h("button.btn.block", {
      onclick: async () => {
        btn.disabled = true;
        try {
          await api.post(`/orders/${order.id}/pay`);
          close();
          toast("تم الدفع ✅", "المبلغ محتجز في التطبيق حتى اكتمال الخدمة");
          go("/order/" + order.id);
        } catch (e) {
          toast(e.message, "", { error: true });
          btn.disabled = false;
        }
      },
    }, "ادفع " + sar(order.total));
    return h("div.stack",
      h("div.kv", h("span", "سعر الخدمة"), h("b", sar(order.price))),
      h("div.kv", h("span", "رسوم التطبيق (غير مستردة)"), h("b", sar(order.fee))),
      h("div.kv.total", h("span", "الإجمالي"), h("span", sar(order.total))),
      state.config.gateway === "mock"
        ? h("div.pay-mock", h("b", "💳 بوابة دفع تجريبية"), h("p.small.muted", "وضع التجربة: لن يُخصم أي مبلغ حقيقي. في الإنتاج تُربط بوابة مثل مدى/Apple Pay عبر ميسّر أو تاب."))
        : null,
      btn,
      h("p.tiny.muted", { style: { textAlign: "center" } }, "🛡️ يُحتجز المبلغ داخل التطبيق ولا يُصرف لمقدم الخدمة إلا بعد اكتمال العمل")
    );
  });
}
