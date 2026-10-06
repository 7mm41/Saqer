import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Circle, LogOut } from 'lucide-react';
import { formatDateShort } from '@katf/shared';
import { Banner, Button, Card, Spinner, StatusPill } from '@katf/ui';
import { api, signOut } from '../lib/api';
import { useApp } from '../App';

export function Status() {
  const { m, locale, reload, f } = useApp();
  const nav = useNavigate();
  const [s, setS] = useState<any>(null);
  useEffect(() => {
    void api('/api/tech/application').then(setS);
  }, []);
  if (!s) return <div className="k-container" style={{ paddingTop: 40 }}><Spinner /></div>;
  const keys = Object.keys(m.status.checklist) as (keyof typeof m.status.checklist)[];
  const label = (m.status as Record<string, unknown>)[s.status] as string | undefined;
  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 16, paddingBlock: 24 }}>
      <div className="k-row k-between">
        <h1 style={{ fontSize: '1.5rem' }}>{m.status.title}</h1>
        <StatusPill label={label ?? s.status} tone={s.status === 'rejected' ? 'danger' : s.status === 'needs_info' ? 'warning' : 'info'} />
      </div>
      {s.status === 'needs_info' && (
        <Banner tone="warning" title={m.status.requested} action={<Button size="sm" variant="primary" onClick={() => nav('/register')}>{m.status.fix}</Button>}>
          {s.needsInfoMessage}
        </Banner>
      )}
      {s.status === 'rejected' && (
        <Banner tone="danger" title={m.status.rejected}>
          {s.rejectReason}
          {s.reapplyAfter && <div>{f(m.status.reapplyAfter, { date: formatDateShort(Date.parse(s.reapplyAfter), locale) })}</div>}
        </Banner>
      )}
      {['submitted', 'in_review'].includes(s.status) && <Banner tone="success" title={f(m.wizard.submitted, { sla: s.reviewSla })} />}
      <Card>
        <div className="k-list">
          {keys.map((k) => (
            <div key={k} className="k-list-row">
              {s.checklist[k] ? <CheckCircle2 color="var(--success)" aria-hidden /> : <Circle color="var(--muted)" aria-hidden />}
              <span className="k-grow">{m.status.checklist[k]}</span>
              <span className="k-small k-muted">{s.checklist[k] ? m.status.done : m.status.missing}</span>
            </div>
          ))}
        </div>
      </Card>
      {s.status === 'rejected' && (
        <Button
          variant="secondary"
          onClick={async () => {
            await api('/api/tech/application/reapply', { method: 'POST' }).catch(() => {});
            await reload();
          }}
        >
          {m.status.reapply}
        </Button>
      )}
      <Button variant="quiet" icon={<LogOut size={18} aria-hidden />} onClick={async () => (await signOut(), await reload())}>
        {m.account.logout}
      </Button>
    </div>
  );
}
