// أدوات الواجهة: إنشاء العناصر بأمان (بدون innerHTML للنصوص)، التنسيق، الرسائل المنبثقة، والنوافذ.

export function h(tag, props, ...kids) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = (el.className + " " + v).trim();
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "value" || k === "checked" || k === "disabled" || k === "selected") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

// مثل el.append لكن يتجاهل null/false (append الأصلية تكتبها نصاً "null").
export function put(el, ...kids) {
  return append(el, kids);
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// أيقونات SVG ثابتة (نص موثوق داخل الكود).
const ICONS = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  orders: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
  back: '<path d="m9 6 6 6-6 6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  send: '<path d="M21 3 3 10.5l7 2.5 2.5 7z"/><path d="m21 3-11 10"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  admin: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 17 5 12l5-5M5 12h11"/>',
  nav: '<path d="m3 11 18-8-8 18-2-8z"/>',
};
export function icon(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.8");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || "";
  return s;
}

// ===== التنسيق =====
const nf = new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: 2 });
export const sar = (halalas) => nf.format((halalas || 0) / 100) + " ر.س";
export const num = (n) => nf.format(n || 0);

export function timeAgo(ms) {
  if (!ms) return "";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "الآن";
  const m = Math.round(s / 60);
  if (m < 60) return `منذ ${m} د`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `منذ ${hr} س`;
  const d = Math.round(hr / 24);
  if (d < 30) return `منذ ${d} يوم`;
  return dateFmt(ms);
}
export const dateFmt = (ms) =>
  new Date(ms).toLocaleDateString("ar-SA-u-nu-latn-ca-gregory", { day: "numeric", month: "long", year: "numeric" });
export const dateTimeFmt = (ms) =>
  new Date(ms).toLocaleString("ar-SA-u-nu-latn-ca-gregory", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export function countdown(ms) {
  const s = Math.max(0, Math.round((ms - Date.now()) / 1000));
  const d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600);
  const days = d === 1 ? "يوم" : d === 2 ? "يومين" : d <= 10 ? d + " أيام" : d + " يوماً";
  const hours = hr === 1 ? "ساعة" : hr === 2 ? "ساعتين" : hr <= 10 ? hr + " ساعات" : hr + " ساعة";
  if (!d) return "بعد " + (hr ? hours : "أقل من ساعة");
  return "بعد " + days + (hr ? " و" + hours : "");
}

const COLORS = ["#0f766e", "#7c3aed", "#b45309", "#be185d", "#1d4ed8", "#15803d", "#c2410c", "#4338ca"];
export function avatar(user, size = "", online) {
  const name = user.name || "?";
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  const color = COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const el = h("div.avatar" + (size ? "." + size : ""), { style: { background: color } }, initials);
  if (online !== undefined) el.append(presenceDot(user.id, online));
  return el;
}
export function presenceDot(userId, online) {
  return h("span.presence" + (online ? ".on" : ""), { dataset: { presence: userId }, title: online ? "متصل الآن" : "غير متصل" });
}
export function onlineLabel(user) {
  if (user.online) return h("span.online-label.on", { dataset: { presenceLabel: user.id } }, "متصل الآن");
  if (!user.available) return h("span.online-label", "غير متاح حالياً");
  return h("span.online-label", { dataset: { presenceLabel: user.id } }, user.last_seen_at ? "آخر ظهور " + timeAgo(user.last_seen_at) : "غير متصل");
}
export function stars(rating, count) {
  if (!rating) return h("span.muted.small", "جديد");
  return h("span.stars", "★ " + rating, count !== undefined ? h("span.muted", ` (${count})`) : null);
}

// ===== الرسائل المنبثقة والنوافذ =====
export function toast(title, body = "", { error = false, onClick, ms = 4500 } = {}) {
  const t = h("div.toast" + (error ? ".error" : ""), { role: "status" }, h("b", title), body ? h("span", body) : null);
  const remove = () => t.remove();
  t.addEventListener("click", () => (onClick && onClick(), remove()));
  const box = document.getElementById("toasts");
  box.append(t);
  while (box.childElementCount > 3) box.firstElementChild.remove();
  setTimeout(remove, ms);
}

export function sheet(title, build, { onClose } = {}) {
  const prev = document.activeElement;
  const box = h("div.sheet", { role: "dialog", "aria-modal": "true", "aria-label": title }, h("h3", title));
  const back = h("div.sheet-back", box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    document.removeEventListener("keydown", onKey);
    if (onClose) onClose();
    if (prev && prev.focus) prev.focus();
  };
  const onKey = (e) => e.key === "Escape" && close();
  back.addEventListener("click", (e) => e.target === back && close());
  document.addEventListener("keydown", onKey);
  append(box, [build(close)]);
  document.body.append(back);
  const f = box.querySelector("textarea, input, button");
  if (f) f.focus();
  return close;
}

// نافذة تأكيد؛ مع askNote تطلب سبباً نصياً. تعيد Promise بالنتيجة أو null عند الإلغاء.
export function confirmSheet({ title, body, ok = "تأكيد", danger = false, askNote = false, notePlaceholder = "" }) {
  return new Promise((resolve) => {
    let result = null;
    sheet(title, (close) => {
      const note = askNote ? h("textarea.input", { placeholder: notePlaceholder, rows: 3, maxlength: 1000 }) : null;
      const err = h("p.form-error", { hidden: true });
      return h("div.stack",
        body ? (body instanceof Node ? body : h("p", body)) : null,
        note, err,
        h("div.row",
          h("button.btn.grow" + (danger ? ".danger" : ""), {
            onclick: () => {
              if (askNote && note.value.trim().length < 3) {
                err.hidden = false;
                err.textContent = "اكتب السبب باختصار";
                return;
              }
              result = { note: note ? note.value.trim() : "" };
              close();
            },
          }, ok),
          h("button.btn.ghost", { onclick: close }, "رجوع")
        )
      );
    }, { onClose: () => resolve(result) });
  });
}

export function field(label, input, hint) {
  return h("label.field", h("span", label, hint ? h("span.hint", " — " + hint) : null), input);
}

export function empty(ico, text, action) {
  return h("div.empty", h("div.ico", ico), h("p", text), action ? h("div", { style: { marginTop: "12px" } }, action) : null);
}

export function skeleton(n = 3) {
  return h("div.grid-cards", Array.from({ length: n }, () => h("div.skeleton")));
}

export function osmEmbed(lat, lng, zoom = 0.01) {
  const bbox = [lng - zoom, lat - zoom, lng + zoom, lat + zoom].join(",");
  return h("iframe.map", {
    src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`,
    loading: "lazy",
    title: "الخريطة",
    referrerpolicy: "no-referrer",
  });
}
export const directionsUrl = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export function distanceKm(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)) * 10) / 10;
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("المتصفح لا يدعم تحديد الموقع"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => reject(new Error("تعذّر تحديد موقعك، تأكد من السماح بالوصول للموقع")),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}
