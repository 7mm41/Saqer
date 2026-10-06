import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Flag } from 'lucide-react';
import { BOOKING_PROBLEMS, DISPUTE_REASONS, FAULT_TYPES, label, parsePercent, renderSettingValue, SETTINGS } from '@katf/shared';
import { Banner, Button, Card, Checkbox, DataTable, EmptyState, Money, MoneyRow, Select, Tabs, TextField } from '@katf/ui';
import { Act, api, FormModal, KV, Loaded, PageHead, Pager, Photos, Pill, post, ReasonField, useLoad } from '../components';
import { useAdmin } from '../App';
import { ApiError } from '../lib/api';
import { dateTime, omr, pct, wilayatName } from '../lib/fmt';

const STATUSES = ['pending_payment', 'requested', 'accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote_sent', 'repair_payment_pending', 'in_progress', 'completed_pending_confirmation', 'confirmed', 'settled', 'paid_out', 'disputed', 'customer_absent', 'closed_visit_only', 'cancelled_by_customer', 'cancelled_by_technician', 'expired', 'expired_unpaid', 'refunded_full', 'refunded_partial', 'repair_failed_closed'];

export function Bookings() {
  return (
    <Routes>
      <Route index element={<BookingsList />} />
      <Route path=":id" element={<BookingDetail />} />
    </Routes>
  );
}

function BookingsList() {
  const { m, t, locale } = useAdmin();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const status = sp.get('status') ?? '';
  const needsAdmin = sp.get('needsAdmin') === '1';
  const page = Number(sp.get('page') ?? 1);
  const s = useLoad(
    () => api(`/bookings?${new URLSearchParams({ ...(status ? { status } : {}), ...(sp.get('q') ? { q: sp.get('q')! } : {}), ...(needsAdmin ? { needsAdmin: 'true' } : {}), page: String(page) })}`),
    [status, page, needsAdmin, sp.get('q')],
  );
  const set = (patch: Record<string, string | null>) => {
    const next = { ...Object.fromEntries(sp), ...patch };
    for (const k of Object.keys(next)) if (!next[k]) delete next[k];
    delete next.page;
    setSp(next as Record<string, string>);
  };
  return (
    <>
      <PageHead title={m.bookings.title} onRefresh={s.reload} />
      <Card>
        <form
          className="a-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q });
          }}
        >
          <TextField label={m.common.code} value={q} onChange={(e) => setQ(e.target.value)} placeholder="KT-" dir="ltr" />
          <Select label={m.common.status} value={status} onChange={(e) => set({ status: e.target.value })} options={[{ value: '', label: m.common.all }, ...STATUSES.map((x) => ({ value: x, label: t(`status.${x}`) }))]} />
          <Checkbox checked={needsAdmin} onChange={(v) => set({ needsAdmin: v ? '1' : null })}>
            {m.bookings.needsAdmin}
          </Checkbox>
          <Button type="submit">{m.common.search}</Button>
        </form>
      </Card>
      <Loaded state={s}>
        {(d: any) => (
          <Card>
            <DataTable
              rows={d.rows}
              rowKey={(r: any) => r.id}
              onRow={(r: any) => nav(r.id)}
              csvName="bookings"
              columns={[
                { key: 'code', label: m.common.code, render: (r: any) => <strong className="k-num">{r.code}</strong> },
                {
                  key: 'status',
                  label: m.common.status,
                  render: (r: any) => (
                    <span className="k-row" style={{ gap: 4 }}>
                      <Pill status={r.status} label={t(`status.${r.status}`)} />
                      {r.needsAdmin && <Flag size={14} color="var(--danger)" aria-label={m.bookings.needsAdmin} />}
                    </span>
                  ),
                  csv: (r: any) => r.status,
                },
                { key: 'entryMode', label: m.bookings.entryMode, render: (r: any) => (m.bookings.entry as Record<string, string>)[r.entryMode] ?? r.entryMode },
                { key: 'area', label: m.common.area, render: (r: any) => wilayatName(r.wilayat, locale) },
                { key: 'window', label: m.bookings.window, render: (r: any) => dateTime(r.window.start, locale), csv: (r: any) => r.window.start, sort: (a: any, b: any) => Date.parse(a.window.start) - Date.parse(b.window.start) },
                { key: 'technician', label: m.common.technician, render: (r: any) => r.technician ?? '—' },
                { key: 'quoteTotal', label: m.bookings.quote, render: (r: any) => <Money baisa={r.quoteTotal ?? r.visitFee} />, csv: (r: any) => omr(r.quoteTotal ?? r.visitFee) },
              ]}
            />
            <Pager page={page} total={d.total} onPage={(p) => setSp({ ...Object.fromEntries(sp), page: String(p) })} />
          </Card>
        )}
      </Loaded>
    </>
  );
}

