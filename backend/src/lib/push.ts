import { connect, type ClientHttp2Session } from 'node:http2';
import type { FastifyBaseLogger } from 'fastify';
import { importPKCS8, SignJWT } from 'jose';
import type { Config } from '../config.ts';
import type { Device, Localized } from '../db/schema.ts';

/**
 * Apple has two gateways, and a phone's token works on one only: apps run from
 * Xcode use the sandbox, TestFlight and App Store installs use production.
 */
export type ApnsEnvironment = 'sandbox' | 'production';

export type PushMessage = {
  title: Localized;
  body: Localized;
  /** Extra keys delivered with the notification (e.g. `venueId` to open a venue). */
  data?: Record<string, string>;
};

/** What happened for one phone. `reason` is Apple's (e.g. `BadDeviceToken`) or ours (`Timeout`, `KeyUnreadable`). */
export type PushOutcome = { token: string; ok: boolean; status: number; reason?: string; environment: ApnsEnvironment };

export type PushResult = {
  delivered: number;
  /** Tokens Apple no longer accepts (the app was deleted): forget them. */
  invalidTokens: string[];
  /** Phones that turned out to use the other gateway: remember it for next time. */
  environments: { token: string; environment: ApnsEnvironment }[];
  /** Why the others didn't arrive, e.g. `{ InvalidProviderToken: 2 }`. */
  failures: Record<string, number>;
  outcomes: PushOutcome[];
};

/** For the control panel: is push set up, and if not, what is missing or wrong. */
export type PushStatus = {
  configured: boolean;
  /** Settings still empty in backend/.env. */
  missing: string[];
  /** A setting that is filled in but can't work (e.g. the key file can't be read). */
  problem: string | null;
  bundleId: string;
  /** Used for phones registered by older app versions, which didn't say which gateway they use. */
  defaultEnvironment: ApnsEnvironment;
  recentFailures: { at: string; reason: string; environment: ApnsEnvironment; topic: string }[];
};

export interface PushSender {
  /** False when no push provider is configured (messages are only logged). */
  readonly configured: boolean;
  send(devices: Device[], message: PushMessage): Promise<PushResult>;
  status(): PushStatus;
  close(): Promise<void>;
}

export const emptyPushResult = (): PushResult => ({ delivered: 0, invalidTokens: [], environments: [], failures: {}, outcomes: [] });

/**
 * A .p8 key as pasted into .env: with or without its BEGIN/END lines, with
 * `\n` written out, or wrapped in quotes. Returns it in PEM form.
 */
export function normalizePem(raw: string): string {
  let text = raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim();
  if (!text.includes('-----BEGIN')) {
    const body = text.replace(/\s+/g, '');
    text = `-----BEGIN PRIVATE KEY-----\n${(body.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----`;
  }
  return `${text}\n`;
}

/** Empty settings, and settings that are filled in but can't be right. */
export function checkApnsSettings(apns: Config['apns']) {
  const missing: string[] = [];
  if (!apns.keyId) missing.push('APNS_KEY_ID');
  if (!apns.teamId) missing.push('APNS_TEAM_ID');
  if (!apns.privateKey && !apns.keyError) missing.push('APNS_KEY_FILE');
  let problem = apns.keyError;
  if (!problem && apns.keyId && !/^[A-Z0-9]{10}$/.test(apns.keyId)) problem = 'APNS_KEY_ID should be the 10-character Key ID shown next to the key on developer.apple.com.';
  if (!problem && apns.teamId && !/^[A-Z0-9]{10}$/.test(apns.teamId)) problem = 'APNS_TEAM_ID should be your 10-character Team ID (developer.apple.com › Membership).';
  return { missing, problem };
}

