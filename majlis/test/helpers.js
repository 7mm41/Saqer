"use strict";
const { createApp } = require("../server/index");

// يشغّل نسخة من التطبيق بقاعدة بيانات في الذاكرة، ويعيد عملاء HTTP بجلسات مستقلة.
async function startApp() {
  const app = createApp({ dbFile: ":memory:" });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;

  function client() {
    let cookie = "";
    async function call(method, path, body) {
      const res = await fetch(base + path, {
        method,
        headers: { "content-type": "application/json", cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      const data = await res.json();
      return { status: res.status, ...data };
    }
    return {
      get: (p) => call("GET", p),
      post: (p, b = {}) => call("POST", p, b),
      put: (p, b = {}) => call("PUT", p, b),
      del: (p) => call("DELETE", p),
    };
  }

  let phoneSeq = 0;
  async function user(name, extra = {}) {
    const c = client();
    const phone = "05" + String(10000000 + ++phoneSeq).slice(-8);
    const r = await c.post("/api/auth/register", { name, phone, password: "secret-pass", ...extra });
    if (r.status !== 200) throw new Error(r.error);
    c.id = r.user.id;
    return c;
  }

  return { app, base, client, user, close: () => app.close() };
}

module.exports = { startApp };
