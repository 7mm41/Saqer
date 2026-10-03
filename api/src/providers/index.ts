import type { Config } from '../config';
import type { Crypto } from '../lib/crypto';
import { MockPayments, ThawaniPayments, type PaymentProvider } from './payments';
import { ConsoleSms, HttpSms, MockSms, MockPush, RealPush, SmtpMail, TwilioSms, type MailProvider, type PushProvider, type SmsProvider } from './messaging';

export interface Providers {
  payments: PaymentProvider;
  sms: SmsProvider;
  push: PushProvider;
  mail: MailProvider;
}

export function makeProviders(cfg: Config, crypto: Crypto, log: (m: string) => void): Providers {
  const payments: PaymentProvider =
    cfg.PAYMENT_PROVIDER === 'thawani' ? new ThawaniPayments(cfg) : new MockPayments(cfg.API_PUBLIC_URL, (s) => crypto.sign(s, 'url'));
  const sms: SmsProvider =
    cfg.SMS_PROVIDER === 'twilio' ? new TwilioSms(cfg) : cfg.SMS_PROVIDER === 'http' ? new HttpSms(cfg) : cfg.SMS_PROVIDER === 'mock' ? new MockSms() : new ConsoleSms(log);
  const push: PushProvider = cfg.NODE_ENV === 'test' ? new MockPush() : new RealPush(cfg);
  return { payments, sms, push, mail: new SmtpMail(cfg) };
}

export * from './payments';
export * from './messaging';
