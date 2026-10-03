import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Languages, ShieldCheck } from 'lucide-react';
import { Banner, Button, Card, Logo, TextField, useT } from '@katf/ui';
import { errorText, post } from '../lib/api';
import type { AdminMessages } from '../messages';

type Step = { kind: 'password' } | { kind: 'totp' } | { kind: 'enroll'; secret: string; uri: string; qr: string } | { kind: 'codes'; codes: string[] };

export function SignIn({ m, notice, onDone, onLang }: { m: AdminMessages; notice: string | null; onDone: () => Promise<void>; onLang: () => void }) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setErr(null), [step.kind]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { email, password };
      if (step.kind === 'totp') body[recovery ? 'recoveryCode' : 'totp'] = code.trim();
      if (step.kind === 'enroll') Object.assign(body, { enrollSecret: step.secret, totp: code.trim() });
      const r = await post<{ status: string; enrollment: { secret: string; uri: string } | null; recoveryCodes: string[] | null }>('/auth/sign-in', body);
      setCode('');
      if (r.status === 'totp_required') setStep({ kind: 'totp' });
      else if (r.status === 'totp_enrollment' && r.enrollment) setStep({ kind: 'enroll', ...r.enrollment, qr: await QRCode.toDataURL(r.enrollment.uri, { margin: 1, width: 360 }) });
      else if (r.recoveryCodes?.length) setStep({ kind: 'codes', codes: r.recoveryCodes });
      else await onDone();
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="k-container k-narrow k-stack" style={{ minHeight: '100dvh', justifyContent: 'center', gap: 20, paddingBlock: 32, maxWidth: 460 }}>
      <div className="k-row k-between">
        <Logo name="كتف" size={44} />
        <button type="button" className="k-icon-btn" aria-label={m.app.lang} onClick={onLang}>
          <Languages size={20} aria-hidden />
        </button>
      </div>
      <h1 style={{ fontSize: '1.5rem' }}>{m.signIn.title}</h1>
      {notice && <Banner tone="warning" title={notice} />}
      <Card float strong>
        {step.kind === 'codes' ? (
          <div className="k-stack">
            <h2 style={{ fontSize: '1.2rem' }}>{m.signIn.codesTitle}</h2>
            <p className="k-small">{m.signIn.codesBody}</p>
            <div className="a-codes" aria-label={m.signIn.codesTitle}>
              {step.codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button variant="primary" size="lg" onClick={() => void onDone()}>
              {m.signIn.codesSaved}
            </Button>
          </div>
        ) : (
          <form
            className="k-stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {step.kind === 'password' && (
              <>
                <TextField label={m.signIn.email} type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                <TextField label={m.signIn.password} type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </>
            )}
            {step.kind === 'enroll' && (
              <>
                <div className="k-row" style={{ gap: 8 }}>
                  <ShieldCheck aria-hidden color="var(--success)" />
                  <strong>{m.signIn.enrollTitle}</strong>
                </div>
                <p className="k-small">{m.signIn.enrollBody}</p>
                <img className="a-qr" src={step.qr} alt="" />
                <p className="k-xs k-muted">{m.signIn.secret}</p>
                <code className="k-ltr k-center" style={{ fontSize: '0.95rem', letterSpacing: 2, overflowWrap: 'anywhere' }}>
                  {step.secret}
                </code>
              </>
            )}
            {(step.kind === 'totp' || step.kind === 'enroll') && (
              <>
                <TextField
                  label={recovery && step.kind === 'totp' ? m.signIn.recovery : m.signIn.totp}
                  hint={recovery ? undefined : m.signIn.totpHint}
                  inputMode={recovery ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  dir="ltr"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                />
                {step.kind === 'totp' && (
                  <button type="button" className="k-btn k-btn-quiet k-btn-sm" onClick={() => setRecovery(!recovery)}>
                    {recovery ? m.signIn.useTotp : m.signIn.useRecovery}
                  </button>
                )}
              </>
            )}
            {err && (
              <span className="k-error" role="alert">
                {err}
              </span>
            )}
            <Button variant="primary" size="lg" type="submit" loading={busy}>
              {m.signIn.submit}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
