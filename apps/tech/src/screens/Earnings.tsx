import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Printer, FileText, Landmark, ArrowRight, ArrowLeft } from 'lucide-react';
import { formatDateShort, formatPercent } from '@katf/shared';
import { Banner, Button, Card, Money, MoneyRow, OtpField, SkeletonCard, Stat, StatusPill, TextField, useT, useToast } from '@katf/ui';
import { api, errorText } from '../lib/api';
import { useApp } from '../App';
import { BankForm } from './Register';

export function Earnings() {
  const { m, locale, f, config } = useApp();
  const t = useT();
  const [e, setE] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [bankOpen, setBankOpen] = useState(false);
  const nav = useNavigate();
  const load = async () => {
    setE(await api('/api/tech/earnings'));
    setProfile(await api('/api/tech/profile'));
  };
  useEffect(() => {
    void load();
  }, []);
  if (!e) return <div className="k-stack"><SkeletonCard /><SkeletonCard /></div>;
  return (
    <div className="k-stack" style={{ gap: 14 }}>
      <h1 style={{ fontSize: '1.5rem' }}>{m.earnings.title}</h1>
      <div className="k-grid" style={{ '--min': '150px' } as React.CSSProperties}>
        <Card tight><Stat label={m.earnings.awaiting} value={<span className="k-num">{e.awaitingConfirmation.length}</span>} /></Card>
        <Card tight><Stat label={m.earnings.scheduled} value={<Money baisa={e.scheduled + e.inBatch} />} /></Card>
        <Card tight><Stat label={m.earnings.paid} value={<Money baisa={e.paid} />} /></Card>
      </div>
      {e.scheduledItems.length > 0 && (
        <Card title={m.earnings.scheduled}>
          {e.scheduledItems.map((x: any) => (
            <MoneyRow key={x.id} label={<span className="k-small">{m.earnings.payoutDate}: {formatDateShort(Date.parse(x.dueAt), locale)}</span>} baisa={x.amount} />
          ))}
        </Card>
      )}
      <Card title={m.earnings.jobs}>
        <div className="k-list">
          {e.jobs.length === 0 && <span className="k-muted k-small">{t('states.empty')}</span>}
          {e.jobs.map((j: any) => (
            <Link key={j.id} to={`/jobs/${j.id}`} className="k-list-row" style={{ alignItems: 'flex-start' }}>
              <div className="k-stack k-grow" style={{ gap: 2 }}>
                <span className="k-row" style={{ gap: 8 }}>
                  <strong className="k-num">{j.code}</strong>
                  <StatusPill status={j.status} label={t(`status.${j.status}`)} />
                </span>
                <span className="k-xs k-muted">{formatDateShort(Date.parse(j.date), locale)}</span>
                <span className="k-small">{m.earnings.customerPaid}: <Money baisa={j.customerPaid} /></span>
                <span className="k-small">{f(m.earnings.commission, { pct: formatPercent(j.commissionBps) })}: <Money baisa={j.commission} /></span>
                {j.payoutDueAt && <span className="k-xs k-muted">{m.earnings.payoutDate}: {formatDateShort(Date.parse(j.payoutDueAt), locale)}</span>}
              </div>
              <Money baisa={j.net} strong />
            </Link>
          ))}
        </div>
      </Card>
      {e.payouts.length > 0 && (
        <Card title={m.earnings.payouts}>
          {e.payouts.map((p: any) => (
            <MoneyRow key={p.id} label={<span className="k-small">{p.paidAt ? formatDateShort(Date.parse(p.paidAt), locale) : '—'} · {m.earnings.reference} <span className="k-num">{p.bankReference ?? '—'}</span></span>} baisa={p.amount} />
          ))}
        </Card>
      )}
      {e.adjustments.length > 0 && (
        <Card title={m.earnings.adjustments}>
          {e.adjustments.map((a: any) => (
            <MoneyRow key={a.id} label={<span className="k-small">{a.reason}</span>} baisa={a.amount} />
          ))}
        </Card>
      )}
      <Card title={m.earnings.statement} icon={<FileText size={20} aria-hidden />}>
        <div className="k-row">
          <input className="k-input k-grow" type="month" value={month} onChange={(ev) => setMonth(ev.target.value)} aria-label={m.earnings.month} />
          <Button variant="secondary" onClick={() => nav(`/statement/${month}`)}>
            {t('actions.open')}
          </Button>
        </div>
      </Card>
      <Card title={m.earnings.bank} icon={<Landmark size={20} aria-hidden />}>
        {profile?.bank && (
          <div className="k-stack" style={{ gap: 6 }}>
            <span>{profile.bank.bankName}</span>
            <span className="k-ltr k-num">{profile.bank.ibanMasked}</span>
            {profile.bank.lockedUntil && Date.parse(profile.bank.lockedUntil) > Date.now() && <Banner tone="warning" title={f(m.earnings.locked, { date: formatDateShort(Date.parse(profile.bank.lockedUntil), locale) })} />}
          </div>
        )}
        {!bankOpen ? (
          <Button variant="quiet" onClick={() => setBankOpen(true)}>
            {m.earnings.changeBank}
          </Button>
        ) : (
          <BankChange onDone={() => (setBankOpen(false), load())} hours={Number(config.settings.bank_change_lock_hours ?? 48)} />
        )}
      </Card>
    </div>
  );
}

