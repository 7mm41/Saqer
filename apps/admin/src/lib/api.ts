/**
 * Admin API client. Same-origin, HttpOnly cookies scoped to the secret admin path (SameSite=Strict),
 * CSRF header on every request, one silent refresh on 401.
 */
import { demoRequest } from './demo';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, string | number>,
  ) {
    super(code);
  }
}

/** "/<admin-path>/" from the <base> the API injected. */
export const BASE_PATH = new URL(document.baseURI).pathname.replace(/\/?$/, '/');
const API = `${BASE_PATH}api`;

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'same-origin', headers: { 'x-requested-with': 'katf' } })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export const onSessionLost = { fn: () => {} };

export async function api<T = any>(path: string, init: { method?: string; json?: unknown; raw?: boolean } = {}): Promise<T> {
  if (__KATF_OFFLINE_DEMO__) {
    if (init.raw) throw new ApiError(403, 'demo_read_only'); // downloads (CSV) are not part of the recording
    const r = await demoRequest(init.method ?? 'GET', path);
    if (r.status >= 400) throw new ApiError(r.status, (r.body as { error?: string } | null)?.error ?? 'generic');
    return r.body as T;
  }
  const go = () =>
    fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: { 'x-requested-with': 'katf', ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  let res = await go().catch(() => {
    throw new ApiError(0, 'network');
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refresh()) res = await go();
    else onSessionLost.fn();
  }
  if (init.raw && res.ok) return (await res.blob()) as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onSessionLost.fn();
    throw new ApiError(res.status, body?.error ?? 'generic', body?.details);
  }
  return body as T;
}

export const post = <T = any>(path: string, json: unknown = {}) => api<T>(path, { method: 'POST', json });

/** Downloads a CSV/file from an authenticated endpoint. */
export async function download(path: string, name: string) {
  const blob = await api<Blob>(path, { raw: true });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function errorText(t: (k: string, v?: Record<string, string | number>) => string, e: unknown): string {
  if (e instanceof ApiError) {
    const key = `errors.${e.code}`;
    const s = t(key, e.details);
    return s === key ? t('errors.generic') : s;
  }
  return t('errors.network');
}
