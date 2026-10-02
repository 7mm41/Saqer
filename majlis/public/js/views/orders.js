import { api, qs } from "../api.js";
import { put, h, clear, sar, avatar, onlineLabel, timeAgo, dateTimeFmt, dateFmt, icon, toast, confirmSheet, empty, skeleton, osmEmbed, directionsUrl, distanceKm } from "../ui.js";
import { state, go, categoryById, refreshCounts } from "../app.js";
import { statusPill, CANCEL_KINDS, pct, qtyLabel, backLink } from "./parts.js";

// ===== قائمة الطلبات =====
export async function ordersView(root, { query, on }) {
  const as = query.as === "provider" ? "provider" : "customer";
  const st = query.state === "closed" ? "closed" : "active";
  const list = h("div", skeleton(3));
  const seg = (items, cur, key) =>
    h("div.segmented", items.map(([v, label, badge]) =>
      h("button" + (v === cur ? ".on" : ""), { type: "button", onclick: () => go("/orders" + qs({ as, state: st, [key]: v })) },
        label, badge ? h("span.dot-badge", String(badge)) : null)));
  put(root,
    h("div.page-head", h("h1", "الطلبات")),
    h("div.toolbar", seg([["customer", "طلباتي"], ["provider", "الطلبات الواردة", state.incoming]], as, "as"),
      seg([["active", "النشطة"], ["closed", "السابقة"]], st, "state")),
    h("div", { style: { marginTop: "16px" } }, list)
  );
  async function load() {
    const { items } = await api.get("/orders" + qs({ as, state: st }));
    put(clear(list),
      items.length
        ? h("div.stack", items.map((o) => {
            const cat = categoryById(o.category_id);
            return h("a.card.tap.row", { href: "#/order/" + o.id },
              h("div", { style: { fontSize: "26px" } }, cat.icon),
              h("div.grow.stack.tight",
                h("div.row.between", h("b.ellipsis", o.title), h("span.price", sar(o.price))),
                h("div.row.between.small",
                  h("span.muted.ellipsis", (as === "provider" ? "العميل: " + o.customer_name : o.provider_name) + " · #" + o.id),
                  statusPill(o.status)),
                h("div.tiny.muted", timeAgo(o.updated_at))
              )
            );
          }))
        : empty(as === "provider" ? "📭" : "🧾",
            as === "provider" ? "لا توجد طلبات واردة" + (st === "active" ? " حالياً" : "") : "لا توجد طلبات" + (st === "active" ? " نشطة" : " سابقة"),
            as === "provider" ? h("a.btn.ghost", { href: "#/me/services" }, "إدارة خدماتي") : h("a.btn", { href: "#/browse" }, "تصفّح الخدمات"))
    );
  }
  on("order", load);
  await load();
}

// ===== صفحة الطلب =====
const EVENT_LABELS = {
  created: "أُنشئ الطلب", paid: "تم الدفع — المبلغ محتجز في التطبيق", accept: "قَبِل مقدم الخدمة الطلب",
  decline: "اعتذر مقدم الخدمة", depart: "تحرّك مقدم الخدمة نحو الموقع", start: "بدأ العمل", deliver: "سلّم مقدم الخدمة العمل",
  retry: "مقدم الخدمة يعيد المحاولة", fail: "تعذّر إكمال العمل", cancel: "ألغى صاحب الطلب", confirm: "أكّد صاحب الطلب الاكتمال",
  auto_confirm: "اكتمل تلقائياً بعد انتهاء مهلة التأكيد", dispute: "اعتراض: المشكلة لم تُحل", release: "المشرف: اعتماد العمل",
  refund: "المشرف: إعادة المبلغ لصاحب الطلب", expired: "انتهت مهلة القبول",
};

