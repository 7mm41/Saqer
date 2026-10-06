import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Download, RefreshCw } from 'lucide-react';
import { parseOMR } from '@katf/shared';
import { Banner, Button, Card, DataTable, EmptyState, Money, Select, Stat, TextArea, TextField, useToast } from '@katf/ui';
import { Act, api, FormModal, Loaded, PageHead, Pager, Pill, post, ReasonField, useLoad } from '../components';
import { useAdmin } from '../App';
import { ApiError, download, errorText } from '../lib/api';
import { dateTime, omr } from '../lib/fmt';

// ---------------------------------------------------------------- payments and refunds (§9.2 #8)
export function Payments() {
  const { m, locale, t } = useAdmin();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') ?? '';
  const page = Number(sp.get('page') ?? 1);
  const s = useLoad(() => api(`/payments?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page) })}`), [status, page]);
  const [report, setReport] = useState('');
  const [rec, setRec] = useState<any>(null);
  const [recErr, setRecErr] = useState<string | null>(null);
  const statusLabel = (x: string) => (m.payments.statuses as Record<string, string>)[x] ?? x;
  return (
    <>
      <PageHead title={m.payments.title} onRefresh={s.reload} />
      <Card>
        <div className="a-toolbar">
          <Select label={m.common.status} value={status} onChange={(e) => setSp(e.target.value ? { status: e.target.value } : {})} options={[{ value: '', label: m.common.all }, ...Object.keys(m.payments.statuses).map((x) => ({ value: x, label: statusLabel(x) }))]} />
        </div>
      </Card>
      <Loaded state={s}>
        {(d: any) => (
          <>
            <Card title={m.payments.title}>
              <DataTable
                rows={d.rows}
                rowKey={(r: any) => r.id}
                csvName="payments"
                columns={[
                  { key: 'code', label: m.common.code, render: (r: any) => <Link to={`/bookings/${r.bookingId}`} className="k-num">{r.code}</Link>, csv: (r: any) => r.code },
                  { key: 'kind', label: m.payments.kind },
                  { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status} label={statusLabel(r.status)} />, csv: (r: any) => r.status },
                  { key: 'amount', label: m.common.amount, render: (r: any) => <Money baisa={r.amount} />, csv: (r: any) => omr(r.amount), sort: (a: any, b: any) => a.amount - b.amount },
                  { key: 'refundedAmount', label: m.payments.refunds, render: (r: any) => (r.refundedAmount ? <Money baisa={r.refundedAmount} /> : '—'), csv: (r: any) => omr(r.refundedAmount) },
                  { key: 'provider', label: m.payments.provider },
                  { key: 'providerRef', label: m.payments.ref, render: (r: any) => <span className="k-ltr k-xs">{r.providerRef ?? '—'}</span> },
                  { key: 'createdAt', label: m.common.date, render: (r: any) => dateTime(r.createdAt, locale), csv: (r: any) => r.createdAt },
                  {
                    key: 'sync',
                    label: m.common.actions,
                    render: (r: any) =>
                      ['pending', 'failed'].includes(r.status) ? (
                        <Button
                          size="sm"
                          variant="quiet"
                          icon={<RefreshCw size={14} aria-hidden />}
                          onClick={async () => {
                            try {
                              const x = await post(`/payments/${r.id}/sync`);
                              toast(`${m.payments.sync}: ${statusLabel(x.status)}`, 'success');
                              s.reload();
                            } catch (e) {
                              toast(errorText(t, e), 'danger');
                            }
                          }}
                        >
                          {m.payments.sync}
                        </Button>
                      ) : null,
                  },
                ]}
              />
              <Pager page={page} total={d.total} onPage={(p) => setSp({ ...Object.fromEntries(sp), page: String(p) })} />
            </Card>
            <Card title={m.payments.refunds}>
              <DataTable
                rows={d.refunds}
                rowKey={(r: any) => r.id}
                csvName="refunds"
                columns={[
                  { key: 'code', label: m.common.code, render: (r: any) => <Link to={`/bookings/${r.bookingId}`} className="k-num">{r.code}</Link>, csv: (r: any) => r.code },
                  { key: 'reasonCode', label: m.common.reason },
                  { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status} label={statusLabel(r.status)} />, csv: (r: any) => r.status },
                  { key: 'amount', label: m.common.amount, render: (r: any) => <Money baisa={r.amount} />, csv: (r: any) => omr(r.amount) },
                  { key: 'createdAt', label: m.common.date, render: (r: any) => dateTime(r.createdAt, locale) },
                  { key: 'retry', label: m.common.actions, render: (r: any) => (r.status === 'failed' ? <Act label={m.payments.retry} run={(reason) => post(`/refunds/${r.id}/retry`, { reason })} onDone={s.reload} money /> : null) },
                ]}
              />
            </Card>
          </>
        )}
      </Loaded>
      <Card title={m.payments.reconcile}>
        <form
          className="k-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setRecErr(null);
            const rows = report
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
              .map((l) => l.split(/[,;\t]/).map((x) => x.trim()))
              .filter((p) => p.length >= 2 && /^-?\d+$/.test(p[1]!))
              .map((p) => ({ providerRef: p[0]!, amount: Number(p[1]) }));
            try {
              setRec(await post('/payments/reconcile', { rows }));
            } catch (er) {
              setRecErr(errorText(t, er));
            }
          }}
        >
          <TextArea label={m.payments.reconcileBody} value={report} onChange={(e) => setReport(e.target.value)} rows={6} dir="ltr" />
          {recErr && <span className="k-error">{recErr}</span>}
          <Button type="submit" variant="primary" style={{ alignSelf: 'flex-start' }}>
            {m.payments.run}
          </Button>
        </form>
        {rec && (
          <div className="k-stack" style={{ marginBlockStart: 12 }}>
            <Banner tone={rec.mismatched.length || rec.missingFromReport.length ? 'warning' : 'success'} title={m.payments.matched.replace('{n}', String(rec.matched))} />
            {rec.mismatched.length > 0 && (
              <DataTable
                rows={rec.mismatched}
                rowKey={(r: any) => r.providerRef}
                csvName="reconcile-mismatched"
                columns={[
                  { key: 'providerRef', label: m.payments.ref },
                  { key: 'ours', label: m.payments.ours, render: (r: any) => (r.ours == null ? '—' : <Money baisa={r.ours} />) },
                  { key: 'theirs', label: m.payments.theirs, render: (r: any) => <Money baisa={r.theirs} /> },
                ]}
              />
            )}
            {rec.missingFromReport.length > 0 && (
              <>
                <strong>{m.payments.missing}</strong>
                <DataTable rows={rec.missingFromReport} rowKey={(r: any) => String(r.providerRef)} columns={[{ key: 'providerRef', label: m.payments.ref }, { key: 'amount', label: m.common.amount, render: (r: any) => <Money baisa={r.amount} /> }]} />
              </>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- payouts (§9.2 #9)
export function Payouts() {
  const { m, locale } = useAdmin();
  const s = useLoad(() => api('/payouts'));
  const [paid, setPaid] = useState<string | null>(null);
  const [ref, setRef] = useState('');
  const [reason, setReason] = useState('');
  return (
    <>
      <PageHead title={m.payouts.title} onRefresh={s.reload} actions={<Adjustment onDone={s.reload} />} />
      <Loaded state={s}>
        {(d: any) => {
          const ready = d.due.filter((g: any) => !g.blocked);
          return (
            <>
              <Card title={m.payouts.due} actions={ready.length > 0 && <Act label={m.payouts.createBatch} body={<p className="k-small">{m.payouts.createBody}</p>} run={(r) => post('/payouts/batches', { reason: r, confirm: true })} onDone={s.reload} money variant="primary" size="md" />}>
                {d.due.length === 0 ? (
                  <EmptyState title={m.payouts.empty} />
                ) : (
                  <>
                    <div className="k-grid" style={{ '--min': '180px', marginBlockEnd: 12 } as React.CSSProperties}>
                      <Stat label={m.common.total.replace('{n}', String(ready.length))} value={<Money baisa={ready.reduce((x: number, g: any) => x + g.amount, 0)} />} />
                    </div>
                    <DataTable
                      rows={d.due}
                      rowKey={(r: any) => r.technicianId}
                      csvName="payouts-due"
                      columns={[
                        { key: 'name', label: m.common.technician, render: (r: any) => <Link to={`/technicians/${r.technicianId}`}>{r.name ?? '—'}</Link>, csv: (r: any) => r.name ?? '' },
                        { key: 'amount', label: m.common.amount, render: (r: any) => <Money baisa={r.amount} strong />, csv: (r: any) => omr(r.amount), sort: (a: any, b: any) => a.amount - b.amount },
                        { key: 'items', label: m.tech.jobs, render: (r: any) => <span className="k-num">{r.items.length}</span> },
                        { key: 'blocked', label: m.common.status, render: (r: any) => (r.blocked ? <Pill status="failed" label={(m.payouts.blocked as Record<string, string>)[r.blocked]} /> : <Pill status="active" label="✓" />), csv: (r: any) => r.blocked ?? 'ok' },
                      ]}
                    />
                  </>
                )}
              </Card>
              <Card title={m.payouts.batches}>
                {d.batches.length === 0 ? (
                  <span className="k-muted">—</span>
                ) : (
                  <div className="k-stack">
                    {d.batches.map((b: any) => (
                      <div key={b.id} className="k-card k-tight" style={{ background: 'var(--surface-2)' }}>
                        <div className="k-row k-between" style={{ flexWrap: 'wrap', gap: 8 }}>
                          <span className="k-row" style={{ gap: 8 }}>
                            <strong className="k-num">{b.id.slice(0, 8)}</strong>
                            <Pill status={b.status} label={(m.payouts.statuses as Record<string, string>)[b.status] ?? b.status} />
                            <Money baisa={b.total} strong />
                            <span className="k-xs k-muted">{dateTime(b.createdAt, locale)}</span>
                            {b.bankReference && <span className="k-xs k-ltr">{b.bankReference}</span>}
                          </span>
                          <div className="a-actions">
                            <Button size="sm" variant="secondary" icon={<Download size={14} aria-hidden />} onClick={() => download(`/payouts/batches/${b.id}/csv`, `payouts-${b.id.slice(0, 8)}.csv`)}>
                              {m.payouts.csv}
                            </Button>
                            {b.status === 'open' && (
                              <Button size="sm" variant="primary" onClick={() => (setRef(''), setReason(''), setPaid(b.id))}>
                                {m.payouts.markPaid}
                              </Button>
                            )}
                          </div>
                        </div>
                        <DataTable
                          rows={b.payouts}
                          rowKey={(r: any) => r.id}
                          columns={[
                            { key: 'name', label: m.common.technician, render: (r: any) => r.name ?? '—' },
                            { key: 'amount', label: m.common.amount, render: (r: any) => <Money baisa={r.amount} /> },
                            { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status} label={(m.payouts.statuses as Record<string, string>)[r.status] ?? r.status} /> },
                            { key: 'fail', label: m.common.actions, render: (r: any) => (r.status !== 'failed' && b.status === 'paid' ? <Act label={m.payouts.failed} run={(reason2) => post(`/payouts/${r.id}/failed`, { reason: reason2 })} onDone={s.reload} money danger /> : null) },
                          ]}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <FormModal open={Boolean(paid)} onClose={() => setPaid(null)} title={m.payouts.markPaid} submitLabel={m.payouts.markPaid} money onSubmit={async () => (await post(`/payouts/batches/${paid}/paid`, { bankReference: ref, reason, confirm: true }), s.reload())}>
                <TextField label={m.payouts.bankRef} value={ref} onChange={(e) => setRef(e.target.value)} dir="ltr" required />
                <ReasonField value={reason} onChange={setReason} />
              </FormModal>
            </>
          );
        }}
      </Loaded>
    </>
  );
}

function Adjustment({ onDone }: { onDone: () => void }) {
  const { m } = useAdmin();
  const [open, setOpen] = useState(false);
  const [tech, setTech] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const techs = useLoad(() => (open ? api('/technicians') : Promise.resolve(null)), [open]);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {m.payouts.adjust}
      </Button>
      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title={m.payouts.adjust}
        submitLabel={m.payouts.adjust}
        money
        onSubmit={async () => {
          const neg = amount.trim().startsWith('-');
          const v = parseOMR(amount.replace(/^-/, ''));
          if (v == null || v === 0 || !tech) throw new ApiError(400, 'invalid_amount');
          await post('/payouts/adjustments', { technicianId: tech, amount: neg ? -v : v, reason, confirm: true });
          onDone();
        }}
      >
        <p className="k-small k-muted">{m.payouts.adjustBody}</p>
        <Select label={m.payouts.technicianId} value={tech} onChange={(e) => setTech(e.target.value)} placeholder="—" options={((techs.data as any)?.rows ?? []).map((r: any) => ({ value: r.id, label: r.name ?? r.id }))} />
        <TextField label={m.common.amount} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" placeholder="-1.500" />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </>
  );
}

// ---------------------------------------------------------------- reports and ledger (§9.2 #10)
export function Reports() {
  const { m, f } = useAdmin();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const s = useLoad(() => api(`/reports?${new URLSearchParams({ ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) })}`), [range]);
  return (
    <>
      <PageHead title={m.reports.title} onRefresh={s.reload} actions={<Button size="sm" icon={<Download size={14} aria-hidden />} onClick={() => download('/ledger.csv', 'ledger.csv')}>{m.reports.ledgerCsv}</Button>} />
      <Card>
        <form
          className="a-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setRange({ from, to });
          }}
        >
          <TextField label={m.reports.from} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label={m.reports.to} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button type="submit">{m.common.refresh}</Button>
        </form>
      </Card>
      <Loaded state={s}>
        {(r: any) => (
          <>
            <Banner tone={r.balanced ? 'success' : 'danger'} title={r.balanced ? m.reports.balanced : m.reports.unbalanced}>
              <span className="k-small">
                {m.reports.debit}: {omr(r.totals.debit)} · {m.reports.credit}: {omr(r.totals.credit)} · {f(m.reports.vat, { on: r.vat.enabled ? '✓' : '✕' })}
              </span>
            </Banner>
            <div className="k-grid" style={{ '--min': '200px' } as React.CSSProperties}>
              <Card tight>
                <Stat label={m.reports.held} value={<Money baisa={r.balances.held} />} />
              </Card>
              <Card tight>
                <Stat label={m.reports.payable} value={<Money baisa={r.balances.payable} />} />
              </Card>
              <Card tight>
                <Stat label={m.reports.revenue} value={<Money baisa={r.balances.revenue} />} />
              </Card>
            </div>
            <div className="a-two">
              <Card title={m.reports.byAccount}>
                <DataTable
                  rows={Object.entries(r.byAccount).map(([account, v]: [string, any]) => ({ account, ...v }))}
                  rowKey={(x: any) => x.account}
                  csvName="by-account"
                  columns={[
                    { key: 'account', label: m.reports.byAccount, render: (x: any) => <code className="k-ltr k-xs">{x.account}</code> },
                    { key: 'debit', label: m.reports.debit, render: (x: any) => <Money baisa={x.debit} currency={false} />, csv: (x: any) => omr(x.debit) },
                    { key: 'credit', label: m.reports.credit, render: (x: any) => <Money baisa={x.credit} currency={false} />, csv: (x: any) => omr(x.credit) },
                  ]}
                />
              </Card>
              <Card title={m.reports.commissionByType}>
                <DataTable
                  rows={Object.entries(r.commissionByType).map(([k, v]) => ({ k, v: v as number }))}
                  rowKey={(x) => x.k}
                  columns={[
                    { key: 'k', label: m.common.reason, render: (x) => <code className="k-ltr k-xs">{x.k}</code> },
                    { key: 'v', label: m.common.amount, render: (x) => <Money baisa={x.v} /> },
                  ]}
                />
              </Card>
            </div>
            <Card title={m.reports.byDay}>
              <DataTable
                rows={Object.entries(r.byDay)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([day, v]: [string, any]) => ({ day, revenue: v.platform_revenue ?? 0, payable: v.technician_payable ?? 0, held: v.held_for_technicians ?? 0 }))}
                rowKey={(x: any) => x.day}
                csvName="by-day"
                columns={[
                  { key: 'day', label: m.common.date, render: (x: any) => <span className="k-num">{x.day}</span> },
                  { key: 'revenue', label: m.reports.revenue, render: (x: any) => <Money baisa={x.revenue} />, csv: (x: any) => omr(x.revenue) },
                  { key: 'payable', label: m.reports.payable, render: (x: any) => <Money baisa={x.payable} />, csv: (x: any) => omr(x.payable) },
                  { key: 'held', label: m.reports.held, render: (x: any) => <Money baisa={x.held} />, csv: (x: any) => omr(x.held) },
                ]}
              />
            </Card>
          </>
        )}
      </Loaded>
    </>
  );
}
