/**
 * API client. In the browser (PWA at /tech) it uses same-origin HttpOnly cookies; inside the
 * iPhone app it uses bearer tokens kept in the Keychain, refreshed and rotated on use.
 */
import { isNative, secureGet, secureSet, deviceId } from './native';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

const BASE = isNative() ? (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://katf.example' : '';
let access: { token: string; exp: number } | null = null;
let refreshing: Promise<boolean> | null = null;

async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'x-requested-with': 'katf', 'x-device-id': await deviceId(), ...extra };
  if (isNative() && access) h.authorization = `Bearer ${access.token}`;
  return h;
}

async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      if (isNative()) {
        const rt = await secureGet('refresh');
        if (!rt) return false;
        const r = await fetch(`${BASE}/api/auth/refresh`, { method: 'POST', headers: { ...(await headers()), 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
        if (!r.ok) {
          if (r.status === 401) await secureSet('refresh', null);
          return false;
        }
        const b = await r.json();
        access = { token: b.accessToken, exp: b.accessExp };
        await secureSet('refresh', b.refreshToken);
        return true;
      }
      const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { ...(await headers()), 'content-type': 'application/json' }, body: '{}' });
      return r.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  if (isNative() && (!access || access.exp * 1000 < Date.now() + 15_000)) await refresh();
  const go = async () =>
    fetch(`${BASE}${path}`, {
      ...init,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      credentials: isNative() ? 'omit' : 'same-origin',
      headers: await headers({ ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...((init.headers as Record<string, string>) ?? {}) }),
    });
  let res = await go().catch(() => {
    throw new ApiError(0, 'network');
  });
  if (res.status === 401 && !path.startsWith('/api/auth/') && (await refresh())) res = await go();
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? 'generic', body?.details);
  return body as T;
}

export async function signInWithOtp(i: { challengeId: string; phone: string; code: string; locale: 'ar' | 'en' }) {
  const native = isNative();
  const r = await api<{ accessToken?: string; accessExp: number; refreshToken?: string; userId: string; isNew: boolean }>('/api/auth/otp/verify', {
    method: 'POST',
    json: { ...i, role: 'technician', tokenMode: native ? 'bearer' : 'cookie', deviceLabel: navigator.userAgent.slice(0, 100) },
  });
  if (native && r.accessToken && r.refreshToken) {
    access = { token: r.accessToken, exp: r.accessExp };
    await secureSet('refresh', r.refreshToken);
  }
  return r;
}

export async function signOut() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  access = null;
  await secureSet('refresh', null);
}

export function uploadFile(file: File, purpose: string, onProgress: (p: number) => void): Promise<string> {
  return new Promise(async (resolve, reject) => {
    if (isNative() && (!access || access.exp * 1000 < Date.now() + 15_000)) await refresh();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}/api/uploads`);
    xhr.withCredentials = !isNative();
    for (const [k, v] of Object.entries(await headers())) xhr.setRequestHeader(k, v);
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
