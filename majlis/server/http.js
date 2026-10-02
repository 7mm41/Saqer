"use strict";
// موجّه HTTP بسيط بدون مكتبات خارجية.
const fs = require("node:fs");
const path = require("node:path");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (msg) => new HttpError(400, msg);
const forbidden = (msg = "غير مسموح") => new HttpError(403, msg);
const notFound = (msg = "غير موجود") => new HttpError(404, msg);

function createRouter() {
  const routes = [];
  function add(method, pattern, handler) {
    const keys = [];
    const re = new RegExp(
      "^" + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$"
    );
    routes.push({ method, re, keys, handler });
  }
  function match(method, pathname) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
    return null;
  }
  return {
    get: (p, h) => add("GET", p, h),
    post: (p, h) => add("POST", p, h),
    put: (p, h) => add("PUT", p, h),
    del: (p, h) => add("DELETE", p, h),
    match,
  };
}

function readJson(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "الطلب كبير جداً"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(v && typeof v === "object" ? v : {});
      } catch {
        reject(bad("صيغة البيانات غير صحيحة"));
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(header = "") {
  const out = {};
  header.split(";").forEach((p) => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".ico": "image/x-icon",
};

function serveStatic(root, req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep)) return false;
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(file).pipe(res);
  return true;
}

// أدوات تحقق من المدخلات
function str(v, { max = 500, min = 0, field = "الحقل" } = {}) {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (s.length < min) throw bad(min === 1 ? `${field} مطلوب` : `${field} قصير جداً`);
  if (s.length > max) throw bad(`${field} طويل جداً`);
  return s;
}
function int(v, { min = -Infinity, max = Infinity, field = "القيمة" } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${field} غير صحيحة`);
  return n;
}
function coord(v, lim) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) > lim) throw bad("إحداثيات الموقع غير صحيحة");
  return n;
}
function list(v, { maxItems = 20, maxLen = 40 } = {}) {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,،\n]/) : [];
  const out = [];
  for (const x of arr) {
    const s = String(x).trim().slice(0, maxLen);
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, maxItems);
}

module.exports = {
  HttpError, bad, forbidden, notFound,
  createRouter, readJson, parseCookies, sendJson, serveStatic,
  str, int, coord, list,
};
