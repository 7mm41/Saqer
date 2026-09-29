import { useEffect, useState, type FormEvent } from 'react';
import { fromOMR, get, patch, post, type Booking, type Membership, type Page, type Plan, type Role, type User } from '../api';
import { useI18n } from '../i18n';
import { Icon } from '../icons';
import { useLive } from '../live';
import { useNav } from '../nav';
import {
  Empty, Field, Loading, LocalizedField, Modal, PageHead, Pager, SearchField, Segmented, StatusBadge, initials, useConfirm,
  useDebounced, useErrorText, useLoad, useToast,
} from '../ui';

type MemberRow = User & { membership: Membership | null };

export function MembersPage() {
  const { t, date, number } = useI18n();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'suspended'>('');
  const [page, setPage] = useState(1);
  const [openID, setOpenID] = useState<string | null>(null);
  const { intent, clearIntent } = useNav();
  const search = useDebounced(query.trim());

  // Opened from search: show that member.
  useEffect(() => {
    if (!intent?.memberId) return;
    setOpenID(intent.memberId);
    clearIntent();
  }, [intent, clearIntent]);

  const params = new URLSearchParams({ page: String(page), pageSize: '25' });
  if (search) params.set('q', search);
  if (status) params.set('status', status);
  const { data, reload } = useLoad(() => get<Page<MemberRow>>(`admin/members?${params}`), [params.toString()]);
  useLive(['members', 'memberships'], () => void reload());

  return (
    <>
      <PageHead title={t('members')} hint={t('membersHint')} />
      <section className="glass card stack">
        <div className="toolbar">
          <SearchField value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder={t('searchMembers')} />
          <Segmented value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[
            { value: '', label: t('all') }, { value: 'active', label: t('active') }, { value: 'suspended', label: t('suspended') },
          ]} />
          {data && <span className="muted small num toolbar-count">{t('results', { n: number(data.total) })}</span>}
        </div>
        {!data ? <Loading /> : data.items.length === 0 ? <Empty text={search ? t('noMatches') : undefined} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('member')}</th><th>{t('phone')}</th><th>{t('membership')}</th><th>{t('role')}</th><th>{t('joined')}</th></tr></thead>
              <tbody>
                {data.items.map((member) => (
                  <tr key={member.id} className="clickable" onClick={() => setOpenID(member.id)}>
                    <td>
                      <div className="person">
                        <span className="avatar">{initials(member.fullName)}</span>
                        <div className="person-text">
                          <strong>{member.fullName}</strong>
                          <span className="muted small ltr">{member.email}</span>
                        </div>
                        {member.status === 'suspended' && <StatusBadge status="suspended" />}
                      </div>
                    </td>
                    <td className="ltr num">{member.phone ? `+968 ${member.phone}` : '—'}</td>
                    <td>{member.membership
                      ? <span className="badge green"><Icon name="crown" size={12} />{t('until')} {date(member.membership.expiresAt)}</span>
                      : <span className="badge">{t('noMembership')}</span>}</td>
                    <td><RoleBadge role={member.role} /></td>
                    <td className="muted num">{date(member.memberSince)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </section>
      {openID && <MemberModal id={openID} onClose={() => setOpenID(null)} />}
    </>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const { t } = useI18n();
  if (role === 'admin') return <span className="badge orange">{t('roleAdmin')}</span>;
  if (role === 'staff') return <span className="badge gold">{t('roleStaff')}</span>;
  return <span className="badge">{t('roleMember')}</span>;
}

type MemberDetail = { member: User; memberships: Membership[]; bookings: Booking[] };

function MemberModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, date, money, L, number } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const confirmAction = useConfirm();
  const { data, reload } = useLoad(() => get<MemberDetail>(`admin/members/${id}`), [id]);
  const { data: plans } = useLoad(() => get<{ plans: Plan[] }>('admin/plans'), []);
  useLive(['members', 'memberships', 'bookings'], () => void reload());
  const [days, setDays] = useState('365');
  const [paid, setPaid] = useState('0');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ title: { en: '', ar: '' }, body: { en: '', ar: '' } });

  if (!data) return <Modal title={t('member')} onClose={onClose}><Loading /></Modal>;
  const { member } = data;
  const plan = plans?.plans[0];

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); toast(t('saved')); await reload(); } catch (error) { toast(errorText(error), true); } finally { setBusy(false); }
  };

  const grant = (event: FormEvent) => {
    event.preventDefault();
    if (!plan) return;
    void run(() => post(`admin/members/${id}/memberships`, { planId: plan.id, days: Number(days), paidBaisa: fromOMR(paid || '0') }));
  };

  const notify = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await post('admin/notifications', { ...message, audience: 'user', userId: id });
      setMessage({ title: { en: '', ar: '' }, body: { en: '', ar: '' } });
    });
  };

  return (
    <Modal title={member.fullName} onClose={onClose}>
      <div className="stack">
        <div className="row between">
          <div className="row">
            <span className="avatar large">{initials(member.fullName)}</span>
            <div>
              <div className="ltr">{member.email}</div>
              <div className="muted small ltr num">{member.phone ? `+968 ${member.phone}` : ''} · {member.memberNumber}</div>
            </div>
          </div>
          <div className="row">
            <select className="select" style={{ width: 'auto' }} value={member.role} disabled={busy}
              onChange={(event) => void run(() => patch(`admin/members/${id}`, { role: event.target.value }))}>
              <option value="member">{t('roleMember')}</option>
              <option value="staff">{t('roleStaff')}</option>
              <option value="admin">{t('roleAdmin')}</option>
            </select>
            {member.status === 'active'
              ? <button className="btn danger small" disabled={busy} onClick={async () => { if (await confirmAction(t('suspendConfirm'), { action: t('suspend') })) void run(() => patch(`admin/members/${id}`, { status: 'suspended' })); }}>{t('suspend')}</button>
              : <button className="btn small" disabled={busy} onClick={() => void run(() => patch(`admin/members/${id}`, { status: 'active' }))}>{t('reactivate')}</button>}
          </div>
        </div>

        <form className="glass card stack" onSubmit={grant}>
          <h3 className="with-icon"><Icon name="crown" size={18} />{t('grantMembership')}</h3>
          <p className="muted small">{t('grantHint')}</p>
          <div className="triple">
            <Field label={t('days')}><input className="input num ltr" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} /></Field>
            <Field label={t('amountPaid')}><input className="input num ltr" inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} /></Field>
            <div className="field"><span>&nbsp;</span><button className="btn primary" disabled={busy || !plan}>{t('grantMembership')}</button></div>
          </div>
        </form>

        <section className="stack">
          <h3>{t('history')}</h3>
          {data.memberships.length === 0 ? <p className="muted">{t('noMembership')}</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('status')}</th><th>{t('source')}</th><th>{t('starts')}</th><th>{t('ends')}</th><th /></tr></thead>
              <tbody>{data.memberships.map((m) => (
                <tr key={m.id}>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="muted">{m.source}</td>
                  <td className="num">{date(m.startsAt)}</td>
                  <td className="num">{date(m.expiresAt)}</td>
                  <td>{m.status === 'active' && (
                    <button className="btn small ghost" disabled={busy} onClick={async () => { if (await confirmAction(`${t('cancelMembership')}?`, { action: t('cancelMembership') })) void run(() => post(`admin/memberships/${m.id}/cancel`)); }}>{t('cancelMembership')}</button>
                  )}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>

        <section className="stack">
          <h3>{t('codes')}</h3>
          {data.bookings.length === 0 ? <p className="muted">{t('empty')}</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('codes')}</th><th>{t('venues')}</th><th>{t('quantity')}</th><th>{t('paid')}</th><th>{t('status')}</th></tr></thead>
              <tbody>{data.bookings.map((b) => (
                <tr key={b.id}>
                  <td className="ltr num"><strong>{b.code}</strong></td>
                  <td>{L(b.venueName)} · <span className="muted">{L(b.offerTitle)}</span></td>
                  <td className="num">{number(b.quantity)}</td>
                  <td className="num">{money(b.paidTotalBaisa)}</td>
                  <td><StatusBadge status={b.status} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>

        <form className="glass card stack" onSubmit={notify}>
          <h3 className="with-icon"><Icon name="bell" size={18} />{t('notifyMember')}</h3>
          <LocalizedField label={t('title')} value={message.title} onChange={(title) => setMessage({ ...message, title })} />
          <LocalizedField label={t('message')} multiline value={message.body} onChange={(body) => setMessage({ ...message, body })} />
          <div className="row"><button className="btn primary" disabled={busy}>{t('send')}</button></div>
        </form>
      </div>
    </Modal>
  );
}
