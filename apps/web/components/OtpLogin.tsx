'use client';
import { useEffect, useState } from 'react';
import { Button, OtpField, PhoneField, useT, Countdown } from '@katf/ui';
import { api, errorText } from '../lib/api';

/** Phone + 6-digit code; signs the customer in with HttpOnly cookies. */
export function OtpLogin({ onDone, phoneLabel, intro, locale }: { onDone: () => void; phoneLabel: string; intro?: string; locale: 'ar' | 'en' }) {
  const t = useT();
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [canResend, setCanResend] = useState(false);
  useEffect(() => setCanResend(false), [resendAt]);

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ challengeId: string; resendIn: number }>('/api/auth/otp/request', { method: 'POST', json: { phone, role: 'customer' } });
      setChallenge(r.challengeId);
      setResendAt(Date.now() + r.resendIn * 1000);
      setCode('');
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const verify = async (c = code) => {
    if (!challenge || c.length !== 6) return;
    setBusy(true);
    setErr(null);
    try {
      await api('/api/auth/otp/verify', { method: 'POST', json: { challengeId: challenge, phone, code: c, role: 'customer', locale, tokenMode: 'cookie' } });
      onDone();
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  if (!challenge)
    return (
      <form
        className="k-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {intro && <p className="k-muted k-small">{intro}</p>}
        <PhoneField label={phoneLabel} value={phone} onChange={setPhone} hint={t('otp.phoneHint')} error={err} />
        <Button variant="primary" type="submit" loading={busy} disabled={!/^[79]\d{7}$/.test(phone)}>
          {t('otp.send')}
        </Button>
      </form>
    );
  return (
    <div className="k-stack">
      <p className="k-muted k-small k-center">{t('otp.codeHint')}</p>
      <OtpField value={code} onChange={setCode} onComplete={(c) => void verify(c)} error={err} label={t('otp.code')} />
      <Button variant="primary" loading={busy} disabled={code.length !== 6} onClick={() => void verify()}>
        {t('otp.verify')}
      </Button>
      <div className="k-row k-between k-small">
        <button type="button" className="k-btn k-btn-quiet k-btn-sm" onClick={() => setChallenge(null)}>
          {t('otp.changeNumber')}
        </button>
        {canResend || Date.now() >= resendAt ? (
          <button type="button" className="k-btn k-btn-quiet k-btn-sm" onClick={() => void send()}>
            {t('otp.resend')}
          </button>
        ) : (
          <span className="k-muted">
            {t('otp.resendIn', { s: '' })} <Countdown until={resendAt} onDone={() => setCanResend(true)} />
          </span>
        )}
      </div>
    </div>
  );
}
