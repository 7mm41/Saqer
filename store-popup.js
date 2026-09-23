/*!
 * store-popup.js — نافذة منبثقة (Dialog) لعرض صورة المتجر ورابطه ومعلومات الاتصال
 *
 * الاستخدام:
 *   <script>
 *     window.StorePopupConfig = { name: "متجري", url: "https://...", image: "...", ... };
 *   </script>
 *   <script src="store-popup.js" defer></script>
 *
 * أو برمجياً:  StorePopup.init({...});  StorePopup.open();  StorePopup.close();
 */
(function () {
  "use strict";

  var DEFAULTS = {
    name: "متجري",
    tagline: "",
    description: "",
    image: "",          // صورة الغلاف
    logo: "",           // الشعار (اختياري)
    url: "",            // رابط المتجر
    urlLabel: "زيارة المتجر",
    phone: "",
    whatsapp: "",       // رقم بصيغة دولية بدون + أو أصفار، مثال: 9665XXXXXXXX
    email: "",
    address: "",
    hours: "",
    social: {},         // { instagram: "user", x: "user", snapchat: "user", tiktok: "user" }
    accent: "#0f766e",
    position: "left",   // موضع الزر العائم: left | right
    showLauncher: true, // إظهار الزر العائم
    launcherText: "متجرنا",
    autoOpenDelay: 0,   // فتح تلقائي بعد عدد من الثواني (0 = معطّل)
    openOncePerSession: true,
    lang: "ar"
  };

  var SOCIAL = {
    instagram: { label: "إنستغرام", base: "https://instagram.com/" },
    x:         { label: "إكس",       base: "https://x.com/" },
    snapchat:  { label: "سناب شات",  base: "https://snapchat.com/add/" },
    tiktok:    { label: "تيك توك",   base: "https://tiktok.com/@" },
    facebook:  { label: "فيسبوك",    base: "https://facebook.com/" }
  };

  var ICONS = {
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4L3 21z"/><path d="M9 10c.5 1.5 1.5 3 4 4l1.2-1.1 2 1-.4 1.6c-3.3.4-7.6-3.3-7.8-6.5L9.6 8l1 2L9 10z"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    address: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    hours: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M10 20v-5h4v5"/>',
    social: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeUrl(u) {
    u = String(u || "").trim();
    return /^(https?:|mailto:|tel:)/i.test(u) ? u : "";
  }

  function merge(a, b) {
    var out = {};
    for (var k in a) out[k] = a[k];
    for (var j in b || {}) if (b[j] !== undefined) out[j] = b[j];
    return out;
  }

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:'Tajawal','IBM Plex Sans Arabic',system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif}",
    ".wrap{--accent:#0f766e;--bg:#fff;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--soft:#f5f5f4;color:var(--fg)}",
    "@media (prefers-color-scheme:dark){.wrap{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--line:#34302d;--soft:#292524}}",
    "button{font:inherit;cursor:pointer}",
    "svg{width:20px;height:20px;flex:none}",
    /* launcher */
    ".launcher{position:fixed;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:999px;background:var(--accent);color:#fff;font-size:15px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.18);transition:transform .15s}",
    ".launcher:hover{transform:translateY(-2px)}",
    ".launcher.left{left:20px}.launcher.right{right:20px}",
    /* overlay */
    ".overlay{position:fixed;inset:0;z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(12,10,9,.55);backdrop-filter:blur(3px);opacity:0;visibility:hidden;transition:opacity .2s,visibility .2s}",
    ".overlay.open{opacity:1;visibility:visible}",
    ".dialog{position:relative;width:100%;max-width:420px;max-height:calc(100vh - 32px);overflow:auto;background:var(--bg);border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.3);transform:translateY(16px) scale(.98);transition:transform .2s}",
    ".overlay.open .dialog{transform:none}",
    ".cover{position:relative;height:190px;background:var(--soft) center/cover no-repeat}",
    ".cover.empty{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--accent),#0c0a09);color:#fff}",
    ".cover.empty svg{width:64px;height:64px;opacity:.8}",
    ".close{position:absolute;top:12px;inset-inline-end:12px;display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:50%;background:rgba(0,0,0,.45);color:#fff}",
    ".close:hover{background:rgba(0,0,0,.65)}",
    ".body{padding:0 20px 20px}",
    ".logo{display:block;width:76px;height:76px;margin:-38px auto 0;position:relative;border-radius:50%;border:4px solid var(--bg);background:var(--bg) center/cover no-repeat;box-shadow:0 4px 12px rgba(0,0,0,.12)}",
    ".head{text-align:center;padding-top:10px}",
    ".body.nologo .head{padding-top:18px}",
    "h2{margin:0;font-size:22px;font-weight:800}",
    ".tag{margin:4px 0 0;color:var(--accent);font-size:14px;font-weight:600}",
    ".desc{margin:10px 0 0;color:var(--muted);font-size:14px;line-height:1.7}",
    /* link */
    ".linkbox{margin-top:18px;display:flex;gap:8px}",
    ".visit{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border-radius:12px;background:var(--accent);color:#fff;text-decoration:none;font-size:15px;font-weight:700}",
    ".visit:hover{filter:brightness(1.08)}",
    ".icon-btn{display:grid;place-items:center;width:48px;border:1px solid var(--line);border-radius:12px;background:var(--bg);color:var(--fg)}",
    ".icon-btn:hover{background:var(--soft)}",
    ".urltext{margin:8px 0 0;text-align:center;font-size:12px;color:var(--muted);direction:ltr;overflow-wrap:anywhere}",
    /* contacts */
    ".section{margin:20px 0 8px;font-size:13px;font-weight:700;color:var(--muted)}",
    ".list{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:14px;overflow:hidden}",
    ".row{display:flex;align-items:center;gap:12px;padding:12px 14px;color:var(--fg);text-decoration:none;border-top:1px solid var(--line)}",
    ".row:first-child{border-top:0}",
    "a.row:hover{background:var(--soft)}",
    ".row .ic{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:var(--soft);color:var(--accent)}",
    ".row .tx{min-width:0;display:flex;flex-direction:column}",
    ".row .lb{font-size:12px;color:var(--muted)}",
    ".row .vl{font-size:14px;font-weight:600;overflow-wrap:anywhere}",
    ".ltr{direction:ltr;unicode-bidi:isolate;text-align:start}",
    ".chips{display:flex;flex-wrap:wrap;gap:8px}",
    ".chip{padding:8px 14px;border:1px solid var(--line);border-radius:999px;color:var(--fg);text-decoration:none;font-size:13px;font-weight:600}",
    ".chip:hover{border-color:var(--accent);color:var(--accent)}",
    ".toast{position:absolute;bottom:16px;left:50%;transform:translate(-50%,10px);padding:8px 14px;border-radius:999px;background:var(--fg);color:var(--bg);font-size:13px;opacity:0;pointer-events:none;transition:.2s}",
    ".toast.show{opacity:1;transform:translate(-50%,0)}",
    "@media (prefers-reduced-motion:reduce){*{transition:none!important}}"
  ].join("\n");

  var state = { cfg: null, root: null, overlay: null, lastFocus: null };

  function contactRows(c) {
    var rows = [];
    if (c.phone) rows.push({ ic: "phone", lb: "الهاتف", vl: c.phone, href: "tel:" + c.phone.replace(/[^\d+]/g, ""), ltr: true });
    if (c.whatsapp) rows.push({ ic: "whatsapp", lb: "واتساب", vl: "+" + String(c.whatsapp).replace(/\D/g, ""), href: "https://wa.me/" + String(c.whatsapp).replace(/\D/g, ""), ltr: true });
    if (c.email) rows.push({ ic: "email", lb: "البريد الإلكتروني", vl: c.email, href: "mailto:" + c.email, ltr: true });
    if (c.address) rows.push({ ic: "address", lb: "العنوان", vl: c.address, href: c.mapUrl || "https://maps.google.com/?q=" + encodeURIComponent(c.address) });
    if (c.hours) rows.push({ ic: "hours", lb: "ساعات العمل", vl: c.hours });
    return rows.map(function (r) {
      var inner = '<span class="ic">' + icon(r.ic) + '</span><span class="tx"><span class="lb">' + esc(r.lb) + '</span><span class="vl' + (r.ltr ? " ltr" : "") + '">' + esc(r.vl) + "</span></span>";
      var href = safeUrl(r.href);
      return href
        ? '<a class="row" href="' + esc(href) + '" target="_blank" rel="noopener">' + inner + "</a>"
        : '<div class="row">' + inner + "</div>";
    }).join("");
  }

  function socialChips(social) {
    return Object.keys(social || {}).filter(function (k) { return social[k]; }).map(function (k) {
      var v = String(social[k]);
      var meta = SOCIAL[k] || { label: k, base: "" };
      var href = /^https?:/i.test(v) ? v : meta.base + v.replace(/^@/, "");
      return '<a class="chip" href="' + esc(safeUrl(href)) + '" target="_blank" rel="noopener">' + esc(meta.label) + "</a>";
    }).join("");
  }

  function render() {
    var c = state.cfg;
    var url = safeUrl(c.url);
    var rows = contactRows(c);
    var chips = socialChips(c.social);

    var html =
      '<div class="wrap" dir="' + (c.lang === "ar" ? "rtl" : "ltr") + '" style="--accent:' + esc(c.accent) + '">' +
      (c.showLauncher ? '<button class="launcher ' + (c.position === "right" ? "right" : "left") + '" type="button" aria-haspopup="dialog">' + icon("store") + esc(c.launcherText) + "</button>" : "") +
      '<div class="overlay" aria-hidden="true">' +
      '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sp-title">' +
      '<div class="cover' + (c.image ? "" : " empty") + '"' + (c.image ? ' style="background-image:url(&quot;' + esc(c.image) + '&quot;)" role="img" aria-label="صورة ' + esc(c.name) + '"' : "") + ">" +
      (c.image ? "" : icon("store")) +
      '<button class="close" type="button" aria-label="إغلاق">' + icon("close") + "</button></div>" +
      '<div class="body' + (c.logo ? "" : " nologo") + '">' +
      (c.logo ? '<span class="logo" style="background-image:url(&quot;' + esc(c.logo) + '&quot;)"></span>' : "") +
      '<div class="head"><h2 id="sp-title">' + esc(c.name) + "</h2>" +
      (c.tagline ? '<p class="tag">' + esc(c.tagline) + "</p>" : "") +
      (c.description ? '<p class="desc">' + esc(c.description) + "</p>" : "") + "</div>" +
      (url
        ? '<div class="linkbox"><a class="visit" href="' + esc(url) + '" target="_blank" rel="noopener">' + icon("link") + esc(c.urlLabel) + "</a>" +
          '<button class="icon-btn" type="button" data-act="copy" aria-label="نسخ الرابط" title="نسخ الرابط">' + icon("copy") + "</button>" +
          '<button class="icon-btn" type="button" data-act="share" aria-label="مشاركة" title="مشاركة">' + icon("share") + "</button></div>" +
          '<p class="urltext">' + esc(url.replace(/^https?:\/\//, "")) + "</p>"
        : "") +
      (rows ? '<div class="section">معلومات الاتصال</div><div class="list">' + rows + "</div>" : "") +
      (chips ? '<div class="section">تابعنا</div><div class="chips">' + chips + "</div>" : "") +
      '</div><div class="toast" role="status" aria-live="polite"></div></div></div></div>';

    state.root.innerHTML = "<style>" + CSS + "</style>" + html;
    state.overlay = state.root.querySelector(".overlay");

    var launcher = state.root.querySelector(".launcher");
    if (launcher) launcher.addEventListener("click", open);
    state.root.querySelector(".close").addEventListener("click", close);
    state.overlay.addEventListener("click", function (e) { if (e.target === state.overlay) close(); });

    var copyBtn = state.root.querySelector('[data-act="copy"]');
    if (copyBtn) copyBtn.addEventListener("click", function () { copy(url); });
    var shareBtn = state.root.querySelector('[data-act="share"]');
    if (shareBtn) shareBtn.addEventListener("click", function () {
      if (navigator.share) navigator.share({ title: c.name, text: c.tagline || c.name, url: url }).catch(function () {});
      else copy(url);
    });
  }

  function toast(msg) {
    var t = state.root.querySelector(".toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  function copy(text) {
    var done = function () { toast("تم نسخ الرابط ✓"); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("تعذّر النسخ"); }
      ta.remove();
    }
  }

  function onKey(e) {
    if (e.key === "Escape") return close();
    if (e.key !== "Tab") return;
    var f = state.overlay.querySelectorAll("a[href],button");
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], active = state.root.activeElement;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  function open() {
    if (!state.overlay) return;
    state.lastFocus = document.activeElement;
    state.overlay.classList.add("open");
    state.overlay.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", onKey);
    setTimeout(function () { state.root.querySelector(".close").focus(); }, 50);
  }

  function close() {
    if (!state.overlay) return;
    state.overlay.classList.remove("open");
    state.overlay.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKey);
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
  }

  function init(config) {
    state.cfg = merge(DEFAULTS, config);
    if (!state.root) {
      var host = document.createElement("div");
      host.id = "store-popup";
      document.body.appendChild(host);
      state.root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    }
    render();

    var d = Number(state.cfg.autoOpenDelay) || 0;
    if (d > 0) {
      var key = "store-popup-shown";
      var seen = false;
      try { seen = state.cfg.openOncePerSession && sessionStorage.getItem(key); } catch (e) {}
      if (!seen) setTimeout(function () {
        open();
        try { sessionStorage.setItem(key, "1"); } catch (e) {}
      }, d * 1000);
    }
  }

  window.StorePopup = { init: init, open: open, close: close };

  function boot() { if (window.StorePopupConfig) init(window.StorePopupConfig); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
