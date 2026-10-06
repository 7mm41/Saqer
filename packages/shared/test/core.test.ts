import { describe, expect, it } from 'vitest';
import {
  BOOKING_STATUSES,
  TRANSITIONS,
  canTransition,
  findTransition,
  type BookingEvent,
  type Actor,
} from '../src/booking';
import { ibanChecksumOk, normaliseOmanIban, normaliseOmanPhone, normaliseCivilId, maskOffPlatform, ageOn, distanceMeters } from '../src/validation';
import { SETTINGS, defaultSettings, validateSetting, renderTemplate, templateVariables } from '../src/settings';
import { generateSlots, muscatToEpoch, inQuietHours, formatTime, muscatDate } from '../src/time';
import { makeT, missingKeys, commonAr, commonEn } from '../src/i18n';

describe('booking state machine', () => {
  const events = [...new Set(TRANSITIONS.map((t) => t.event))] as BookingEvent[];
  const actors: Actor[] = ['customer', 'technician', 'admin', 'system'];

  it('every listed transition is accepted', () => {
    for (const t of TRANSITIONS) for (const f of t.from) for (const a of t.actors) expect(canTransition(f, t.event, a)).toBe(true);
  });

  it('everything else is rejected', () => {
    let rejected = 0;
    for (const s of BOOKING_STATUSES)
      for (const e of events)
        for (const a of actors) {
          const listed = TRANSITIONS.some((t) => t.event === e && t.from.includes(s) && t.actors.includes(a));
          expect(canTransition(s, e, a)).toBe(listed);
          if (!listed) rejected++;
        }
    expect(rejected).toBeGreaterThan(1000);
  });

  it('customers cannot accept, technicians cannot confirm, nobody leaves a final state except admin repair decisions', () => {
    expect(canTransition('requested', 'accept', 'customer')).toBe(false);
    expect(canTransition('completed_pending_confirmation', 'confirm', 'technician')).toBe(false);
    expect(canTransition('cancelled_by_customer', 'accept', 'technician')).toBe(false);
    expect(findTransition('quote_sent', 'approve_quote', 'customer')?.to).toBe('repair_payment_pending');
  });

  it('every non-final status can be left by someone', () => {
    const finals = ['closed_visit_only', 'customer_absent', 'cancelled_by_customer', 'cancelled_by_technician', 'expired', 'expired_unpaid', 'refunded_full', 'refunded_partial', 'repair_failed_closed'];
    for (const s of BOOKING_STATUSES) {
      if (finals.includes(s)) continue;
      expect(TRANSITIONS.some((t) => t.from.includes(s)), s).toBe(true);
    }
  });
});

describe('validation', () => {
  it('Omani phones', () => {
    expect(normaliseOmanPhone('91234567')).toBe('+96891234567');
    expect(normaliseOmanPhone('+968 7123 4567')).toBe('+96871234567');
    expect(normaliseOmanPhone('٩١٢٣٤٥٦٧')).toBe('+96891234567');
    expect(normaliseOmanPhone('81234567')).toBeNull();
    expect(normaliseOmanPhone('9123456')).toBeNull();
  });
  it('IBAN checksum', () => {
    // Example Omani IBAN format from the ISO registry: OM + 2 check digits + 3-digit bank + 16 account
    const body = '0180000001299123456';
    const iban = withCheck('OM', '018' + body.slice(3));
    expect(iban).toHaveLength(23);
    expect(ibanChecksumOk(iban)).toBe(true);
    expect(normaliseOmanIban(iban.toLowerCase())).toBe(iban);
    const broken = iban.slice(0, 22) + ((Number(iban[22]) + 1) % 10);
    expect(normaliseOmanIban(broken)).toBeNull();
    expect(ibanChecksumOk('GB82WEST12345698765432')).toBe(true);
  });
  it('civil id and age', () => {
    expect(normaliseCivilId('12345678')).toBe('12345678');
    expect(normaliseCivilId('1234567')).toBeNull();
    expect(ageOn('2008-10-04', new Date(Date.UTC(2026, 9, 3)))).toBe(17);
    expect(ageOn('2008-10-03', new Date(Date.UTC(2026, 9, 3)))).toBe(18);
  });
  it('masks numbers, WhatsApp and links in chat', () => {
    expect(maskOffPlatform('كلمني على 91234567').flagged).toBe(true);
    expect(maskOffPlatform('راسلني واتساب').flagged).toBe(true);
    expect(maskOffPlatform('WhatsApp me').flagged).toBe(true);
    expect(maskOffPlatform('see https://x.y').text).not.toContain('https');
    expect(maskOffPlatform('سأصل بعد 10 دقائق').flagged).toBe(false);
  });
  it('distance', () => {
    const d = distanceMeters({ lat: 23.6, lng: 58.4 }, { lat: 23.6027, lng: 58.4 });
    expect(Math.round(d)).toBeGreaterThan(290);
    expect(Math.round(d)).toBeLessThan(310);
  });
});

