// نقطة البداية: الحالة العامة، التوجيه، شريط التنقل، والتحديثات الفورية.
import { api } from "./api.js";
import { put, h, clear, icon, toast, sheet, timeAgo, empty } from "./ui.js";
import { homeView, browseView } from "./views/browse.js";
import { serviceView, profileView } from "./views/service.js";
import { bookView } from "./views/book.js";
import { ordersView, orderView } from "./views/orders.js";
import { meView, myServicesView, serviceFormView } from "./views/me.js";
import { walletView, adminView, policyView } from "./views/wallet.js";
import { loginView, registerView } from "./views/auth.js";

export const state = { me: null, config: null, categories: [], unread: 0, incoming: 0 };
const bus = new EventTarget();

const ROUTES = [
  ["/", homeView],
  ["/browse", browseView],
  ["/service/:id", serviceView],
  ["/u/:id", profileView],
  ["/book/:id", bookView, { auth: true }],
  ["/orders", ordersView, { auth: true }],
  ["/order/:id", orderView, { auth: true }],
  ["/me", meView, { auth: true }],
  ["/me/services", myServicesView, { auth: true }],
  ["/me/services/new", serviceFormView, { auth: true }],
  ["/me/services/:id", serviceFormView, { auth: true }],
  ["/wallet", walletView, { auth: true }],
  ["/admin", adminView, { auth: true, admin: true }],
  ["/policy", policyView],
  ["/login", loginView],
  ["/register", registerView],
].map(([pattern, view, opts = {}]) => {
  const keys = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "$");
  return { re, keys, view, ...opts };
});

export function go(path) {
  if (location.hash === "#" + path) render();
  else location.hash = path;
}

export function categoryById(id) {
  return state.categories.find((c) => c.id === id) || { id, name: id, icon: "🧰" };
}

let cleanup = [];
let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  cleanup.forEach((fn) => fn());
  cleanup = [];
  const raw = location.hash.slice(1) || "/";
  const [path, search = ""] = raw.split("?");
  const query = Object.fromEntries(new URLSearchParams(search));
  const root = document.getElementById("view");
  let route, params = {};
  for (const r of ROUTES) {
    const m = r.re.exec(path);
    if (m) {
      route = r;
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      break;
    }
  }
  updateNav(path);
  clear(root);
  window.scrollTo(0, 0);
  if (!route) return put(root, empty("🧭", "الصفحة غير موجودة", h("a.btn", { href: "#/" }, "الرئيسية")));
  if (route.auth && !state.me) return go("/login?next=" + encodeURIComponent(raw));
  if (route.admin && !state.me.is_admin) return go("/");
  const ctx = {
    params,
    query,
    go,
    // اشتراك في حدث فوري يُلغى تلقائياً عند مغادرة الصفحة.
    on(type, fn) {
      const handler = (e) => fn(e.detail);
      bus.addEventListener(type, handler);
      cleanup.push(() => bus.removeEventListener(type, handler));
    },
    onLeave(fn) {
      cleanup.push(fn);
    },
    isCurrent: () => seq === renderSeq,
  };
  try {
    await route.view(root, ctx);
  } catch (e) {
    if (seq !== renderSeq) return;
    put(clear(root), empty("⚠️", e.message || "حدث خطأ", h("button.btn.ghost", { onclick: render }, "إعادة المحاولة")));
  }
  root.focus({ preventScroll: true });
}

// ===== التنقل =====
const NAV = [
  { path: "/", label: "الرئيسية", icon: "home" },
  { path: "/browse", label: "تصفّح", icon: "search" },
  { path: "/orders", label: "طلباتي", icon: "orders", badge: () => state.incoming },
  { path: "/wallet", label: "المحفظة", icon: "wallet" },
  { path: "/me", label: "حسابي", icon: "user" },
];

