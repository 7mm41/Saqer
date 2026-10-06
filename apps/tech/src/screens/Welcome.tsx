import { useState } from 'react';
import { Button, Card, Logo, OtpField, PhoneField, useT, Countdown } from '@katf/ui';
import { api, errorText, signInWithOtp } from '../lib/api';
import { useApp } from '../App';

export function Welcome() {
  const { m, locale, reload, config } = useApp();
  const t = useT();
  const [phone, setPhone] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [canResend, setCanResend] = useState(false);
  const name = String((locale === 'en' ? config.settings.app_name_en : config.settings.app_name) ?? 'كتف');

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ challengeId: string; resendIn: number }>('/api/auth/otp/request', { method: 'POST', json: { phone, role: 'technician' } });
      setChallenge(r.challengeId);
      setCode('');
      setCanResend(false);
      setResendAt(Date.now() + r.resendIn * 1000);
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
      await signInWithOtp({ challengeId: challenge, phone, code: c, locale });
      await reload();
    } catch (e) {
      setErr(errorText(t, e));
      setBusy(false);
    }
  };

  return (
    <div className="k-container k-narrow k-stack" style={{ minHeight: '100dvh', justifyContent: 'center', gap: 20, paddingBlock: 32 }}>
      <div className="k-stack k-center" style={{ alignItems: 'center', gap: 10 }}>
        <Logo name={name} size={52} />
        <h1 style={{ fontSize: '1.6rem' }}>{m.welcome.title}</h1>
        <p className="k-muted">{m.app.tagline}</p>
      </div>
      <Card float strong>
        {!challenge ? (
          <form
            className="k-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <p className="k-small k-muted">{m.welcome.body}</p>
            <PhoneField label={m.welcome.phone} value={phone} onChange={setPhone} error={err} autoFocus />
            <Button variant="primary" size="lg" type="submit" loading={busy} disabled={!/^[79]\d{7}$/.test(phone)}>
              {t('otp.send')}
            </Button>
          </form>
        ) : (
          <div className="k-stack">
            <p className="k-small k-muted k-center">{t('otp.codeHint')}</p>
            <OtpField value={code} onChange={setCode} onComplete={(c) => void verify(c)} error={err} label={t('otp.code')} />
            <Button variant="primary" size="lg" loading={busy} disabled={code.length !== 6} onClick={() => void verify()}>
              {m.welcome.signIn}
            </Button>
            <div className="k-row k-between k-small">
              <button type="button" className="k-btn k-btn-quiet k-btn-sm" onClick={() => setChallenge(null)}>
                {t('otp.changeNumber')}
              </button>
              {canResend ? (
                <button type="button" className="k-btn k-btn-quiet k-btn-sm" onClick={() => void send()}>
                  {t('otp.resend')}
                </button>
              ) : (
                <span className="k-muted">
                  <Countdown until={resendAt} onDone={() => setCanResend(true)} />
                </span>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
