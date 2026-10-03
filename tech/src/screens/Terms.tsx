import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDateShort } from '@katf/shared';
import { Banner, Button, Card, Checkbox, Modal, Spinner, useT } from '@katf/ui';
import { api } from '../lib/api';
import { useApp } from '../App';

/** Forced re-acceptance (§11): new requests are blocked until the new version is accepted. */
export function Terms() {
  const { m, locale, f } = useApp();
  const t = useT();
  const nav = useNavigate();
  const [pending, setPending] = useState<any[] | null>(null);
  const [read, setRead] = useState<Record<string, boolean>>({});
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<any>(null);
  const [doc, setDoc] = useState<any>(null);
  useEffect(() => {
    void api<any[]>('/api/terms/pending').then((p) => (p.length ? setPending(p) : nav('/home')));
  }, [nav]);
  useEffect(() => {
    if (open) void api(`/api/legal/${open.type}?lang=${locale}`).then(setDoc);
    else setDoc(null);
  }, [open, locale]);
  if (!pending) return <Spinner />;
  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 14, paddingBlock: 24 }}>
      <h1 style={{ fontSize: '1.5rem' }}>{m.terms.title}</h1>
      <p className="k-muted">{m.terms.body}</p>
      {pending.map((p) => (
        <Card key={p.id} title={p.title}>
          <div className="k-stack">
            {p.changeSummary && <Banner title={m.terms.changes}>{p.changeSummary}</Banner>}
            {p.effectiveAt && <span className="k-small k-muted">{f(m.terms.effective, { date: formatDateShort(Date.parse(p.effectiveAt), locale) })}</span>}
            <Button size="sm" variant="secondary" onClick={() => setOpen(p)}>
              {t('actions.readFull')}
            </Button>
            <Checkbox checked={Boolean(ok[p.id])} disabled={!read[p.id]} onChange={(v) => setOk({ ...ok, [p.id]: v })}>
              {m.terms.accept}
            </Checkbox>
          </div>
        </Card>
      ))}
      <Button
        variant="primary"
        size="lg"
        disabled={!pending.every((p) => ok[p.id])}
        onClick={async () => {
          await api('/api/terms/accept', { method: 'POST', json: { docIds: pending.map((p) => p.id), locale } });
          nav('/home');
        }}
      >
        {m.terms.accept}
      </Button>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={doc?.title ?? '…'} onReachEnd={() => open && setRead((r) => ({ ...r, [open.id]: true }))}>
        {doc ? <div className="k-legal-text">{doc.body}</div> : <Spinner />}
      </Modal>
    </div>
  );
}