function BookingDetail() {
  const { id } = useParams();
  const { m, t, locale, can } = useAdmin();
  const s = useLoad(() => api(`/bookings/${id}`), [id]);
  const [tab, setTab] = useState<'overview' | 'money' | 'evidence' | 'chat' | 'events'>('overview');
  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;
  return (
    <>
      <Link to="/bookings" className="k-btn k-btn-quiet k-btn-sm" style={{ alignSelf: 'flex-start' }}>
        <Back size={16} aria-hidden /> {m.common.back}
      </Link>
      <Loaded state={s}>
        {(b: any) => {
          const approved = (b.quotes as any[]).find((q) => q.status === 'approved');
          const pendingAdmin = (b.quotes as any[]).find((q) => q.status === 'pending_admin');
          const P = (path: string, extra: Record<string, unknown> = {}) => (reason: string) => post(`/bookings/${b.id}/${path}`, { reason, ...extra });
          const terminal = ['settled', 'paid_out', 'closed_visit_only', 'cancelled_by_customer', 'cancelled_by_technician', 'expired', 'expired_unpaid', 'refunded_full', 'refunded_partial', 'repair_failed_closed', 'customer_absent'].includes(b.status);
          return (
            <>
              <PageHead
                title={
                  <span className="k-row" style={{ gap: 10 }}>
                    <span className="k-num">{b.code}</span>
                    <Pill status={b.status} label={t(`status.${b.status}`)} />
                    {b.isRevisit && <span className="k-pill k-pill-accent">{m.bookings.revisit}</span>}
                  </span>
                }
                sub={`${label(BOOKING_PROBLEMS, b.problem, locale)} · ${b.area.wilayat[locale]} — ${b.area.neighbourhood[locale]} · ${dateTime(b.windowStart, locale)}`}
                onRefresh={s.reload}
              />
              {b.needsAdmin && (
                <Banner tone="danger" icon={<Flag size={18} aria-hidden />} title={`${m.bookings.needsAdmin}: ${b.needsAdmin}`} action={can(['support']) ? <Act label={m.bookings.clearFlag} run={P('clear-flag')} onDone={s.reload} /> : undefined} />
              )}
              {pendingAdmin && can(['support']) && (
                <Banner tone="warning" title={`${m.bookings.releaseQuote}: ${omr(pendingAdmin.total)}`}>
                  <div className="a-actions" style={{ marginBlockStart: 8 }}>
                    <Act label={m.bookings.releaseQuote} run={P('quote-release', { approve: true })} onDone={s.reload} variant="primary" />
                    <Act label={m.bookings.blockQuote} run={P('quote-release', { approve: false })} onDone={s.reload} danger />
                  </div>
                </Banner>
              )}

              <Card title={m.common.actions}>
                <div className="a-actions">
                  {can(['finance']) && !terminal && <CancelBooking id={b.id} onDone={s.reload} />}
                  {can(['finance']) && ['accepted', 'on_the_way'].includes(b.status) && <Act label={m.bookings.noShow} run={P('no-show')} onDone={s.reload} money danger />}
                  {can(['support']) && b.status === 'requested' && <Assign b={b} onDone={s.reload} />}
                  {can(['support']) && !terminal && <Extend id={b.id} onDone={s.reload} />}
                  {can(['support']) && !['disputed'].includes(b.status) && ['completed_pending_confirmation', 'confirmed', 'settled'].includes(b.status) && <OpenDispute id={b.id} onDone={s.reload} />}
                  {can(['finance']) && b.isRevisit && ['in_progress', 'completed_pending_confirmation', 'disputed'].includes(b.status) && <Act label={m.bookings.revisitFailed} run={P('revisit-failed')} onDone={s.reload} money danger />}
                  {can(['support']) && <Resend id={b.id} />}
                  <Act label={m.common.addNote} run={P('note')} onDone={s.reload} variant="quiet" />
                </div>
              </Card>

              <Tabs
                value={tab}
                onChange={setTab}
                label={m.bookings.title}
                tabs={[
                  { value: 'overview', label: m.common.details },
                  { value: 'money', label: m.bookings.money },
                  { value: 'evidence', label: m.bookings.evidence },
                  { value: 'chat', label: `${m.bookings.chat} (${b.messages.length})` },
                  { value: 'events', label: m.bookings.events },
                ]}
              />

              {tab === 'overview' && (
                <div className="a-two">
                  <div className="k-stack">
                    <Card title={m.bookings.problem}>
                      <KV
                        items={[
                          [m.bookings.problem, label(BOOKING_PROBLEMS, b.problem, locale)],
                          [m.bookings.units, b.units.map((u: any) => `${u.count} × ${u.type}${u.brand ? ` (${u.brand})` : ''}`).join('، ')],
                          [m.bookings.window, `${dateTime(b.windowStart, locale)} → ${dateTime(b.windowEnd, locale)}`],
                          [m.bookings.entryMode, (m.bookings.entry as Record<string, string>)[b.entryMode] ?? b.entryMode],
                          [m.bookings.created, dateTime(b.createdAt, locale)],
                        ]}
                      />
                      {b.problemText && <p className="k-small" style={{ marginBlockStart: 10 }}>{b.problemText}</p>}
                    </Card>
                    <Card title={m.bookings.address}>
                      <KV
                        items={[
                          [m.common.area, `${b.area.wilayat[locale]} — ${b.area.neighbourhood[locale]}`],
                          [m.bookings.addressNo, [b.address.wayNo, b.address.buildingNo, b.address.flatNo].filter(Boolean).join(' / ') || '—'],
                          [m.bookings.landmark, b.address.landmark],
                          [m.common.note, b.address.notes],
                        ]}
                      />
                    </Card>
                    {b.diagnosis && (
                      <Card title={m.bookings.diagnosis}>
                        <p className="k-small">{b.diagnosis.faults.map((x: string) => label(FAULT_TYPES, x, locale)).join('، ')}</p>
                        {b.diagnosis.notes && <p className="k-small">{b.diagnosis.notes}</p>}
                        <Photos urls={b.diagnosis.photos} />
                      </Card>
                    )}
                    {b.adminNotes && (
                      <Card title={m.common.notes}>
                        <pre className="a-pre">{b.adminNotes}</pre>
                      </Card>
                    )}
                  </div>
                  <div className="k-stack">
                    <Card title={m.common.customer}>
                      <KV items={[[m.common.name, b.customer.name], [m.common.status, b.customer.status]]} />
                    </Card>
                    <Card title={m.common.technician}>{b.technician ? <KV items={[[m.common.name, b.technician.name], [m.tech.rating, b.technician.rating ?? '—']]} /> : <span className="k-muted">—</span>}</Card>
                    <Card title={m.bookings.policy}>
                      <KV items={Object.entries(b.policy ?? {}).map(([k, v]) => [SETTINGS.find((x) => x.key === k)?.[locale] ?? k, renderSettingValue(k, v)] as [string, string])} />
                    </Card>
                  </div>
                </div>
              )}

              {tab === 'money' && (
                <div className="a-two">
                  <div className="k-stack">
                    <Card title={m.bookings.money}>
                      <MoneyRow label={m.bookings.visitFee} baisa={b.visitFee} />
                      {b.quoteTotal != null && <MoneyRow label={m.bookings.quote} baisa={b.quoteTotal} />}
                      <MoneyRow label={`${m.bookings.commission} (${pct(b.commissionBps)} · ${b.commissionReason})`} baisa={b.commissionAmount} />
                      <MoneyRow label={m.bookings.techNet} baisa={b.technicianNet} />
                      <MoneyRow label={m.bookings.platformNet} baisa={b.platformNet} />
                      <MoneyRow label={m.bookings.refundTotal} baisa={b.refundTotal} negative />
                    </Card>
                    <Card title={m.bookings.quotes}>
                      {(b.quotes as any[]).length === 0 ? (
                        <span className="k-muted">—</span>
                      ) : (
                        (b.quotes as any[]).map((q) => (
                          <div key={q.id} className="k-stack" style={{ gap: 6, marginBlockEnd: 12 }}>
                            <div className="k-row k-between">
                              <strong>v{q.version}</strong>
                              <Pill status={q.status} />
                            </div>
                            {q.items.map((it: any, i: number) => (
                              <div key={i} className="k-row k-between k-small" style={{ flexWrap: 'wrap' }}>
                                <span>
                                  {it.qty} × {it.label} <span className="k-muted">({it.kind})</span>
                                </span>
                                <span className="k-row" style={{ gap: 6 }}>
                                  <Money baisa={it.qty * it.unitPrice} />
                                  {it.kind === 'part' && q.id === approved?.id && can(['finance', 'support']) && (
                                    <Act
                                      label={it.evidenced ? m.bookings.partEvidence : m.bookings.partNoEvidence}
                                      variant={it.evidenced ? 'primary' : 'quiet'}
                                      run={P('evidence', { lineIndex: i, evidenced: !it.evidenced })}
                                      onDone={s.reload}
                                    />
                                  )}
                                </span>
                              </div>
                            ))}
                            <MoneyRow label={m.bookings.total} baisa={q.total} total />
                          </div>
                        ))
                      )}
                    </Card>
                  </div>
                  <div className="k-stack">
                    <Card title={m.bookings.payments}>
                      <DataTable
                        rows={b.payments}
                        rowKey={(r: any) => r.id}
                        columns={[
                          { key: 'kind', label: m.payments.kind },
                          { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status} /> },
                          { key: 'amount', label: m.common.amount, render: (r: any) => <Money baisa={r.amount} /> },
                        ]}
                      />
                    </Card>
                    <Card title={m.bookings.refunds}>
                      <DataTable
                        rows={b.refunds}
                        rowKey={(r: any) => r.id}
                        columns={[
                          { key: 'reasonCode', label: m.common.reason },
                          { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status} /> },
                          { key: 'amount', label: m.common.amount, render: (r: any) => <Money baisa={r.amount} /> },
                        ]}
                      />
                    </Card>
                    <Card title={m.bookings.ledger}>
                      <DataTable
                        rows={b.ledger}
                        rowKey={(r: any) => String(r.id)}
                        columns={[
                          { key: 'account', label: m.reports.byAccount, render: (r: any) => <code className="k-ltr k-xs">{r.account}</code> },
                          { key: 'debit', label: m.reports.debit, render: (r: any) => (r.debit ? <Money baisa={r.debit} currency={false} /> : '') },
                          { key: 'credit', label: m.reports.credit, render: (r: any) => (r.credit ? <Money baisa={r.credit} currency={false} /> : '') },
                        ]}
                      />
                    </Card>
                  </div>
                </div>
              )}

              {tab === 'evidence' && (
                <div className="k-grid" style={{ '--min': '300px' } as React.CSSProperties}>
                  <Card title={m.bookings.media}>
                    <Photos urls={b.media} />
                  </Card>
                  <Card title={m.bookings.arrival}>
                    <Photos urls={[b.arrivalPhotoUrl]} />
                    {b.arrival && (
                      <p className="k-xs k-muted">
                        {b.arrival.distance != null ? `${Math.round(b.arrival.distance)} m` : ''} {b.arrival.override ? '· override' : ''} {b.arrival.simulated ? '· simulated' : ''}
                      </p>
                    )}
                  </Card>
                  {b.completion && (
                    <>
                      <Card title={m.bookings.before}>
                        <Photos urls={b.completion.before} />
                      </Card>
                      <Card title={m.bookings.after}>
                        <Photos urls={b.completion.after} />
                      </Card>
                      <Card title={m.bookings.parts}>
                        {b.completion.parts.map((p: any, i: number) => (
                          <div key={i} className="k-row k-between k-small">
                            <span>{p.label}</span>
                            {p.receiptUrl ? <a href={p.receiptUrl} target="_blank" rel="noreferrer noopener">{m.bookings.receipt}</a> : '—'}
                          </div>
                        ))}
                      </Card>
                    </>
                  )}
                  {b.disputes.map((d: any) => (
                    <Card key={d.id} title={`${m.nav.disputes}: ${label(DISPUTE_REASONS, d.reasonCode, locale)}`} actions={<Link to={`/disputes/${d.id}`} className="k-btn k-btn-sm k-btn-quiet">{m.common.open}</Link>}>
                      {d.description && <p className="k-small">{d.description}</p>}
                      <Photos urls={d.evidence} />
                    </Card>
                  ))}
                </div>
              )}

              {tab === 'chat' && (
                <Card title={m.bookings.chat}>
                  {b.messages.length === 0 ? (
                    <EmptyState title="—" />
                  ) : (
                    <div className="k-stack" style={{ gap: 8 }}>
                      {b.messages.map((x: any) => (
                        <div key={x.id} className="k-card k-tight" style={{ background: x.senderRole === 'technician' ? 'var(--surface-2)' : undefined, borderColor: x.flaggedReason ? 'var(--danger)' : undefined }}>
                          <div className="k-row k-between k-xs k-muted">
                            <span>{x.senderRole === 'technician' ? m.common.technician : x.senderRole === 'customer' ? m.common.customer : x.senderRole}</span>
                            <span>{dateTime(x.createdAt, locale)}</span>
                          </div>
                          <p className="k-small">{x.body}</p>
                          {x.flaggedReason && <span className="k-pill k-pill-danger">{x.flaggedReason}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="k-xs k-muted" style={{ marginBlockStart: 10 }}>
                    {m.bookings.calls}: {b.calls.length}
                  </p>
                </Card>
              )}

              {tab === 'events' && (
                <Card title={m.bookings.events}>
                  <DataTable
                    rows={b.events}
                    rowKey={(r: any) => String(r.id)}
                    columns={[
                      { key: 'createdAt', label: m.common.date, render: (r: any) => dateTime(r.createdAt, locale) },
                      { key: 'type', label: m.security.action, render: (r: any) => <code className="k-ltr k-xs">{r.type}</code> },
                      { key: 'actorRole', label: m.security.actor },
                      { key: 'to', label: m.common.status, render: (r: any) => (r.toStatus ? t(`status.${r.toStatus}`) : '') },
                      { key: 'note', label: m.common.note, render: (r: any) => r.note ?? '' },
                    ]}
                  />
                </Card>
              )}
            </>
          );
        }}
      </Loaded>
    </>
  );
}

function CancelBooking({ id, onDone }: { id: string; onDone: () => void }) {
  const { m } = useAdmin();
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState('');
  const [reason, setReason] = useState('');
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        {m.bookings.cancel}
      </Button>
      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title={m.bookings.cancel}
        submitLabel={m.bookings.cancel}
        danger
        money
        onSubmit={async () => {
          const bps = fee.trim() ? parsePercent(fee) : undefined;
          if (fee.trim() && bps == null) throw new ApiError(400, 'invalid_value');
          await post(`/bookings/${id}/cancel`, { reason, ...(bps != null ? { chargeFeeBps: bps } : {}) });
          onDone();
        }}
      >
        <TextField label={m.bookings.cancelFee} value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" dir="ltr" />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </>
  );
}

function Resend({ id }: { id: string }) {
  const { m } = useAdmin();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('booking_confirmed');
  const [reason, setReason] = useState('');
  const keys = ['booking_confirmed', 'tech_accepted', 'on_the_way', 'quote_ready', 'work_completed', 'confirm_reminder', 'refund_issued', 'booking_cancelled', 'dispute_decided'];
  return (
    <>
      <Button size="sm" variant="quiet" onClick={() => setOpen(true)}>
        {m.bookings.resend}
      </Button>
      <FormModal open={open} onClose={() => setOpen(false)} title={m.bookings.resend} submitLabel={m.bookings.resend} onSubmit={async () => void (await post(`/bookings/${id}/resend`, { key, reason }))}>
        <Select label={m.messaging.templates} value={key} onChange={(e) => setKey(e.target.value)} options={keys.map((k) => ({ value: k, label: k }))} dir="ltr" />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </>
  );
}

function Assign({ b, onDone }: { b: any; onDone: () => void }) {
  const { m } = useAdmin();
  const [open, setOpen] = useState(false);
  const [tech, setTech] = useState('');
  const [reason, setReason] = useState('');
  const s = useLoad(() => (open ? api(`/technicians?wilayat=${encodeURIComponent(b.wilayat)}`) : Promise.resolve(null)), [open]);
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        {m.bookings.assign}
      </Button>
      <FormModal open={open} onClose={() => setOpen(false)} title={m.bookings.assign} submitLabel={m.bookings.assign} onSubmit={async () => (await post(`/bookings/${b.id}/assign`, { technicianId: tech, reason }), onDone())}>
        <Select
          label={m.common.technician}
          value={tech}
          onChange={(e) => setTech(e.target.value)}
          placeholder="—"
          options={((s.data as any)?.rows ?? []).filter((r: any) => ['active', 'approved_probation'].includes(r.status)).map((r: any) => ({ value: r.id, label: `${r.name} · ★${r.rating ?? '—'}` }))}
        />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </>
  );
}

function Extend({ id, onDone }: { id: string; onDone: () => void }) {
  const { m } = useAdmin();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('auto_confirm');
  const [minutes, setMinutes] = useState('60');
  const [reason, setReason] = useState('');
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {m.bookings.extend}
      </Button>
      <FormModal open={open} onClose={() => setOpen(false)} title={m.bookings.extend} submitLabel={m.bookings.extend} onSubmit={async () => (await post(`/bookings/${id}/extend`, { kind, minutes: Number(minutes), reason }), onDone())}>
        <Select label={m.payments.kind} value={kind} onChange={(e) => setKind(e.target.value)} options={Object.entries(m.bookings.extendKind).map(([value, l]) => ({ value, label: l as string }))} />
        <TextField label={m.bookings.minutes} value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} inputMode="numeric" dir="ltr" />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </>
  );
}

