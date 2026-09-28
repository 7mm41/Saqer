import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Role } from '../db/schema.ts';

/**
 * Live updates over Server-Sent Events (`GET /v1/live`).
 *
 * The app and the dashboard keep one stream open while they are in the
 * foreground. When anything changes — an admin edits a venue, a plan price
 * changes, staff redeem a code, a membership is granted — the server pushes a
 * small event and clients refresh just that part. Nobody has to sign out and
 * back in to see a change.
 *
 * Events:
 *   catalog     venues/offers/events changed          → every signed-in client
 *   offer       { offerId, venueId, remaining }        → every signed-in client (scarcity counter)
 *   plans       membership plans changed               → every signed-in client
 *   config      seasonal theme / reminder settings      → every signed-in client
 *   membership  this member's membership changed       → that member
 *   bookings    this member's codes changed            → that member
 *   account     profile/status/role changed            → that member (re-fetch /me; 401/403 → signed out)
 *   admin       { topic }                              → admin & staff dashboards
 *
 * Suspending a member or signing a device out also closes its streams (after
 * an `account` event with `{ revoked: true }`), on every instance.
 */
export type LiveEvent =
  | { type: 'catalog' | 'plans' | 'config'; audience: 'all' }
  | { type: 'offer'; audience: 'all'; data: { offerId: string; venueId: string; remaining: number | null } }
  | { type: 'membership' | 'bookings' | 'account'; audience: 'user'; userId: string }
  | { type: 'admin'; audience: 'staff'; data: { topic: AdminTopic } }
  | { type: 'revoke'; audience: 'user'; userId: string }
  | { type: 'revoke'; audience: 'session'; sessionId: string };

export type AdminTopic = 'members' | 'memberships' | 'bookings' | 'catalog' | 'plans' | 'themes' | 'notifications';

type Client = { id: string; userId: string; sessionId: string; role: Role; stream: ServerResponse };

/** Transport between server instances (Postgres LISTEN/NOTIFY), or none for a single process. */
export type LiveBridge = {
  publish: (payload: string) => Promise<void>;
  subscribe: (onMessage: (payload: string) => void) => Promise<() => Promise<void>>;
};

const HEARTBEAT_MS = 25_000;

export class LiveHub {
  private readonly clients = new Map<string, Client>();
  private heartbeat: NodeJS.Timeout | null = null;
  private unsubscribe: (() => Promise<void>) | null = null;
  private readonly bridge: LiveBridge | null;

  constructor(bridge: LiveBridge | null = null) {
    this.bridge = bridge;
  }

  async start() {
    if (this.bridge) {
      this.unsubscribe = await this.bridge.subscribe((payload) => {
        try {
          this.deliver(JSON.parse(payload) as LiveEvent);
        } catch {
          // Ignore malformed notifications.
        }
      });
    }
    // Comment lines keep proxies and mobile networks from closing idle streams.
    this.heartbeat = setInterval(() => {
      for (const client of this.clients.values()) client.stream.write(': ping\n\n');
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  async stop() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    await this.unsubscribe?.();
    for (const client of this.clients.values()) client.stream.end();
    this.clients.clear();
  }

  get connectionCount() {
    return this.clients.size;
  }

  /** Registers an open SSE response; returns a function that removes it. */
  add(client: Omit<Client, 'id'>): () => void {
    const id = randomUUID();
    this.clients.set(id, { ...client, id });
    return () => this.clients.delete(id);
  }

  /** Sends the event to every instance (or delivers it locally without a bridge). Never throws. */
  publish(...events: LiveEvent[]) {
    for (const event of events) {
      if (this.bridge) {
        this.bridge.publish(JSON.stringify(event)).catch(() => this.deliver(event));
      } else {
        this.deliver(event);
      }
    }
  }

  private deliver(event: LiveEvent) {
    if (event.type === 'revoke') {
      for (const [id, client] of this.clients) {
        const matches = event.audience === 'user' ? client.userId === event.userId : client.sessionId === event.sessionId;
        if (!matches) continue;
        client.stream.end('event: account\ndata: {"revoked":true}\n\n');
        this.clients.delete(id);
      }
      return;
    }
    const data = 'data' in event ? event.data : {};
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients.values()) {
      const matches = event.audience === 'all'
        || (event.audience === 'user' && client.userId === event.userId)
        || (event.audience === 'staff' && (client.role === 'admin' || client.role === 'staff'));
      if (matches) client.stream.write(frame);
    }
  }
}

/** Shorthands used by the routes. */
export const live = {
  catalogChanged: (): LiveEvent[] => [
    { type: 'catalog', audience: 'all' },
    { type: 'admin', audience: 'staff', data: { topic: 'catalog' } },
  ],
  plansChanged: (): LiveEvent[] => [
    { type: 'plans', audience: 'all' },
    { type: 'admin', audience: 'staff', data: { topic: 'plans' } },
  ],
  configChanged: (): LiveEvent[] => [
    { type: 'config', audience: 'all' },
    { type: 'admin', audience: 'staff', data: { topic: 'themes' } },
  ],
  membershipChanged: (userId: string): LiveEvent[] => [
    { type: 'membership', audience: 'user', userId },
    { type: 'admin', audience: 'staff', data: { topic: 'memberships' } },
  ],
  bookingsChanged: (userId: string): LiveEvent[] => [
    { type: 'bookings', audience: 'user', userId },
    { type: 'admin', audience: 'staff', data: { topic: 'bookings' } },
  ],
  accountChanged: (userId: string): LiveEvent[] => [
    { type: 'account', audience: 'user', userId },
    { type: 'admin', audience: 'staff', data: { topic: 'members' } },
  ],
  offerRemaining: (offerId: string, venueId: string, remaining: number | null): LiveEvent =>
    ({ type: 'offer', audience: 'all', data: { offerId, venueId, remaining } }),
  admin: (topic: AdminTopic): LiveEvent => ({ type: 'admin', audience: 'staff', data: { topic } }),
  revokeUser: (userId: string): LiveEvent => ({ type: 'revoke', audience: 'user', userId }),
  revokeSession: (sessionId: string): LiveEvent => ({ type: 'revoke', audience: 'session', sessionId }),
};