/** APNs when a key is configured, otherwise a logger (development). `hosts` points tests at a local server. */
export function createPushSender(config: Config, log: FastifyBaseLogger, hosts: Record<ApnsEnvironment, string> = APPLE_HOSTS): PushSender {
  const { apns } = config;
  const { missing, problem } = checkApnsSettings(apns);
  if (!missing.length && !problem) return new ApnsSender(apns, log, hosts);
  if (problem) log.warn(`Push notifications are off: ${problem}`);
  else if (missing.length < 3) log.warn(`Push notifications are off: set ${missing.join(', ')} in backend/.env.`);
  return {
    configured: false,
    async send(devices, message) {
      log.info({ devices: devices.length, title: message.title.en }, 'Push (not configured): would notify devices');
      const result = emptyPushResult();
      if (devices.length) result.failures.NotConfigured = devices.length;
      return result;
    },
    status: () => ({
      configured: false, missing, problem, bundleId: apns.bundleId,
      defaultEnvironment: apns.production ? 'production' : 'sandbox', recentFailures: [],
    }),
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
const APPLE_HOSTS: Record<ApnsEnvironment, string> = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
};

class ApnsSender implements PushSender {
  readonly configured = true;
  private readonly sessions = new Map<ApnsEnvironment, ClientHttp2Session>();
  private jwt: { token: string; createdAt: number } | null = null;
  private keyProblem: string | null = null;
  private readonly recent: PushStatus['recentFailures'] = [];
  private readonly apns: Config['apns'];
  private readonly log: FastifyBaseLogger;
  private readonly hosts: Record<ApnsEnvironment, string>;

  constructor(apns: Config['apns'], log: FastifyBaseLogger, hosts: Record<ApnsEnvironment, string>) {
    this.apns = apns;
    this.log = log;
    this.hosts = hosts;
  }

  private get defaultEnvironment(): ApnsEnvironment {
    return this.apns.production ? 'production' : 'sandbox';
  }

  status(): PushStatus {
    return {
      configured: true, missing: [], problem: this.keyProblem, bundleId: this.apns.bundleId,
      defaultEnvironment: this.defaultEnvironment, recentFailures: [...this.recent],
    };
  }

  async send(devices: Device[], message: PushMessage): Promise<PushResult> {
    const targets = devices.filter((d) => d.platform === 'ios');
    const result = emptyPushResult();
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const outcomes = await Promise.all(targets.slice(i, i + CONCURRENCY).map((device) => this.deliver(device, message)));
      for (const [index, outcome] of outcomes.entries()) {
        const device = targets[i + index]!;
        result.outcomes.push(outcome);
        if (outcome.ok) {
          result.delivered += 1;
          if (device.environment !== outcome.environment) result.environments.push({ token: device.token, environment: outcome.environment });
          continue;
        }
        const reason = outcome.reason ?? `HTTP ${outcome.status}`;
        result.failures[reason] = (result.failures[reason] ?? 0) + 1;
        if (outcome.status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered') result.invalidTokens.push(device.token);
      }
    }
    return result;
  }

  async close() {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }

  /** Sends to the phone's gateway; a token the other gateway knows is retried there. */
  private async deliver(device: Device, message: PushMessage): Promise<PushOutcome> {
    const topic = device.bundleId || this.apns.bundleId;
    const payload = apnsPayload(message, device.locale);
    const first = device.environment ?? this.defaultEnvironment;
    let outcome = await this.attempt(first, device.token, topic, payload);
    if (outcome.reason === 'BadDeviceToken') {
      const retry = await this.attempt(first === 'sandbox' ? 'production' : 'sandbox', device.token, topic, payload);
      if (retry.reason !== 'BadDeviceToken') outcome = retry;
    }
    if (!outcome.ok) {
      this.recent.unshift({ at: new Date().toISOString(), reason: outcome.reason ?? `HTTP ${outcome.status}`, environment: outcome.environment, topic });
      this.recent.length = Math.min(this.recent.length, 20);
      this.log.warn({ status: outcome.status, reason: outcome.reason, environment: outcome.environment, topic }, 'APNs did not deliver a notification');
    }
    return outcome;
  }

  private async attempt(environment: ApnsEnvironment, token: string, topic: string, payload: object): Promise<PushOutcome> {
    try {
      const { status, reason } = await this.post(environment, token, topic, payload);
      // Apple wants a fresh signed token after this; the key itself may still be fine.
      if (reason === 'ExpiredProviderToken') this.jwt = null;
      return { token, ok: status === 200, status, reason, environment };
    } catch (error) {
      const reason = this.keyProblem ? 'KeyUnreadable' : 'NetworkError';
      if (!this.keyProblem) this.log.warn({ err: error }, 'APNs request failed');
      return { token, ok: false, status: 0, reason, environment };
    }
  }

  private async token() {
    if (this.jwt && Date.now() - this.jwt.createdAt < JWT_TTL_MS) return this.jwt.token;
    let key: Awaited<ReturnType<typeof importPKCS8>>;
    try {
      key = await importPKCS8(this.apns.privateKey, 'ES256');
      this.keyProblem = null;
    } catch (error) {
      this.keyProblem = `The APNs key (.p8) couldn't be read: ${(error as Error).message}. Use the AuthKey_XXXXXXXXXX.p8 file downloaded from developer.apple.com › Keys.`;
      this.log.error(this.keyProblem);
      throw error;
    }
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.apns.keyId })
      .setIssuer(this.apns.teamId)
      .setIssuedAt()
      .sign(key);
    this.jwt = { token, createdAt: Date.now() };
    return token;
  }

  private connection(environment: ApnsEnvironment) {
    const open = this.sessions.get(environment);
    if (open && !open.closed && !open.destroyed) return open;
    const session = connect(this.hosts[environment]);
    session.on('error', (error) => this.log.warn({ err: error, environment }, 'APNs connection error'));
    session.on('close', () => { if (this.sessions.get(environment) === session) this.sessions.delete(environment); });
    this.sessions.set(environment, session);
    return session;
  }

  private async post(environment: ApnsEnvironment, deviceToken: string, topic: string, payload: object): Promise<{ status: number; reason?: string }> {
    const token = await this.token();
    return new Promise((resolve, reject) => {
      const request = this.connection(environment).request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${token}`,
        'apns-topic': topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let status = 0;
      let body = '';
      let settled = false;
      const finish = (value: { status: number; reason?: string }) => {
        if (!settled) { settled = true; resolve(value); }
      };
      request.setEncoding('utf8');
      request.on('response', (headers) => { status = Number(headers[':status']); });
      request.on('data', (chunk: string) => { body += chunk; });
      request.on('end', () => {
        let reason: string | undefined;
        try { reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined; } catch { /* empty */ }
        finish({ status, reason });
      });
      // A request closed without an answer (timeout, dropped connection).
      request.on('close', () => finish({ status, reason: status ? undefined : 'Timeout' }));
      request.on('error', (error) => { if (!settled) { settled = true; reject(error); } });
      request.setTimeout(10_000, () => request.close());
      request.end(JSON.stringify(payload));
    });
  }
}
