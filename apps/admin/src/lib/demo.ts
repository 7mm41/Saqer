/**
 * Offline demo of the admin panel (D72): answers from responses recorded from the real API as a demo owner
 * (packages/demo). Read-only: every change is refused with "demo_read_only". Exists only in the build made
 * with KATF_OFFLINE_DEMO=1, which the iPhone app carries in its Debug builds; the real panel never has it.
 */
import type { Replay } from '@katf/demo';
import { BASE_PATH } from './api';

let replay: Promise<Replay> | null = null;

function load(): Promise<Replay> {
  replay ??= (async () => {
    const [{ createReplay }, res] = await Promise.all([import('@katf/demo'), fetch(`${BASE_PATH}demo.json`)]);
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

/** Inside the iPhone app the demo panel can go back to the technician app's start screen. */
export const insideApp = () => Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

export function leaveDemo() {
  window.location.assign('/');
}