function OpenDispute({ id, onDone }: { id: string; onDone: () => void }) {
  const { m, locale } = useAdmin();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(DISPUTE_REASONS[0]!.id);
  const [reason, setReason] = useState('');
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {m.bookings.openDispute}
      </Button>
      <FormModal open={open} onClose={() => setOpen(false)} title={m.bookings.openDispute} submitLabel={m.bookings.openDispute} onSubmit={async () => (await post(`/bookings/${id}/open-dispute`, { reasonCode: code, reason }), onDone())}>
        <Select label={m.disputes.reasonCode} value={code} onChange={(e) => setCode(e.target.value)} options={DISPUTE_REASONS.map((r) => ({ value: r.id, label: r[locale] }))} />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </>
  );
}

// ---------------------------------------------------------------- dispatch (§9.2 #6)
export function Dispatch() {
  const { m, locale } = useAdmin();
  const s = useLoad(() => api('/dispatch'));
  return (
    <>
      <PageHead title={m.dispatch.title} sub={m.dispatch.body} onRefresh={s.reload} />
      <Loaded state={s}>
        {(d: any) => (
          <>
            {d.requests.length === 0 ? (
              <Card>
                <EmptyState title={m.dispatch.empty} />
              </Card>
            ) : (
              <div className="k-grid" style={{ '--min': '320px' } as React.CSSProperties}>
                {d.requests.map((r: any) => (
                  <Card key={r.id} title={<span className="k-num">{r.code}</span>} actions={<Link to={`/bookings/${r.id}`} className="k-btn k-btn-sm k-btn-quiet">{m.common.open}</Link>}>
                    <p className="k-small">
                      {label(BOOKING_PROBLEMS, r.problem, locale)} · {wilayatName(r.wilayat, locale)}
                    </p>
                    <p className="k-small k-muted">{dateTime(r.window.start, locale)}</p>
                    <div className="k-stack" style={{ gap: 6, marginBlockStart: 10 }}>
                      <span className="k-label">{m.dispatch.candidates}</span>
                      {r.candidates.length === 0 && <span className="k-muted k-small">—</span>}
                      {r.candidates.map((c: any) => (
                        <div key={c.id} className="k-row k-between">
                          <span className="k-row" style={{ gap: 6 }}>
                            {c.name} <Pill status={c.available ? 'active' : 'expired'} label={c.available ? m.dispatch.available : m.dispatch.unavailable} />
                          </span>
                          <Act label={m.bookings.assign} variant="primary" run={(reason) => post(`/bookings/${r.id}/assign`, { technicianId: c.id, reason })} onDone={s.reload} />
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
            <Card title={m.dispatch.waitlist}>
              <DataTable
                rows={d.waitlist}
                rowKey={(r: any) => r.wilayat}
                columns={[
                  { key: 'nameAr', label: m.common.area },
                  { key: 'active', label: m.common.status, render: (r: any) => <Pill status={r.active ? 'active' : 'expired'} label={r.active ? m.dispatch.active : m.dispatch.inactive} /> },
                  { key: 'count', label: m.areas.waitlist, render: (r: any) => <span className="k-num">{r.count}</span>, sort: (a: any, b: any) => a.count - b.count },
                ]}
              />
            </Card>
          </>
        )}
      </Loaded>
    </>
  );
}
