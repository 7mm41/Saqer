// الاتصال بالخادم.
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "تعذّر الاتصال بالخادم، تحقق من الإنترنت");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || "حدث خطأ");
  return data;
}

export const api = {
  get: (p) => call("GET", p),
  post: (p, b = {}) => call("POST", p, b),
  put: (p, b = {}) => call("PUT", p, b),
  del: (p) => call("DELETE", p),
};

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, v);
  const s = p.toString();
  return s ? "?" + s : "";
};
