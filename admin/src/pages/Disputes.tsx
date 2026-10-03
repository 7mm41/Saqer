import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { DISPUTE_REASONS, label, parseOMR, formatOMR } from '@katf/shared';
import { Banner, Card, DataTable, EmptyState, MoneyRow, RadioCards, TextArea, TextField } from '@katf/ui';
import { Act, api, FormModal, KV, Loaded, PageHead, Photos, Pill, post, useLoad } from '../components';
import { useAdmin } from '../App';
import { ApiError } from '../lib/api';
import { dateTime, hoursFromNow } from '../lib/fmt';

export function Disputes() {
  return (
    <Routes>
      <Route index element={<DisputesList />} />
      <Route path=":id" element={<DisputeDetail />} />
    </Routes>
  );
}

function DisputesList() {
  const { m, f, locale } = useAdmin();
  const nav = useNavigate();
  const s = useLoad(() => api<any[]>('/disputes'));
  return (
    <>
      <PageHead title={m.disputes.title} onRefresh={s.reload} />
      <Loaded state={s}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <EmptyState title="—" />
            </Card>
          ) : (
            <Card>
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                onRow={(r) => nav(r.id)}
                columns={[
                  { key: 'code', label: m.common.code, render: (r) => <strong className="k-num">{r.code}</strong> },
                  { key: 'status', label: m.common.status, render: (r) => <Pill status={r.status} label={(m.disputes.statuses as Record<string, string>)[r.status]} /> },
                  { key: 'reasonCode', label: m.disputes.reasonCode, render: (r) => label(DISPUTE_REASONS, r.reasonCode, locale) },
                  { key: 'createdAt', label: m.disputes.opened, render: (r) => dateTime(r.createdAt, locale) },
                  {
                    key: 'slaDueAt',
                    label: m.disputes.sla,
                    render: (r) => {
                      if (!['open', 'under_review', 'appealed'].includes(r.status)) return dateTime(r.slaDueAt, locale);
                      const h = hoursFromNow(r.slaDueAt) ?? 0;
                      return <span style={{ color: h < 0 ? 'var(--danger)' : h < 12 ? 'var(--warning)' : undefined }}>{h < 0 ? f(m.common.overdue, { n: -h }) : f(m.common.dueIn, { n: h })}</span>;
                    },
                    sort: (a, b) => Date.parse(a.slaDueAt) - Date.parse(b.slaDueAt),
                  },
                  { key: 'evidence', label: m.disputes.evidence, render: (r) => <span className="k-num">{r.evidence}</span> },
                ]}
              />
            </Card>
          )
        }
      </Loaded>
    </>
  );
}

type Decision = 'technician_full' | 'customer_full' | 'labor_only' | 'split' | 'repair_failed';

