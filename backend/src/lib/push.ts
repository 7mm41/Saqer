import { connect, type ClientHttp2Session } from 'node:http2';
import type { FastifyBaseLogger } from 'fastify';
import { importPKCS8, SignJWT } from 'jose';
import type { Config } from '../config.ts';
import type { Device, Localized } from '../db/schema.ts';

export type PushMessage = {
  title: Localized;
  body: Localized;
  /** Extra keys delivered with the notification (e.g. `venueId` to open a venue). */
  data?: Record<string, string>;
};

export type PushResult = { delivered: number; invalidTokens: string[] };

export interface PushSender {
  /** False when no push provider is configured (messages are only logged). */
  readonly configured: boolean;
  send(devices: Device[], message: PushMessage): Promise<PushResult>;
  close(): Promise<void>;
}

/** APNs when a key is configured, otherwise a logger (development). */
export function createPushSender(config: Config, log: FastifyBaseLogger): PushSender {
  const { apns } = config;
  if (apns.keyId && apns.teamId && apns.privateKey) return new ApnsSender(apns, log);
  return {
    configured: false,
    async send(devices, message) {
      log.info({ devices: devices.length, title: message.title.en }, 'Push (not configured): would notify devices');
      return { delivered: 0, invalidTokens: [] };
    },
    async close() {},
  };
}

/** The payload shown on the phone, in the device's language. */
export function apnsPayload(message: PushMessage, locale: 'ar' | 'en') {
  return {
    aps: {
      alert: { title: message.title[locale], body: message.body[locale] },
      sound: 'default',
    },
    ...message.data,
  };
}

const JWT_TTL_MS = 45 * 60_000; // Apple accepts tokens for up to an hour.
const CONCURRENCY = 20;

class ApnsSender implements PushSender {
  readonly configured = true;
  private session: ClientHttp2Session | null = null;
  private jwt: { token: string; createdAt: number } | null = null;
  private readonly apns: Config['apns'];
  private readonly log: FastifyBaseLogger;

  constructor(apns: Config['apns'], log: FastifyBaseLogger) {
    this.apns = apns;
    this.log = log;
  }

  async send(devices: Device[], message: PushMessage): Promise<PushResult> {
    const targets = devices.filter((d) => d.platform === 'ios');
    const result: PushResult = { delivered: 0, invalidTokens: [] };
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      await Promise.all(targets.slice(i, i + CONCURRENCY).map(async (device) => {
        try {
          const { status, reason } = await this.post(device.token, apnsPayload(message, device.locale));
          if (status === 200) result.delivered += 1;
          else if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') result.invalidTokens.push(device.token);
          else this.log.warn({ status, reason }, 'APNs rejected a notification');
        } catch (error) {
          this.log.warn({ err: error }, 'APNs request failed');
        }
      }));
    }
    return result;
  }

  async close() {
    this.session?.close();
    this.session = null;
  }

  private async token() {
    if (this.jwt && Date.now() - this.jwt.createdAt < JWT_TTL_MS) return this.jwt.token;
    const key = await importPKCS8(this.apns.privateKey, 'ES256');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.apns.keyId })
      .setIssuer(this.apns.teamId)
      .setIssuedAt()
      .sign(key);
    this.jwt = { token, createdAt: Date.now() };
    return token;
  }

  private connection() {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const host = this.apns.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    const session = connect(host);
    session.on('error', (error) => this.log.warn({ err: error }, 'APNs connection error'));
    session.on('close', () => { if (this.session === session) this.session = null; });
    this.session = session;
    return session;
  }

  private async post(deviceToken: string, payload: object): Promise<{ status: number; reason?: string }> {
    const token = await this.token();
    return new Promise((resolve, reject) => {
      const request = this.connection().request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${token}`,
        'apns-topic': this.apns.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0;
      let body = '';
      request.setEncoding('utf8');
      request.on('response', (headers) => { status = Number(headers[':status']); });
      request.on('data', (chunk: string) => { body += chunk; });
      request.on('end', () => {
        let reason: string | undefined;
        try { reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined; } catch { /* empty */ }
        resolve({ status, reason });
      });
      request.on('error', reject);
      request.setTimeout(10_000, () => request.close());
      request.end(JSON.stringify(payload));
    });
  }
}