function actionUi(o) {
  const c = state.config;
  const late = o.status === "on_the_way" || o.status === "in_progress";
  return {
    accept: { label: "قبول الطلب" },
    decline: { label: "اعتذار عن الطلب", cls: "danger", confirm: { title: "الاعتذار عن الطلب؟", body: `سيُعاد سعر الخدمة (${sar(o.price)}) كاملاً لصاحب الطلب.`, askNote: true, notePlaceholder: "سبب الاعتذار (اختياري للعميل)" } },
    depart: { label: "🚗 أنا في الطريق", confirm: { title: "التحرك نحو العميل", body: "سيُشعَر العميل وتُشارك موقعك المباشر معه أثناء الطريق (ما دامت هذه الصفحة مفتوحة). إن ألغى العميل بعد تحرّكك تحصل على " + pct(c.lateCancelRate) + " من السعر تعويضاً." } },
    start: { label: o.mode === "onsite" ? "📍 وصلت — بدء العمل" : "▶️ بدء العمل" },
    deliver: { label: "✅ تم الإنجاز — تسليم العمل", confirm: { title: "تسليم العمل", body: `سيُطلب من العميل تأكيد الاكتمال. إن لم يرد خلال ${c.autoConfirmHours} ساعة يُعتمد تلقائياً.` } },
    retry: { label: "🔁 سأعيد المحاولة" },
    fail: { label: "تعذّر الإنجاز — إعادة المبلغ للعميل", cls: "danger", confirm: { title: "تعذّر إكمال العمل؟", body: `سيُعاد سعر الخدمة كاملاً (${sar(o.price)}) لصاحب الطلب ولن تحصل على مقابل لهذا الطلب.`, askNote: true, notePlaceholder: "ما الذي تعذّر؟" } },
    cancel: {
      label: "إلغاء الطلب", cls: "danger",
      confirm: {
        title: "إلغاء الطلب؟",
        body: late
          ? `مقدم الخدمة ${o.mode === "onsite" ? "تحرّك نحوك" : "بدأ العمل"}، لذلك يحصل على ${sar(o.expected_compensation)} (${pct(c.lateCancelRate)}) تعويضاً ويُعاد لك ${sar(o.price - o.expected_compensation)}. رسوم التطبيق (${sar(o.fee)}) لا تُسترد.`
          : `سيُعاد لك سعر الخدمة كاملاً (${sar(o.price)}). رسوم التطبيق (${sar(o.fee)}) لا تُسترد.`,
        askNote: false,
      },
    },
    confirm: { label: "✅ تأكيد اكتمال العمل", confirm: { title: "تأكيد الاكتمال", body: `سيُحوَّل ${sar(o.price)} لأرباح مقدم الخدمة. لا يمكن التراجع بعد التأكيد.` } },
    dispute: { label: "لم تُحل المشكلة", cls: "danger", confirm: { title: "الإبلاغ عن عدم حل المشكلة", body: "يبقى المبلغ محتجزاً. يستطيع مقدم الخدمة إعادة المحاولة أو إعادة المبلغ لك، ويراجع المشرف النزاع.", askNote: true, notePlaceholder: "اشرح ما الذي لم يُحل" } },
    release: { label: "اعتماد العمل وتحويل المبلغ لمقدم الخدمة", confirm: { title: "حسم النزاع لصالح مقدم الخدمة؟", body: `سيُضاف ${sar(o.price)} لأرباحه.` } },
    refund: { label: "إعادة سعر الخدمة لصاحب الطلب", cls: "danger", confirm: { title: "حسم النزاع لصالح صاحب الطلب؟", body: `سيُعاد ${sar(o.price)} لصاحب الطلب (الرسوم غير مستردة).` } },
  };
}

function stageHint(o) {
  const c = state.config;
  const C = o.role === "customer", P = o.role === "provider";
  const m = {
    requested: C ? `بانتظار قبول مقدم الخدمة. إن لم يقبل خلال ${c.requestTimeoutHours} ساعة يُلغى ويُعاد لك سعر الخدمة.`
      : P ? `طلب جديد! اقبله أو اعتذر عنه. يُلغى تلقائياً بعد ${c.requestTimeoutHours} ساعة.` : "",
    accepted: C ? "قَبِل مقدم الخدمة طلبك. الإلغاء الآن (قبل تحرّكه) يعيد لك سعر الخدمة كاملاً."
      : P ? (o.mode === "onsite" ? "اضغط «أنا في الطريق» عند تحركك نحو العميل." : "ابدأ العمل عندما تكون جاهزاً، وتواصل مع العميل عبر المحادثة.") : "",
    on_the_way: C ? `مقدم الخدمة في الطريق إليك. الإلغاء الآن يمنحه ${pct(c.lateCancelRate)} من السعر تعويضاً.` : P ? "عند وصولك اضغط «وصلت — بدء العمل»." : "",
    in_progress: C ? "جارٍ العمل على طلبك." : P ? "عند الانتهاء اضغط «تم الإنجاز». إن تعذّر الإصلاح يُعاد المبلغ للعميل." : "",
    delivered: C ? `راجع العمل ثم أكّد الاكتمال، أو أبلغ إن لم تُحل المشكلة. يُعتمد تلقائياً بعد ${c.autoConfirmHours} ساعة من التسليم.`
      : P ? "بانتظار تأكيد العميل. المبلغ محتجز حتى التأكيد." : "",
    disputed: "اعتراض: " + (o.dispute_reason || "") + (P ? " — أعد المحاولة أو أعد المبلغ للعميل." : " — المبلغ محتجز حتى حسم النزاع."),
  };
  return m[o.status] || "";
}