function withCheck(country: string, bban: string): string {
  const rearranged = bban + country + '00';
  let rem = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of v) rem = (rem * 10 + Number(digit)) % 97;
  }
  return `${country}${String(98 - rem).padStart(2, '0')}${bban}`;
}

describe('settings', () => {
  it('defaults are valid', () => {
    const v = defaultSettings();
    for (const s of SETTINGS) expect(validateSetting(s.key, v[s.key]), s.key).toBeNull();
  });
  it('enforces bounds and security minimums', () => {
    expect(validateSetting('commission_pct', 12.5)).toBe('must_be_integer');
    expect(validateSetting('otp_max_attempts', 10)).toBe('above_maximum');
    expect(validateSetting('otp_lock_minutes', 1)).toBe('below_minimum');
    expect(validateSetting('nope', 1)).toBe('unknown_setting');
  });
  it('renders legal variables from settings, leaving empty ones visible', () => {
    const v = defaultSettings();
    const out = renderTemplate('عمولة {{commission_pct}}% ورسم {{visit_fee}} ر.ع في {{APP_NAME}} لدى {{COMPANY_NAME}}', v);
    expect(out).toBe('عمولة 15% ورسم 5.000 ر.ع في كتف لدى [COMPANY_NAME]');
    expect(templateVariables('{{APP_NAME}} {{warranty_days}}')).toEqual(['app_name', 'warranty_days']);
  });
});

describe('time', () => {
  it('Muscat is UTC+4', () => {
    expect(muscatToEpoch('2026-10-04', '08:00')).toBe(Date.UTC(2026, 9, 4, 4, 0));
    expect(muscatDate(Date.UTC(2026, 9, 4, 21, 0))).toBe('2026-10-05');
  });
  it('slots skip Friday and Saturday by default', () => {
    const now = Date.UTC(2026, 9, 1, 0, 0); // Thursday 1 Oct 2026, 04:00 Muscat
    const slots = generateSlots({ now, days: 4, dayStart: '08:00', dayEnd: '20:00', slotMinutes: 120, weekendEnabled: false });
    const days = new Set(slots.map((s) => muscatDate(s.start)));
    expect([...days]).toEqual(['2026-10-01', '2026-10-04']);
    expect(slots.filter((s) => muscatDate(s.start) === '2026-10-01')).toHaveLength(6);
  });
  it('quiet hours cross midnight', () => {
    expect(inQuietHours(muscatToEpoch('2026-10-04', '23:00'), '22:00', '07:00')).toBe(true);
    expect(inQuietHours(muscatToEpoch('2026-10-04', '06:59'), '22:00', '07:00')).toBe(true);
    expect(inQuietHours(muscatToEpoch('2026-10-04', '07:00'), '22:00', '07:00')).toBe(false);
  });
  it('formats 12-hour time with ص/م and Latin digits', () => {
    const s = formatTime(muscatToEpoch('2026-10-04', '15:30'), 'ar');
    expect(s).toMatch(/3:30/);
    expect(s).toMatch(/م/);
  });
});

describe('i18n', () => {
  it('Arabic and English common messages have the same keys', () => {
    expect(missingKeys(commonAr, commonEn)).toEqual([]);
    expect(missingKeys(commonEn, commonAr)).toEqual([]);
  });
  it('interpolates', () => {
    const t = makeT(commonAr);
    expect(t('errors.otp_locked', { minutes: 15 })).toContain('15');
    expect(t('nope.key')).toBe('nope.key');
  });
});