function DisputeDetail() {
  const { id } = useParams();
  const { m, f, locale, can } = useAdmin();
  const s = useLoad(() => api(`/disputes/${id}`), [id]);
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [split, setSplit] = useState({ refund: '', technician: '', platform: '' });
  const [note, setNote] = useState('');
  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;
  return (
    <>
      <Link to="/disputes" className="k-btn k-btn-quiet k-btn-sm" style={{ alignSelf: 'flex-start' }}>
        <Back size={16} aria-hidden /> {m.common.back}
      </Link>
      <Loaded state={s}>
        {(d: any) => {
          const { dispute: x, booking: b, preview } = d;
          const decidable = ['open', 'under_review', 'appealed'].includes(x.status);
          const amounts = decision === 'split' ? { refund: parseOMR(split.refund) ?? -1, technician: parseOMR(split.technician) ?? -1, platform: parseOMR(split.platform) ?? -1 } : decision ? preview.options[decision] : null;
          const sum = amounts ? amounts.refund + amounts.technician + amounts.platform : 0;
          return (
            <>
              <PageHead
                title={
                  <span className="k-row" style={{ gap: 10 }}>
                    {m.nav.disputes}: <Link to={`/bookings/${b.id}`} className="k-num">{b.code}</Link>
                    <Pill status={x.status} label={(m.disputes.statuses as Record<string, string>)[x.status]} />
                  </span>
                }
                sub={`${label(DISPUTE_REASONS, x.reasonCode, locale)} · ${m.disputes.sla}: ${dateTime(x.slaDueAt, locale)}`}
                onRefresh={s.reload}
              />
              {x.status === 'appealed' && <Banner tone="warning" title={m.disputes.appeal}>{x.appealText}</Banner>}
              <div className="a-two">
                <div className="k-stack">
                  <Card title={m.disputes.evidence}>
                    {x.description && <p className="k-small" style={{ marginBlockEnd: 10 }}>{x.description}</p>}
                    <Photos urls={x.evidence} />
                  </Card>
                  <Card title={m.bookings.evidence}>
                    <div className="k-stack">
                      <span className="k-label">{m.bookings.media}</span>
                      <Photos urls={b.media} />
                      {b.completion && (
                        <>
                          <span className="k-label">{m.bookings.before}</span>
                          <Photos urls={b.completion.before} />
                          <span className="k-label">{m.bookings.after}</span>
                          <Photos urls={b.completion.after} />
                        </>
                      )}
                    </div>
                  </Card>
                  <Card title={m.bookings.chat}>
                    {b.messages.length === 0 ? (
                      <span className="k-muted">—</span>
                    ) : (
                      b.messages.map((msg: any) => (
                        <p key={msg.id} className="k-small">
                          <strong>{msg.senderRole === 'technician' ? m.common.technician : m.common.customer}:</strong> {msg.body}
                        </p>
                      ))
                    )}
                  </Card>
                  {x.decision && (
                    <Card title={m.disputes.decide}>
                      <KV
                        items={[
                          [m.disputes.decide, (m.disputes.options as Record<string, string>)[x.decision] ?? x.decision],
                          [m.common.note, x.decisionNote],
                          [m.common.date, dateTime(x.decidedAt, locale)],
                        ]}
                      />
                    </Card>
                  )}
                </div>
                <div className="k-stack">
                  <Card title={m.disputes.preview} strong>
                    <MoneyRow label={m.disputes.captured} baisa={preview.captured} total />
                    <MoneyRow label={m.bookings.quote} baisa={b.quoteTotal} />
                    <MoneyRow label={m.bookings.visitFee} baisa={b.visitFee} />
                    <div className="k-stack" style={{ gap: 10, marginBlockStart: 12 }}>
                      {(Object.entries(preview.options) as [Decision, any][]).filter(([, v]) => v).map(([k, v]) => (
                        <div key={k} className="k-card k-tight" style={{ background: 'var(--surface-2)' }}>
                          <strong className="k-small">{(m.disputes.options as Record<string, string>)[k]}</strong>
                          <MoneyRow label={m.disputes.refund} baisa={v.refund} />
                          <MoneyRow label={m.disputes.technician} baisa={v.technician} />
                          <MoneyRow label={m.disputes.platform} baisa={v.platform} />
                        </div>
                      ))}
                    </div>
                  </Card>
                  {decidable && (
                    <Card title={m.disputes.decide}>
                      <div className="a-actions">
                        {x.status === 'open' && can(['support']) && <Act label={m.disputes.markReview} run={(reason) => post(`/disputes/${x.id}/status`, { status: 'under_review', reason })} onDone={s.reload} />}
                        {can(['finance']) && (
                          <button type="button" className="k-btn k-btn-primary" onClick={() => setOpen(true)}>
                            {m.disputes.decide}
                          </button>
                        )}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
              <FormModal
                open={open}
                onClose={() => setOpen(false)}
                title={m.disputes.decide}
                submitLabel={m.disputes.decide}
                money
                onSubmit={async () => {
                  if (!decision) throw new ApiError(400, 'required');
                  if (decision === 'split' && ((Object.values(amounts!) as number[]).some((v) => v < 0) || sum !== preview.captured)) throw new ApiError(400, 'amounts_must_match');
                  await post(`/disputes/${x.id}/decide`, { decision, note, confirm: true, ...(decision === 'split' ? { amounts } : {}) });
                  s.reload();
                }}
              >
                <RadioCards<Decision>
                  name="decision"
                  legend={m.disputes.decide}
                  value={decision}
                  onChange={setDecision}
                  options={(Object.keys(m.disputes.options) as Decision[]).filter((k) => k === 'split' || preview.options[k]).map((k) => ({ value: k, label: (m.disputes.options as Record<string, string>)[k]! }))}
                />
                {decision === 'split' && (
                  <div className="k-grid" style={{ '--min': '140px' } as React.CSSProperties}>
                    <TextField label={m.disputes.refund} value={split.refund} onChange={(e) => setSplit({ ...split, refund: e.target.value })} inputMode="decimal" dir="ltr" />
                    <TextField label={m.disputes.technician} value={split.technician} onChange={(e) => setSplit({ ...split, technician: e.target.value })} inputMode="decimal" dir="ltr" />
                    <TextField label={m.disputes.platform} value={split.platform} onChange={(e) => setSplit({ ...split, platform: e.target.value })} inputMode="decimal" dir="ltr" />
                  </div>
                )}
                {amounts && (
                  <div className="k-card k-tight" style={{ background: 'var(--surface-2)' }}>
                    <MoneyRow label={m.disputes.refund} baisa={Math.max(0, amounts.refund)} />
                    <MoneyRow label={m.disputes.technician} baisa={Math.max(0, amounts.technician)} />
                    <MoneyRow label={m.disputes.platform} baisa={Math.max(0, amounts.platform)} />
                    {sum !== preview.captured && <span className="k-error">{f(m.disputes.mustMatch, { total: formatOMR(preview.captured) })}</span>}
                  </div>
                )}
                <TextArea label={m.disputes.note} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
              </FormModal>
            </>
          );
        }}
      </Loaded>
    </>
  );
}
