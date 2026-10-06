/** SMS, push and email providers (§3, §10). Nothing here logs a phone number or message body in production. */
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import http2 from 'node:http2';
import { createSign } from 'node:crypto';
import type { Config } from '../config';
import { maskPhone } from '@katf/shared';

export interface SmsProvider {
  name: string;
  /** a real network that reaches the public */
  real: boolean;
  send(to: string, body: string): Promise<void>;
}

export class ConsoleSms implements SmsProvider {
  name = 'console';
  real = false;
  constructor(private log: (msg: string) => void) {}
  async send(to: string, body: string) {
    this.log(`[sms → ${maskPhone(to)}] ${body}`);
  }
}

export class MockSms implements SmsProvider {
  name = 'mock';
  real = false;
  readonly outbox: { to: string; body: string; at: number }[] = [];
  async send(to: string, body: string) {
    this.outbox.push({ to, body, at: Date.now() });
  }
  lastTo(to: string) {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}

export class TwilioSms implements SmsProvider {
  name = 'twilio';
  real = true;
  constructor(private cfg: Config) {}
  async send(to: string, body: string) {
    const sid = this.cfg.TWILIO_ACCOUNT_SID!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${this.cfg.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: this.cfg.TWILIO_FROM ?? this.cfg.SMS_SENDER, Body: body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`twilio ${res.status}`);
  }
}

/** Generic HTTP gateway for a local Omani SMS provider: POST {to, from, text} with a bearer token. */
export class HttpSms implements SmsProvider {
  name = 'http';
  real = true;
  constructor(private cfg: Config) {}
  async send(to: string, body: string) {
    const res = await fetch(this.cfg.SMS_HTTP_URL!, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.SMS_HTTP_TOKEN ?? ''}` },
      body: JSON.stringify({ to, from: this.cfg.SMS_SENDER, text: body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`sms gateway ${res.status}`);
  }
}

export interface PushTarget {
  kind: 'webpush' | 'apns';
  endpoint: string;
  keys?: Record<string, string> | null;
}

export interface PushProvider {
  send(t: PushTarget, msg: { title: string; body: string; link?: string | null; urgent?: boolean; sound?: string }): Promise<'ok' | 'gone'>;
}

export class RealPush implements PushProvider {
  private apnsJwt: { token: string; at: number } | null = null;
  constructor(private cfg: Config) {
    if (cfg.VAPID_PUBLIC_KEY && cfg.VAPID_PRIVATE_KEY) webpush.setVapidDetails(cfg.VAPID_SUBJECT, cfg.VAPID_PUBLIC_KEY, cfg.VAPID_PRIVATE_KEY);
  }
  async send(t: PushTarget, msg: { title: string; body: string; link?: string | null; urgent?: boolean; sound?: string }) {
    if (t.kind === 'webpush') {
      if (!this.cfg.VAPID_PRIVATE_KEY) return 'ok';
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: (t.keys ?? {}) as { p256dh: string; auth: string } }, JSON.stringify(msg), { TTL: 3600, urgency: msg.urgent ? 'high' : 'normal' });
        return 'ok';
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) return 'gone';
        throw e;
      }
    }
    return this.sendApns(t.endpoint, msg);
  }
  private jwt(): string {
    const now = Math.floor(Date.now() / 1000);
    if (this.apnsJwt && now - this.apnsJwt.at < 3000) return this.apnsJwt.token;
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: this.cfg.APNS_KEY_ID })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: this.cfg.APNS_TEAM_ID, iat: now })).toString('base64url');
    const key = Buffer.from(this.cfg.APNS_KEY_P8_BASE64!, 'base64').toString('utf8');
    const sig = createSign('SHA256').update(`${header}.${claims}`).sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    this.apnsJwt = { token: `${header}.${claims}.${sig}`, at: now };
    return this.apnsJwt.token;
  }
  private sendApns(deviceToken: string, msg: { title: string; body: string; link?: string | null; urgent?: boolean; sound?: string }): Promise<'ok' | 'gone'> {
    if (!this.cfg.APNS_KEY_P8_BASE64 || !this.cfg.APNS_BUNDLE_ID) return Promise.resolve('ok');
    const host = this.cfg.APNS_PRODUCTION ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    return new Promise((resolve, reject) => {
      const client = http2.connect(host);
      client.on('error', reject);
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${this.jwt()}`,
        'apns-topic': this.cfg.APNS_BUNDLE_ID!,
        'apns-push-type': 'alert',
        'apns-priority': msg.urgent ? '10' : '5',
      });
      req.setEncoding('utf8');
      let status = 0;
      req.on('response', (h) => (status = Number(h[':status'])));
      req.on('end', () => {
        client.close();
        if (status === 200) resolve('ok');
        else if (status === 410 || status === 400) resolve('gone');
        else reject(new Error(`apns ${status}`));
      });
      req.on('data', () => {});
      req.end(
        JSON.stringify({
          aps: {
            alert: { title: msg.title, body: msg.body },
            sound: msg.sound ?? 'default',
            'interruption-level': msg.urgent ? 'time-sensitive' : 'active',
          },
          link: msg.link ?? null,
        }),
      );
    });
  }
}

export class MockPush implements PushProvider {
  readonly sent: { target: PushTarget; title: string; body: string }[] = [];
  async send(t: PushTarget, msg: { title: string; body: string }) {
    this.sent.push({ target: t, title: msg.title, body: msg.body });
    return 'ok' as const;
  }
}

export interface MailProvider {
  send(to: string, subject: string, text: string): Promise<void>;
}

export class SmtpMail implements MailProvider {
  private t;
  constructor(private cfg: Config) {
    this.t = cfg.SMTP_URL ? nodemailer.createTransport(cfg.SMTP_URL) : null;
  }
  async send(to: string, subject: string, text: string) {
    if (!this.t) return;
    await this.t.sendMail({ from: this.cfg.MAIL_FROM, to, subject, text });
  }
}
