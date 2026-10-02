"use strict";
const http = require("node:http");
const path = require("node:path");
const cfg = require("./config");
const { open } = require("./db");
const { createHub } = require("./events");
const { createAuth } = require("./auth");
const { createOrders } = require("./orders");
const { createPresenter } = require("./present");
const { createRouter, readJson, sendJson, serveStatic, HttpError } = require("./http");

const PUBLIC = path.join(__dirname, "..", "public");

const SECURITY_HEADERS = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "frame-src https://www.openstreetmap.org",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(self)",
};

function createApp({ dbFile = cfg.dbFile } = {}) {
  const db = open(dbFile);
  const hub = createHub(db);
  const auth = createAuth(db);
  const orders = createOrders({ db, hub });
  const presenter = createPresenter(db, hub);
  const router = createRouter();
  const ctx = { db, hub, auth, orders, presenter };
  for (const mod of ["account", "catalog", "orders", "admin"]) require("./routes/" + mod)(router, ctx);

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    if (!url.pathname.startsWith("/api/")) {
      if ((req.method === "GET" || req.method === "HEAD") && serveStatic(PUBLIC, req, res, url.pathname)) return;
      if (req.method === "GET" && !path.extname(url.pathname)) return serveStatic(PUBLIC, req, res, "/index.html");
      return sendJson(res, 404, { error: "غير موجود" });
    }
    try {
      const m = router.match(req.method, url.pathname);
      if (!m) throw new HttpError(404, "غير موجود");
      let body = {};
      if (req.method !== "GET") {
        // حماية من الطلبات القادمة من مواقع أخرى (CSRF)
        if (!String(req.headers["content-type"] || "").startsWith("application/json")) throw new HttpError(415, "يجب إرسال JSON");
        const origin = req.headers.origin;
        if (origin && URL.parse(origin)?.host !== req.headers.host) throw new HttpError(403, "مصدر غير مسموح");
        body = await readJson(req);
      }
      const data = await m.handler({ req, res, params: m.params, query: Object.fromEntries(url.searchParams), body });
      if (data !== undefined && !res.headersSent) sendJson(res, 200, data);
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message });
      console.error(e);
      sendJson(res, 500, { error: "حدث خطأ غير متوقع" });
    }
  }

  const server = http.createServer(handle);
  let timers = [];
  function startJobs() {
    const tick = () => {
      try {
        orders.sweep();
        orders.runPayouts();
      } catch (e) {
        console.error("scheduled job failed:", e);
      }
    };
    tick();
    timers.push(setInterval(tick, 60000), setInterval(() => auth.purge(), 3600000));
  }
  function close() {
    timers.forEach(clearInterval);
    timers = [];
    hub.closeAll();
    server.close();
    db.close();
  }
  return { server, db, hub, orders, auth, startJobs, close };
}

if (require.main === module) {
  const app = createApp();
  app.startJobs();
  app.server.listen(cfg.port, () => {
    console.log(`المجلس يعمل على http://localhost:${cfg.port}`);
  });
  const stop = () => {
    app.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

module.exports = { createApp };
