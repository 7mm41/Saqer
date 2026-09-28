import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.ts';

export type SmsSender = (phone: string, message: string) => Promise<void>;

/**
 * "console" logs the message (development). "twilio" sends through Twilio's
 * REST API; any Omani SMS gateway (Omantel, Ooredoo bulk SMS...) can be added
 * the same way.
 */
export function createSmsSender(config: Config['sms'], log: FastifyBaseLogger): SmsSender {
  if (config.provider === 'twilio') {
    const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`;
    return async (phone, message) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: `+968${phone}`, From: config.twilioFrom, Body: message }),
      });
      if (!response.ok) throw new Error(`SMS failed with HTTP ${response.status}`);
    };
  }
  return async (phone, message) => {
    log.info({ phone }, `SMS (console provider): ${message}`);
  };
}