function steps(o) {
  if (!["requested", "accepted", "on_the_way", "in_progress", "delivered", "disputed", "completed"].includes(o.status)) return null;
  const list = [["requested", "الطلب"], ["accepted", "القبول"], ["on_the_way", "الطريق"], ["in_progress", "التنفيذ"], ["delivered", "التسليم"], ["completed", "الاكتمال"]]
    .filter(([k]) => o.mode === "onsite" || k !== "on_the_way");
  const cur = o.status === "disputed" ? "delivered" : o.status;
  const idx = list.findIndex(([k]) => k === cur);
  return h("div.steps", { "aria-label": "مراحل الطلب" }, list.map(([, label], i) =>
    h("div.s" + (i < idx || o.status === "completed" ? ".done" : i === idx ? ".now" : ""), h("i"), h("span", label))));
}

function moneyCard(o) {
  const nextPayout = dateFmt(state.config.nextPayoutAt);
  const rows = [];
  if (o.role !== "provider") {
    rows.push(h("div.kv", h("span", "سعر الخدمة" + (o.qty > 1 ? ` (${o.qty} × ${sar(o.unit_price)})` : "")), h("b", sar(o.price))));
    rows.push(h("div.kv", h("span", "رسوم التطبيق (غير مستردة)"), h("b", sar(o.fee))));
    rows.push(h("div.kv.total", h("span", "المدفوع"), h("span", sar(o.total))));
    if (o.refund_amount) rows.push(h("div.kv", { style: { color: "var(--ok)" } }, h("span", "↩️ المُسترد لصاحب الطلب"), h("b", sar(o.refund_amount))));
    if (o.compensation_amount) rows.push(h("div.kv", h("span", "تعويض مقدم الخدمة"), h("b", sar(o.compensation_amount))));
  } else {
    rows.push(h("div.kv", h("span", "قيمة الخدمة لك" + (o.qty > 1 ? ` (${o.qty} × ${sar(o.unit_price)})` : "")), h("b", sar(o.price))));
    if (o.compensation_amount) rows.push(h("div.kv", { style: { color: "var(--ok)" } }, h("span", "تعويض الإلغاء بعد التحرك"), h("b", sar(o.compensation_amount))));
  }
  let line;
  if (o.status === "pending_payment") line = "لم يتم الدفع بعد.";
  else if (o.status === "completed") line = o.role === "customer" ? "✅ حُوِّل المبلغ لمقدم الخدمة." : `✅ أُضيف لأرباحك المحتجزة ويُصرف في ${nextPayout}.`;
  else if (o.status === "cancelled") line = o.compensation_amount && o.role === "provider" ? `أُضيف التعويض لأرباحك ويُصرف في ${nextPayout}.` : "↩️ أُعيد سعر الخدمة المستحق لصاحب الطلب.";
  else line = o.role === "provider" ? "🔒 محتجز في التطبيق، ويُضاف لأرباحك بعد تأكيد العميل." : "🔒 محتجز في التطبيق ولن يُحوَّل قبل تأكيدك.";
  return h("div.card.stack.tight", h("b", "💰 المبلغ"), rows, h("p.small.muted", { style: { marginTop: "6px" } }, line));
}

