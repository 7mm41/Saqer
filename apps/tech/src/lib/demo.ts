/**
 * Offline demo (D72): a labelled demo technician account that works with no server and no internet.
 * The answers are recorded from the real API (packages/demo); the open request can be taken through every
 * step of a job. Nothing typed is saved or sent.
 *
 * Only in iPhone builds whose Xcode setting KATF_OFFLINE_DEMO is YES (Debug, by default) and in local
 * development. The public PWA is built without it (__KATF_OFFLINE_DEMO__ is false there).
 */
import type { Replay } from '@katf/demo';
import { isNative, nativeConfig } from './native';

const KEY = 'katf.offlineDemo';
let replay: Promise<Replay> | null = null;

export function demoActive(): boolean {
  if (!__KATF_OFFLINE_DEMO__) return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** The demo entry shows on the sign-in screen only where the recording ships with the app. */
export async function demoAvailable(): Promise<boolean> {
  if (!__KATF_OFFLINE_DEMO__) return false;
  return isNative() ? (await nativeConfig()).offlineDemo : true;
}

/** The iPhone app also carries the admin panel's offline demo (removed from builds without the demo). */
export const adminDemoUrl = () => (isNative() ? '/admin-demo/index.html' : null);

const fixtureUrl = () => (isNative() ? '/demo/tech.json' : `${import.meta.env.BASE_URL}demo/tech.json`);

function load(): Promise<Replay> {
  replay ??= (async () => {
    const [{ createReplay }, res] = await Promise.all([import('@katf/demo'), fetch(fixtureUrl())]);
    if (!res.ok) throw new Error('offline demo recording missing');
    const r = createReplay(await res.json());
    (window as unknown as { __katfDemo?: Replay }).__katfDemo = r; // read by the browser test
    return r;
  })();
  return replay;
}

export async function demoRequest(method: string, path: string) {
  return (await load()).request(method, path);
}

function restart() {
  window.location.assign(isNative() ? '/' : import.meta.env.BASE_URL);
}

export function enterDemo() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    return;
  }
  restart();
}

export function exitDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  restart();
}