function BankChange({ onDone, hours }: { onDone: () => void; hours: number }) {
  const { m, f } = useApp();
  const t = useT();
  const toast = useToast();
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="k-stack">
      <p className="k-small k-muted">{f(m.earnings.changeBankBody, { h: hours })}</p>
      {!challenge ? (
        <Button
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await api<{ challengeId: string }>('/api/tech/bank/otp', { method: 'POST' });
              setChallenge(r.challengeId);
            } catch (e) {
              toast(errorText(t, e), 'danger');
            } finally {
              setBusy(false);
            }
          }}
        >
          {m.earnings.sendCode}
        </Button>
      ) : (
        <BankForm
          initial={{}}
          busy={busy}
          submitLabel={t('actions.save')}
          extra={<OtpField value={code} onChange={setCode} label={t('otp.code')} />}
          onSave={async (d) => {
            setBusy(true);
            try {
              await api('/api/tech/bank', { method: 'POST', json: { ...d, challengeId: challenge, code } });
              toast(m.account.saved, 'success');
              onDone();
            } catch (e) {
              toast(errorText(t, e), 'danger');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      <TextField hidden aria-hidden value="" readOnly />
    </div>
  );
}

/** Monthly statement — print / "Save as PDF" from the share sheet. */
export function Statement() {
  const { month } = useParams();
  const { m, locale } = useApp();
  const t = useT();
  const nav = useNavigate();
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    void api(`/api/tech/statement?month=${month}`).then(setS);
  }, [month]);
  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;
  if (!s) return <SkeletonCard lines={6} />;
  return (
    <div className="k-stack" style={{ gap: 12 }}>
      <div className="k-row k-between k-no-print">
        <button type="button" className="k-btn k-btn-quiet" onClick={() => nav(-1)}>
          <Back size={18} aria-hidden /> {t('actions.back')}
        </button>
        <Button variant="secondary" icon={<Printer size={18} aria-hidden />} onClick={() => window.print()}>
          PDF
        </Button>
      </div>
      <Card>
        <div className="k-stack" style={{ gap: 4 }}>
          <strong style={{ fontSize: '1.2rem' }}>{s.appName}</strong>
          {s.company && <span className="k-small">{s.company} {s.cr && <>· CR <span className="k-num">{s.cr}</span></>}</span>}
          <span>{m.earnings.statement} — <span className="k-num">{s.month}</span></span>
          <span className="k-small k-muted">{s.technician}</span>
        </div>
        <hr className="k-divider" />
        {s.jobs.map((j: any) => (
          <MoneyRow key={j.code} label={<span className="k-small"><span className="k-num">{j.code}</span> · {formatDateShort(Date.parse(j.date), locale)}</span>} baisa={j.net} />
        ))}
        {s.adjustments.map((a: any, i: number) => (
          <MoneyRow key={i} label={<span className="k-small">{a.reason}</span>} baisa={a.amount} />
        ))}
        <MoneyRow label={m.earnings.net} baisa={s.totals.net} total />
        <MoneyRow label={m.earnings.paid} baisa={s.totals.paid} />
      </Card>
    </div>
  );
}