export async function orderView(root, { params, on, onLeave, isCurrent }) {
  const id = Number(params.id);
  let o = (await api.get("/orders/" + id)).order;
  if (!isCurrent()) return;
  const main = h("div.stack.loose");
  const chatBox = h("div.chat", { "aria-live": "polite" });
  const chatInput = h("input.input", { placeholder: "اكتب رسالة…", maxlength: 2000, "aria-label": "رسالة" });
  const chatCard = h("div.card.stack",
    h("b", "💬 المحادثة"),
    chatBox,
    h("form.chat-form", {
      onsubmit: async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = "";
        try {
          await api.post(`/orders/${id}/messages`, { body: text });
        } catch (ex) {
          chatInput.value = text;
          toast(ex.message, "", { error: true });
        }
      },
    }, chatInput, h("button.btn", { type: "submit", "aria-label": "إرسال" }, icon("send")))
  );
  const side = h("div.stack.loose");
  put(root, h("div", backLink("#/orders" + (o.role === "provider" ? "?as=provider" : ""), "الطلبات")), h("div.order-layout", main, side));

  const seen = new Set();
  function addMessage(m) {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    const mine = m.sender_id === state.me.id;
    const who = m.sender_id === o.customer.id ? o.customer.name : m.sender_id === o.provider.id ? o.provider.name : "المشرف";
    chatBox.append(h("div.bubble." + (mine ? "me" : "them"), mine ? null : h("b.tiny", who + ": "), m.body, h("time", timeAgo(m.created_at))));
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  async function loadMessages() {
    const { items } = await api.get(`/orders/${id}/messages`);
    items.forEach(addMessage);
    if (!items.length && !chatBox.childElementCount) chatBox.append(h("p.small.muted", "ابدأ المحادثة للتنسيق مع الطرف الآخر."));
  }

  // ===== مشاركة موقع مقدم الخدمة أثناء التوجه للعميل =====
  let watchId = null, lastSent = 0;
  function syncLocationSharing() {
    const should = o.role === "provider" && o.mode === "onsite" && o.status === "on_the_way" && navigator.geolocation;
    if (should && watchId === null) {
      watchId = navigator.geolocation.watchPosition((p) => {
        if (Date.now() - lastSent < 15000) return;
        lastSent = Date.now();
        api.post(`/orders/${id}/location`, { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }).catch(() => {});
      }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
    } else if (!should && watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }
  onLeave(() => watchId !== null && navigator.geolocation.clearWatch(watchId));

  async function doAction(name, ui) {
    let note = "";
    if (ui.confirm) {
      const r = await confirmSheet({ ok: ui.label.replace(/^[^\p{L}]+/u, ""), danger: ui.cls === "danger", ...ui.confirm });
      if (!r) return;
      note = r.note;
    }
    try {
      o = (await api.post(`/orders/${id}/actions/${name}`, { note })).order;
      draw();
      refreshCounts();
    } catch (e) {
      toast(e.message, "", { error: true });
      o = (await api.get("/orders/" + id)).order;
      draw();
    }
  }

  function locationCard() {
    if (o.mode !== "onsite" || o.status === "pending_payment") return null;
    const kids = [h("b", "📍 الموقع"), h("p", o.address)];
    if (o.lat !== null) {
      kids.push(osmEmbed(o.lat, o.lng));
      if (o.role === "provider") kids.push(h("a.btn.soft.block", { href: directionsUrl(o.lat, o.lng), target: "_blank", rel: "noopener" }, icon("nav"), "الاتجاهات إلى العميل"));
    }
    if (o.role === "provider" && o.status === "on_the_way") {
      kids.push(h("div.notice.ok.small", h("span.ico", "📡"), h("span", navigator.geolocation ? "تتم مشاركة موقعك المباشر مع العميل ما دامت هذه الصفحة مفتوحة." : "متصفحك لا يدعم مشاركة الموقع.")));
    }
    if (o.role !== "provider" && ["on_the_way", "in_progress"].includes(o.status)) {
      const live = h("div.stack.tight", { id: "liveLoc" });
      kids.push(live);
      drawLive(live);
    }
    return h("div.card.stack", kids);
  }
  function drawLive(el) {
    clear(el);
    if (o.provider_lat === null || o.provider_lat === undefined) {
      if (o.status === "on_the_way") put(el, h("p.small.muted", "🚗 بانتظار موقع مقدم الخدمة المباشر…"));
      return;
    }
    const d = o.lat !== null ? distanceKm({ lat: o.lat, lng: o.lng }, { lat: o.provider_lat, lng: o.provider_lng }) : null;
    put(el,
      h("b.small", "🚗 موقع مقدم الخدمة" + (d !== null ? ` — يبعد ${d} كم` : "")),
      osmEmbed(o.provider_lat, o.provider_lng, 0.02),
      h("span.tiny.muted", "آخر تحديث " + timeAgo(o.provider_loc_at))
    );
  }

  function partyCard() {
    const parties = o.role === "admin" ? [["صاحب الطلب", o.customer], ["مقدم الخدمة", o.provider]]
      : [[o.role === "customer" ? "مقدم الخدمة" : "صاحب الطلب", o.role === "customer" ? o.provider : o.customer]];
    return h("div.card.stack", parties.map(([label, u]) =>
      h("div.row",
        avatar(u, "sm", u.online),
        h("div.grow", h("div.tiny.muted", label), h("a.bold", { href: "#/u/" + u.id }, u.name), h("div", onlineLabel(u))),
        u.phone ? h("a.icon-btn", { href: "tel:" + u.phone, "aria-label": "اتصال" }, icon("phone")) : null
      )));
  }

  function reviewCard() {
    if (o.status !== "completed") return null;
    if (o.review) {
      return h("div.card.stack.tight", h("b", "تقييم صاحب الطلب"), h("span.stars", "★".repeat(o.review.rating) + "☆".repeat(5 - o.review.rating)), o.review.comment ? h("p", o.review.comment) : null);
    }
    if (o.role !== "customer") return null;
    let rating = 0;
    const btns = [1, 2, 3, 4, 5].map((n) => h("button", { type: "button", "aria-label": n + " نجوم", onclick: () => { rating = n; btns.forEach((b, i) => b.classList.toggle("on", i < n)); } }, "★"));
    const comment = h("textarea.input", { rows: 3, placeholder: "اكتب رأيك (اختياري)", maxlength: 1000 });
    return h("form.card.stack", {
      onsubmit: async (e) => {
        e.preventDefault();
        if (!rating) return toast("اختر عدد النجوم", "", { error: true });
        try {
          await api.post(`/orders/${id}/review`, { rating, comment: comment.value });
          o = (await api.get("/orders/" + id)).order;
          draw();
          toast("شكراً لتقييمك ⭐");
        } catch (ex) {
          toast(ex.message, "", { error: true });
        }
      },
    }, h("b", "⭐ قيّم الخدمة"), h("div.rate", btns), comment, h("button.btn", { type: "submit" }, "إرسال التقييم"));
  }

  function draw() {
    const ui = actionUi(o);
    const hint = stageHint(o);
    const closedNote = o.status === "cancelled"
      ? h("div.notice.bad", h("span.ico", "ℹ️"), h("div",
          h("b", CANCEL_KINDS[o.cancel_kind] || "ملغي"),
          o.cancel_reason ? h("p.small", "السبب: " + o.cancel_reason) : null,
          h("p.small", `المُسترد لصاحب الطلب: ${sar(o.refund_amount)}` + (o.compensation_amount ? ` · تعويض مقدم الخدمة: ${sar(o.compensation_amount)}` : "") + " · رسوم التطبيق غير مستردة.")))
      : null;
    put(clear(main),
      h("div.card.stack",
        h("div.row.between.wrap", h("span.tiny.muted", "طلب #" + o.id + " · " + dateTimeFmt(o.created_at)), statusPill(o.status)),
        h("h1", { style: { fontSize: "21px" } }, o.title),
        steps(o),
        hint ? h("div.notice" + (o.status === "disputed" ? ".bad" : o.status === "delivered" ? ".warn" : ""), h("span.ico", "💡"), h("span.small", hint)) : null,
        closedNote,
        o.actions.length
          ? h("div.actions", o.actions.map((name) => {
              const a = ui[name];
              return h("button.btn" + (a.cls ? "." + a.cls : ""), { type: "button", onclick: () => doAction(name, a) }, a.label);
            }))
          : null
      ),
      h("div.card.stack.tight",
        h("b", "📝 تفاصيل الطلب"),
        h("p", { style: { whiteSpace: "pre-wrap" } }, o.description),
        o.qty > 1 ? h("p.small.muted", "المدة: " + qtyLabel(o.qty, o.unit)) : null,
        o.scheduled_at ? h("p.small", "🗓️ الموعد المفضل: " + dateTimeFmt(o.scheduled_at)) : null
      ),
      locationCard(),
      reviewCard(),
      h("details.card", h("summary.bold", { style: { cursor: "pointer" } }, "🕒 سجل الطلب"),
        h("div.timeline", { style: { marginTop: "10px" } }, o.events.map((e) =>
          h("div.t", h("div", h("div", EVENT_LABELS[e.type] || e.type), e.note ? h("div.small.muted", e.note) : null, h("div.tiny.muted", dateTimeFmt(e.created_at)))))))
    );
    put(clear(side), partyCard(), moneyCard(o), o.status === "pending_payment" ? null : chatCard);
    syncLocationSharing();
  }

  draw();
  await loadMessages();
  on("order", async (d) => {
    if (d.id !== id) return;
    o = (await api.get("/orders/" + id)).order;
    draw();
  });
  on("message", (m) => m.order_id === id && addMessage(m));
  on("location", (l) => {
    if (l.id !== id) return;
    Object.assign(o, { provider_lat: l.lat, provider_lng: l.lng, provider_loc_at: l.at });
    const el = document.getElementById("liveLoc");
    if (el) drawLive(el);
  });
}
