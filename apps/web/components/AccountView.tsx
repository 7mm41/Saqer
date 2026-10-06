'use client';
import { useCallback, useEffect, useState } from 'react';
import { Download, LogOut, Trash2, MapPin } from 'lucide-react';
import { formatWindow, formatDateShort, ACTIVE_STATUSES } from '@katf/shared';
import { Banner, Button, Card, Checkbox, EmptyState, LinkButton, Modal, Select, SkeletonCard, StatusPill, Tabs, TextArea, TextField, useT, useToast } from '@katf/ui';
import { api, errorText } from '../lib/api';
import { useSite } from './Providers';
import { OtpLogin } from './OtpLogin';

type Tab = 'bookings' | 'profile' | 'support';

export function AccountView() {
  const { m, locale } = useSite();
  const t = useT();
  const toast = useToast();
  const [me, setMe] = useState<any | null | false>(null);
  const [tab, setTab] = useState<Tab>('bookings');
  const [bookings, setBookings] = useState<any[]>([]);
  const [account, setAccount] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [del, setDel] = useState(false);
  const [doc, setDoc] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const u = await api<any>('/api/me');
      if (u.role !== 'customer') return setMe(false);
      setMe(u);
      setBookings(await api<any[]>('/api/bookings'));
      setAccount(await api<any>('/api/account'));
      setTickets(await api<any[]>('/api/support/tickets'));
    } catch {
      setMe(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (me === null) return <div className="k-container k-narrow" style={{ paddingTop: 24 }}><SkeletonCard /></div>;
  if (me === false)
    return (
      <div className="k-container k-narrow k-stack" style={{ paddingTop: 24 }}>
        <h1>{m.account.title}</h1>
        <Card title={m.account.signIn}>
          <OtpLogin locale={locale} phoneLabel={m.book.phone} onDone={load} />
        </Card>
      </div>
    );

  const active = bookings.filter((b) => (ACTIVE_STATUSES as readonly string[]).includes(b.status));
  const past = bookings.filter((b) => !(ACTIVE_STATUSES as readonly string[]).includes(b.status));
  const row = (b: any) => (
    <a key={b.id} className="k-list-row" href={`/b/${b.code}?t=${b.token}`}>
      <span className="k-num k-strong">{b.code}</span>
      <span className="k-grow k-small k-muted">{formatWindow(Date.parse(b.window.start), Date.parse(b.window.end), locale)}</span>
      <StatusPill status={b.status} label={t(`status.${b.status}`)} />
    </a>
  );

  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 16, paddingTop: 24 }}>
      <div className="k-row k-between">
        <h1>{m.account.title}</h1>
        <Button
          variant="quiet"
          icon={<LogOut size={18} aria-hidden />}
          onClick={async () => {
            await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
            window.location.href = '/';
          }}
        >
          {m.account.signOut}
        </Button>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'bookings', label: m.account.bookings },
          { value: 'profile', label: m.account.profile },
          { value: 'support', label: m.account.support },
        ]}
      />
      {tab === 'bookings' && (
        <>
          {bookings.length === 0 ? (
            <Card>
              <EmptyState title={m.account.noBookings} body={m.account.noBookingsBody} action={<LinkButton href="/book" variant="primary">{m.nav.book}</LinkButton>} />
            </Card>
          ) : (
            <>
              {active.length > 0 && <Card title={m.account.active}><div className="k-list">{active.map(row)}</div></Card>}
              {past.length > 0 && <Card title={m.account.past}><div className="k-list">{past.map(row)}</div></Card>}
            </>
          )}
          {account?.addresses?.length > 0 && (
            <Card title={m.account.addresses}>
              <div className="k-list">
                {account.addresses.map((a: any) => (
                  <div key={a.id} className="k-list-row">
                    <MapPin size={18} aria-hidden />
                    <span className="k-grow">{[a.wayNo, a.buildingNo, a.landmark].filter(Boolean).join(' · ')}</span>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={async () => {
                        await api(`/api/account/addresses/${a.id}`, { method: 'DELETE' });
                        void load();
                      }}
                    >
                      {t('actions.delete')}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
      {tab === 'profile' && <ProfileTab me={me} account={account} onSaved={() => (toast(m.account.saved, 'success'), load())} onDelete={() => setDel(true)} onOpenDoc={setDoc} />}
      {tab === 'support' && <SupportTab tickets={tickets} bookings={bookings} onSent={load} />}
      <Modal
        open={del}
        onClose={() => setDel(false)}
        title={m.account.delete}
        footer={
          <>
            <Button
              variant="danger"
              icon={<Trash2 size={18} aria-hidden />}
              onClick={async () => {
                try {
                  await api('/api/account', { method: 'DELETE' });
                  window.location.href = '/';
                } catch (e) {
                  toast(errorText(t, e), 'danger');
                }
              }}
            >
              {m.account.deleteConfirm}
            </Button>
            <Button variant="quiet" onClick={() => setDel(false)}>
              {t('actions.cancel')}
            </Button>
          </>
        }
      >
        <p>{m.account.deleteBody}</p>
      </Modal>
      <Modal open={Boolean(doc)} onClose={() => setDoc(null)} title={doc ? `${doc.title} — ${doc.version}` : ''}>
        <div className="k-legal-text">{doc?.body}</div>
      </Modal>
    </div>
  );
}

function ProfileTab({ me, account, onSaved, onDelete, onOpenDoc }: { me: any; account: any; onSaved: () => void; onDelete: () => void; onOpenDoc: (d: any) => void }) {
  const { m, locale } = useSite();
  const t = useT();
  const [name, setName] = useState(me.name ?? '');
  const [email, setEmail] = useState(me.email ?? '');
  const [lang, setLang] = useState(me.locale);
  const [marketing, setMarketing] = useState(Boolean(me.marketingConsent));
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Card title={m.account.profile}>
        <form
          className="k-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await api('/api/account', { method: 'PATCH', json: { name, email: email || null, locale: lang, marketing } }).catch(() => {});
            setBusy(false);
            onSaved();
          }}
        >
          <TextField label={m.account.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <TextField label={m.account.email} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
          <Select label={m.account.language} value={lang} onChange={(e) => setLang(e.target.value)} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
          <Checkbox checked={marketing} onChange={setMarketing}>
            {m.account.marketing}
          </Checkbox>
          <Button variant="primary" type="submit" loading={busy}>
            {t('actions.save')}
          </Button>
        </form>
      </Card>
      <Card title={m.account.policies}>
        <div className="k-list">
          {(account?.consents ?? []).map((c: any) => (
            <button
              key={c.id}
              type="button"
              className="k-list-row"
              style={{ background: 'none', border: 0, borderBottom: '1px solid var(--hairline)', textAlign: 'start', cursor: 'pointer' }}
              onClick={async () => onOpenDoc(await api(`/api/legal-accepted/${c.id}`))}
            >
              <span className="k-grow">{c.docType}</span>
              <span className="k-small k-muted k-num">
                {c.version} · {formatDateShort(Date.parse(c.acceptedAt), locale)}
              </span>
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <div className="k-stack">
          <a className="k-btn k-btn-secondary" href="/api/account/export" download="my-data.json">
            <Download size={18} aria-hidden /> {m.account.export}
          </a>
          <Button variant="danger" icon={<Trash2 size={18} aria-hidden />} onClick={onDelete}>
            {m.account.delete}
          </Button>
        </div>
      </Card>
    </>
  );
}

function SupportTab({ tickets, bookings, onSent }: { tickets: any[]; bookings: any[]; onSent: () => void }) {
  const { m, locale } = useSite();
  const t = useT();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Card title={m.account.newTicket}>
        <form
          className="k-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/api/support/tickets', { method: 'POST', json: { subject, body, bookingId: bookingId || null } });
              setSubject('');
              setBody('');
              onSent();
            } catch (x) {
              setErr(errorText(t, x));
            }
          }}
        >
          <TextField label={m.account.subject} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required />
          <Select label={m.track.code} value={bookingId} onChange={(e) => setBookingId(e.target.value)} placeholder="—" options={bookings.map((b) => ({ value: b.id, label: b.code }))} />
          <TextArea label={m.account.message} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} required error={err} />
          <Button variant="primary" type="submit" disabled={subject.length < 2 || body.length < 2}>
            {t('actions.send')}
          </Button>
        </form>
      </Card>
      {tickets.map((tk) => (
        <Card key={tk.id} title={tk.subject} actions={<StatusPill label={tk.status} tone={tk.status === 'answered' ? 'success' : 'info'} />}>
          <div className="k-stack" style={{ gap: 6 }}>
            {tk.messages.map((x: any, i: number) => (
              <div key={i} className="k-card k-tight" style={{ background: x.role === 'admin' ? 'var(--accent-soft)' : undefined }}>
                <span className="k-xs k-muted">{formatDateShort(Date.parse(x.at), locale)}</span>
                <p>{x.body}</p>
              </div>
            ))}
          </div>
        </Card>
      ))}
      {tickets.length === 0 && <Banner title={t('states.empty')} />}
    </>
  );
}
