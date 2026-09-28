import { useState } from 'react';
import { get, type Membership, type Page } from '../api';
import { useI18n } from '../i18n';
import { useLive } from '../live';
import { Empty, Loading, PageHead, Pager, Segmented, StatusBadge, useLoad } from '../ui';

export function MembershipsPage() {
  const { t, date, money, number } = useI18n();
  const [status, setStatus] = useState<'' | 'active' | 'expired' | 'cancelled'>('active');
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (status) params.set('status', status);
  const { data, reload } = useLoad(() => get<Page<Membership>>(`admin/memberships?${params}`), [params.toString()]);
  useLive(['memberships'], () => void reload());

  return (
    <>
      <PageHead title={t('memberships')} hint={t('membershipsHint')}>
        <span className="badge num">{number(data?.total ?? 0)}</span>
      </PageHead>
      <section className="glass card stack">
        <Segmented value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[
          { value: 'active', label: t('active') }, { value: 'expired', label: t('expired') },
          { value: 'cancelled', label: t('cancelled') }, { value: '', label: t('all') },
        ]} />
        {!data ? <Loading /> : data.items.length === 0 ? <Empty /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('member')}</th><th>{t('status')}</th><th>{t('source')}</th><th>{t('paid')}</th><th>{t('starts')}</th><th>{t('ends')}</th></tr></thead>
            <tbody>{data.items.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.member?.fullName}</strong><div className="muted small ltr">{m.member?.memberNumber}</div></td>
                <td><StatusBadge status={m.status} /></td>
                <td className="muted">{m.source}</td>
                <td className="num">{money(m.paidBaisa ?? 0)}</td>
                <td>{date(m.startsAt)}</td>
                <td>{date(m.expiresAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </section>
    </>
  );
}