function updateNav(path) {
  const section = "/" + (path.split("/")[1] || "");
  const active = (p) => (p === "/" ? section === "/" : section === p || (p === "/orders" && section === "/order"));
  const build = (withIcon) =>
    NAV.map((n) => {
      const b = n.badge && n.badge();
      return h("a" + (active(n.path) ? ".on" : ""), { href: "#" + n.path, "aria-current": active(n.path) ? "page" : null },
        withIcon ? icon(n.icon) : null, h("span", n.label), b ? h("span.dot-badge", String(b)) : null);
    });
  put(clear(document.getElementById("tabbar")), ...build(true));
  put(clear(document.getElementById("topnav")), ...build(false));

  const actions = clear(document.getElementById("topActions"));
  if (state.me) {
    put(actions,
      h("button.icon-btn", { onclick: openNotifications, "aria-label": "الإشعارات" },
        icon("bell"), state.unread ? h("span.dot-badge", String(state.unread)) : null)
    );
  } else if (section !== "/login" && section !== "/register") {
    put(actions, h("a.btn.sm", { href: "#/login" }, "دخول"));
  }
}
export const refreshNav = () => updateNav((location.hash.slice(1) || "/").split("?")[0]);

async function openNotifications() {
  const { items } = await api.get("/notifications");
  state.unread = 0;
  refreshNav();
  api.post("/notifications/read").catch(() => {});
  sheet("الإشعارات", (close) =>
    items.length
      ? h("div.list", items.map((n) =>
          h("a", { href: n.link || "#/", onclick: close, style: { display: "block", fontWeight: n.read ? 400 : 700 } },
            h("div", n.title), n.body ? h("div.small.muted", n.body) : null, h("div.tiny.muted", timeAgo(n.created_at)))))
      : empty("🔔", "لا توجد إشعارات بعد")
  );
}

// ===== التحديثات الفورية (SSE) =====
let source = null;
function connectEvents() {
  if (source) source.close();
  source = null;
  if (!state.me) return;
  source = new EventSource("/api/events");
  const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
  source.addEventListener("notification", (e) => {
    const n = JSON.parse(e.data);
    state.unread++;
    refreshNav();
    toast(n.title, n.body, { onClick: () => n.link && (location.hash = n.link.slice(1)) });
    if (n.title.startsWith("طلب جديد")) refreshCounts();
  });
  source.addEventListener("order", (e) => {
    emit("order", JSON.parse(e.data));
    refreshCounts();
  });
  source.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    const onPage = location.hash === "#/order/" + m.order_id;
    if (!onPage && m.sender_id !== state.me.id) {
      toast("رسالة من " + m.sender_name, m.body, { onClick: () => go("/order/" + m.order_id) });
    }
    emit("message", m);
  });
  source.addEventListener("location", (e) => emit("location", JSON.parse(e.data)));
  source.addEventListener("presence", (e) => {
    const p = JSON.parse(e.data);
    document.querySelectorAll(`[data-presence="${p.userId}"]`).forEach((d) => d.classList.toggle("on", p.online));
    document.querySelectorAll(`[data-presence-label="${p.userId}"]`).forEach((l) => {
      l.classList.toggle("on", p.online);
      l.textContent = p.online ? "متصل الآن" : "آخر ظهور الآن";
    });
  });
}

export async function refreshCounts() {
  if (!state.me) return;
  try {
    const [o, n] = await Promise.all([api.get("/orders?as=provider"), api.get("/notifications")]);
    state.incoming = o.counts.incoming;
    state.unread = n.unread;
    refreshNav();
  } catch {}
}

export async function setUser(user) {
  state.me = user;
  connectEvents();
  if (user) await refreshCounts();
  else (state.unread = 0), (state.incoming = 0);
  refreshNav();
}

async function boot() {
  const [me, config, cats] = await Promise.all([
    api.get("/me"),
    api.get("/config"),
    api.get("/categories"),
  ]).catch((e) => {
    put(clear(document.getElementById("view")), empty("📡", e.message, h("button.btn", { onclick: () => location.reload() }, "إعادة المحاولة")));
    throw e;
  });
  state.config = config;
  state.categories = cats.items;
  await setUser(me.user);
  window.addEventListener("hashchange", render);
  render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

boot();
