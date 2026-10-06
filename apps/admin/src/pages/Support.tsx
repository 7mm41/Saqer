import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Card, DataTable, EmptyState, Modal, Select, TextArea, useToast } from '@katf/ui';
import { Act, api, Loaded, PageHead, Pill, post, useLoad } from '../components';
import { useAdmin } from '../App';
import { errorText } from '../lib/api';
import { dateTime } from '../lib/fmt';

// ---------------------------------------------------------------- support tickets and flagged chats (§9.2 #16)
export function Support() {
  const { m, locale } = useAdmin();
  const s = useLoad(() => api<any[]>('/support'));
  const flagged = useLoad(() => api<any[]>('/messages/flagged'));
  const [open, setOpen] = useState<any>(null);
  const [filter, setFilter] = useState('open');
  return (
    <>
      <PageHead title={m.support.title} onRefresh={() => (s.reload(), flagged.reload())} />
      <Card>
        <div className="a-toolbar">
          <Select label={m.common.status} value={filter} onChange={(e) => setFilter(e.target.value)} options={[{ value: '', label: m.common.all }, ...Object.entries(m.support.statuses).map(([value, l]) => ({ value, label: l as string }))]} />
        </div>
      </Card>
      <Loaded state={s}>
        {(rows) => {
          const list = rows.filter((r) => !filter || r.status === filter);
          return (
            <Card>
              {list.length === 0 ? (
                <EmptyState title="—" />
              ) : (
                <DataTable
                  rows={list}
                  rowKey={(r) => r.id}
                  onRow={(r) => setOpen(r)}
                  columns={[
                    { key: 'subject', label: m.support.subject, render: (r) => <strong>{r.subject}</strong> },
                    { key: 'userRole', label: m.payments.kind, render: (r) => (r.userRole === 'technician' ? m.common.technician : m.common.customer) },
                    { key: 'status', label: m.common.status, render: (r) => <Pill status={r.status} label={(m.support.statuses as Record<string, string>)[r.status] ?? r.status} /> },
                    { key: 'messages', label: m.support.messages, render: (r) => <span className="k-num">{r.messages.length}</span> },
                    { key: 'updatedAt', label: m.common.date, render: (r) => dateTime(r.updatedAt, locale), sort: (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt) },
                  ]}
                />
              )}
            </Card>
          );
        }}
      </Loaded>
      <Card title={m.support.flagged}>
        <Loaded state={flagged}>
          {(rows) =>
            rows.length === 0 ? (
              <span className="k-muted">—</span>
            ) : (
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'createdAt', label: m.common.date, render: (r) => dateTime(r.createdAt, locale) },
                  { key: 'booking', label: m.common.code, render: (r) => <Link to={`/bookings/${r.bookingId}`}>{m.common.open}</Link> },
                  { key: 'senderRole', label: m.security.actor, render: (r) => (r.senderRole === 'technician' ? m.common.technician : m.common.customer) },
                  { key: 'body', label: m.support.reply, render: (r) => <span className="k-small">{r.body}</span> },
                  { key: 'flaggedReason', label: m.support.flaggedReason, render: (r) => <Pill status="failed" label={r.flaggedReason} /> },
                ]}
              />
            )
          }
        </Loaded>
      </Card>
      {open && <Ticket t={open} onClose={() => setOpen(null)} onDone={s.reload} />}
    </>
  );
}

function Ticket({ t: ticket, onClose, onDone }: { t: any; onClose: () => void; onDone: () => void }) {
  const { m, t, locale } = useAdmin();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (status?: string) => {
    setBusy(true);
    try {
      await post(`/support/${ticket.id}/reply`, { body: body.trim() || '—', ...(status ? { status } : {}) });
      toast(m.common.done, 'success');
      onDone();
      onClose();
    } catch (e) {
      toast(errorText(t, e), 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={ticket.subject}
      wide
      footer={
        <>
          <Button variant="primary" loading={busy} disabled={!body.trim()} onClick={() => send('answered')}>
            {m.support.send}
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => send('closed')}>
            {m.support.close}
          </Button>
        </>
      }
    >
      <div className="k-stack">
        {ticket.bookingId && (
          <Link to={`/bookings/${ticket.bookingId}`} className="k-small">
            {m.nav.bookings} →
          </Link>
        )}
        {ticket.messages.map((x: any, i: number) => (
          <div key={i} className="k-card k-tight" style={{ background: x.role === 'admin' ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
            <div className="k-row k-between k-xs k-muted">
              <span>{x.role === 'admin' ? m.app.title : x.role === 'technician' ? m.common.technician : m.common.customer}</span>
              <span>{dateTime(x.at, locale)}</span>
            </div>
            <p className="k-small" style={{ whiteSpace: 'pre-wrap' }}>
              {x.body}
            </p>
          </div>
        ))}
        <TextArea label={m.support.reply} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} rows={4} />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- reviews moderation (§9.2 #15)
export function Reviews() {
  const { m, locale } = useAdmin();
  const s = useLoad(() => api<any[]>('/reviews'));
  return (
    <>
      <PageHead title={m.reviews.title} onRefresh={s.reload} />
      <Loaded state={s}>
        {(rows) => (
          <Card>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              csvName="reviews"
              columns={[
                { key: 'createdAt', label: m.common.date, render: (r) => dateTime(r.createdAt, locale) },
                { key: 'technician', label: m.common.technician, render: (r) => <Link to={`/technicians/${r.technicianId}`}>{r.technician ?? '—'}</Link>, csv: (r) => r.technician ?? '' },
                { key: 'direction', label: m.payments.kind },
                { key: 'rating', label: m.reviews.stars, render: (r) => <span className="k-num">{'★'.repeat(r.rating)}</span>, csv: (r) => r.rating, sort: (a, b) => a.rating - b.rating },
                { key: 'comment', label: m.reviews.text, render: (r) => <span className="k-small">{r.comment ?? '—'}</span> },
                { key: 'reply', label: m.reviews.reply, render: (r) => <span className="k-small">{r.reply ?? '—'}</span> },
                {
                  key: 'mod',
                  label: m.common.actions,
                  render: (r) =>
                    r.moderationStatus === 'hidden' ? (
                      <span className="k-row" style={{ gap: 6 }}>
                        <Pill status="expired" label={m.reviews.hidden} />
                        <Act label={m.reviews.unhide} run={(reason) => post(`/reviews/${r.id}/moderate`, { hide: false, reason })} onDone={s.reload} variant="quiet" />
                      </span>
                    ) : (
                      <Act label={m.reviews.hide} run={(reason) => post(`/reviews/${r.id}/moderate`, { hide: true, reason })} onDone={s.reload} variant="quiet" />
                    ),
                },
              ]}
            />
          </Card>
        )}
      </Loaded>
    </>
  );
}
