import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Card, DataTable, TextField } from '@katf/ui';
import { Act, api, Loaded, PageHead, Pager, Pill, post, Reveal, useLoad } from '../components';
import { useAdmin } from '../App';
import { date } from '../lib/fmt';

/** Customers (§9.2 #4): masked by default; phone reveal is logged. */
export function Customers() {
  const { m, locale } = useAdmin();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const page = Number(sp.get('page') ?? 1);
  const s = useLoad(() => api(`/customers?${new URLSearchParams({ ...(sp.get('q') ? { q: sp.get('q')! } : {}), page: String(page) })}`), [page, sp.get('q')]);
  const act = (id: string, action: string) => (reason: string) => post(`/customers/${id}/action`, { action, reason });
  return (
    <>
      <PageHead title={m.customers.title} onRefresh={s.reload} />
      <Card>
        <form
          className="a-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setSp(q ? { q } : {});
          }}
        >
          <TextField label={m.common.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="9XXXXXXX" />
          <Button type="submit">{m.common.search}</Button>
        </form>
      </Card>
      <Loaded state={s}>
        {(d: any) => (
          <Card>
            <DataTable
              rows={d.rows}
              rowKey={(r: any) => r.id}
              columns={[
                { key: 'name', label: m.common.name, render: (r: any) => r.name ?? '—' },
                { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status} label={(m.customers.statuses as Record<string, string>)[r.status]} /> },
                { key: 'createdAt', label: m.customers.joined, render: (r: any) => date(r.createdAt, locale) },
                { key: 'bookings', label: m.customers.bookings, render: (r: any) => <span className="k-num">{r.bookings}</span>, sort: (a: any, b: any) => a.bookings - b.bookings },
                { key: 'refunds', label: m.customers.refunds, render: (r: any) => <span className="k-num">{r.refunds}</span>, sort: (a: any, b: any) => a.refunds - b.refunds },
                { key: 'phone', label: m.common.phone, render: (r: any) => (r.status === 'deleted' ? '—' : <Reveal path={`/customers/${r.id}/reveal`} field="phone" label={m.common.phone} />) },
                {
                  key: 'actions',
                  label: m.common.actions,
                  render: (r: any) =>
                    r.status === 'deleted' ? null : (
                      <div className="a-actions">
                        {r.status === 'active' ? <Act label={m.customers.block} run={act(r.id, 'block')} onDone={s.reload} danger /> : <Act label={m.customers.unblock} run={act(r.id, 'unblock')} onDone={s.reload} />}
                        <Act label={m.common.addNote} run={act(r.id, 'note')} onDone={s.reload} variant="quiet" />
                        <Act label={m.customers.anonymise} body={<p className="k-small">{m.customers.anonymiseBody}</p>} run={act(r.id, 'anonymise')} onDone={s.reload} danger variant="quiet" />
                      </div>
                    ),
                },
              ]}
            />
            <Pager page={page} total={d.total} onPage={(p) => setSp({ ...Object.fromEntries(sp), page: String(p) })} />
          </Card>
        )}
      </Loaded>
    </>
  );
}
