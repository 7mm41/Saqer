'use client';
/** Client-side API calls: same origin, cookies, CSRF header, one silent refresh on 401. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

async function raw(path: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'x-requested-with': 'katf', ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const opts: RequestInit = { ...init, body: init.json !== undefined ? JSON.stringify(init.json) : init.body };
  let res = await raw(path, opts);
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const r = await raw('/api/auth/refresh', { method: 'POST', body: '{}' });
    if (r.ok) res = await raw(path, opts);
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? 'generic', body?.details);
  return body as T;
}

/** Upload with progress (XHR gives progress events; fetch does not). */
export function uploadFile(file: File, purpose: string, onProgress: (p: number) => void, trackToken?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    xhr.withCredentials = true;
    xhr.setRequestHeader('x-requested-with', 'katf');
    if (trackToken) xhr.setRequestHeader('x-track-token', trackToken);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        const b = JSON.parse(xhr.responseText);
        if (xhr.status < 300) resolve(b.id);
        else reject(new ApiError(xhr.status, b.error ?? 'generic'));
      } catch {
        reject(new ApiError(xhr.status, 'generic'));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'network'));
    const fd = new FormData();
    fd.append('purpose', purpose);
    fd.append('file', file);
    xhr.send(fd);
  });
}

export function errorText(t: (k: string, v?: Record<string, string | number>) => string, e: unknown): string {
  if (e instanceof ApiError) {
    const key = `errors.${e.code}`;
    const s = t(key, (e.details as Record<string, string | number>) ?? undefined);
    return s === key ? t('errors.generic') : s;
  }
  return t('errors.network');
}
