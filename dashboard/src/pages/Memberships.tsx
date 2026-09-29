import { useState } from 'react';
import { get, type Membership, type Page } from '../api';
import { useI18n } from '../i18n';
import { useLive } from '../live';
import { useNav } from '../nav';
import { Empty, Loading, PageHead, Pager, SearchField, Segmented, StatusBadge, initials, useDebounced, useLoad } from '../ui';

export function MembershipsPage() {
  const { t, date, money, number } = useI18n();
  const { navigate } = useNav();
  const [status, setStatus] = useState<'' | 'active' | 'expired' | 'cancelled'>('active');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(query.trim());
  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (status) params.set('status', status);
  if (search) params.set('q', search);
  const { data, reload } = useLoad(() => get<Page<Membership>>(`admin/memberships?${params}`), [params.toString()]);
  useLive(['memberships'], () => void reload());

  return (
    <>
      <PageHead title={t('memberships')} hint={t('membershipsHint')} />
      <section className="glass card stack">
        <div className="toolbar">
          <SearchField value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder={t('searchMembership')} />
          <Segmented value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[
            { value: 'active', label: t('active') }, { value: 'expired', label: t('expired') },
            { value: 'cancelled', label: t('cancelled') }, { value: '', label: t('all') },
          ]} />
          {data && <span className="muted small num toolbar-count">{t('results', { n: number(data.total) })}</span>}
        </div>
        {!data ? <Loading /> : data.items.length === 0 ? <Empty text={search ? t('noMatches') : undefined} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('member')}</th><th>{t('status')}</th><th>{t('source')}</th><th>{t('paid')}</th><th>{t('starts')}</th><th>{t('ends')}</th></tr></thead>
            <tbody>{data.items.map((m) => (
              <tr key={m.id} className="clickable" onClick={() => m.member && navigate('members', { memberId: m.member.id })}>
                <td>
                  <div className="person">
                    <span className="avatar small">{initials(m.member?.fullName ?? '')}</span>
                    <div className="person-text">
                      <strong>{m.member?.fullName}</strong>
                      <span className="muted small ltr num">{m.member?.memberNumber}</span>
                    </div>
                  </div>
                </td>
                <td><StatusBadge status={m.status} /></td>
                <td className="muted">{m.source}</td>
                <td className="num">{money(m.paidBaisa ?? 0)}</td>
                <td className="num">{date(m.startsAt)}</td>
                <td className="num">{date(m.expiresAt)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </section>
    </>
  );
}
