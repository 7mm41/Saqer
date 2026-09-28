import { useEffect, useRef, useState } from 'react';
import { session } from './api';

export type AdminTopic = 'members' | 'memberships' | 'bookings' | 'catalog' | 'plans' | 'themes' | 'notifications';
type Listener = (topic: AdminTopic) => void;

const listeners = new Set<Listener>();
let connected = false;
const connectionListeners = new Set<(on: boolean) => void>();
let controller: AbortController | null = null;

function setConnected(value: boolean) {
  connected = value;
  connectionListeners.forEach((listener) => listener(value));
}

/**
 * One Server-Sent Events stream (`/v1/live`) for the whole dashboard. When the
 * app or another admin changes something, the pages showing it refresh by
 * themselves. Uses fetch (EventSource can't send the Authorization header)
 * and reconnects with back-off.
 */
async function run(signal: AbortSignal) {
  let attempt = 0;
  while (!signal.aborted && session.token) {
    try {
      const response = await fetch('/v1/live', { headers: { Authorization: `Bearer ${session.token}`, Accept: 'text/event-stream' }, signal });
      if (!response.ok || !response.body) throw new Error(`live ${response.status}`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let first = true;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (event === 'ready') {
            setConnected(true);
            attempt = 0;
            // After a reconnect everything may be stale.
            if (!first) (['members', 'memberships', 'bookings', 'catalog', 'plans', 'themes', 'notifications'] as AdminTopic[]).forEach(emit);
            first = false;
          } else if (event === 'admin' && data) {
            emit((JSON.parse(data) as { topic: AdminTopic }).topic);
          }
        }
      }
    } catch {
      // Fall through to the back-off.
    }
    setConnected(false);
    if (signal.aborted) return;
    attempt += 1;
    await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 1_000 * 2 ** attempt)));
  }
}

function emit(topic: AdminTopic) {
  listeners.forEach((listener) => listener(topic));
}

export function startLive() {
  controller?.abort();
  controller = new AbortController();
  void run(controller.signal);
}

export function stopLive() {
  controller?.abort();
  controller = null;
  setConnected(false);
}

/** Calls `refresh` whenever one of `topics` changes on the server. */
export function useLive(topics: AdminTopic[], refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;
  const key = topics.join(',');
  useEffect(() => {
    const wanted = new Set(key.split(','));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener: Listener = (topic) => {
      if (!wanted.has(topic)) return;
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(), 250); // bursts → one refresh
    };
    listeners.add(listener);
    return () => { listeners.delete(listener); clearTimeout(timer); };
  }, [key]);
}

export function useLiveConnected() {
  const [on, setOn] = useState(connected);
  useEffect(() => {
    connectionListeners.add(setOn);
    return () => { connectionListeners.delete(setOn); };
  }, []);
  return on;
}
