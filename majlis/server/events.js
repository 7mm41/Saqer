"use strict";
// بث فوري للمتصفح عبر Server-Sent Events: تحديثات الطلبات، الرسائل، الإشعارات، وحالة "متصل الآن".
const cfg = require("./config");

function createHub(db) {
  const streams = new Map(); // userId -> Set<res>
  const insertNote = db.prepare(
    "INSERT INTO notifications (user_id, title, body, link, created_at) VALUES (?, ?, ?, ?, ?)"
  );
  const touch = db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?");

  function write(res, event, data) {
    res.write("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
  }

  function send(userId, event, data) {
    const set = streams.get(userId);
    if (set) for (const res of set) write(res, event, data);
  }

  function broadcast(event, data) {
    for (const set of streams.values()) for (const res of set) write(res, event, data);
  }

  function isConnected(userId) {
    return streams.has(userId);
  }

  function isOnline(user, now = Date.now()) {
    if (!user.available) return false;
    return isConnected(user.id) || now - user.last_seen_at < cfg.onlineWindowSeconds * 1000;
  }

  function connect(user, req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");
    const wasOnline = streams.has(user.id);
    if (!wasOnline) streams.set(user.id, new Set());
    streams.get(user.id).add(res);
    touch.run(Date.now(), user.id);
    if (!wasOnline) broadcast("presence", { userId: user.id, online: !!user.available });

    const ping = setInterval(() => {
      res.write(": ping\n\n");
      touch.run(Date.now(), user.id);
    }, 25000);

    req.on("close", () => {
      clearInterval(ping);
      const set = streams.get(user.id);
      if (!set) return;
      set.delete(res);
      if (set.size === 0) {
        streams.delete(user.id);
        touch.run(Date.now(), user.id);
        broadcast("presence", { userId: user.id, online: false });
      }
    });
  }

  function notify(userId, title, body = "", link = "") {
    const now = Date.now();
    const r = insertNote.run(userId, title, body, link, now);
    send(userId, "notification", { id: Number(r.lastInsertRowid), title, body, link, created_at: now, read: 0 });
  }

  function closeAll() {
    for (const set of streams.values()) for (const res of set) res.end();
    streams.clear();
  }

  return { connect, send, broadcast, notify, isOnline, isConnected, closeAll };
}

module.exports = { createHub };
