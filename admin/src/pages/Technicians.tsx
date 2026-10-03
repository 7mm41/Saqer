import { useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, BadgeCheck, FileText } from 'lucide-react';
import { AC_TYPES, DOCUMENT_TYPES, label, STRIKE_REASONS, TECH_SERVICES, WEEKDAYS, WORK_STATUSES, parsePercent, formatPercent } from '@katf/shared';
import { Banner, Button, Card, Checkbox, DataTable, EmptyState, Modal, Money, Select, Spinner, Tabs, TextArea, TextField } from '@katf/ui';
import { Act, api, FormModal, KV, Loaded, PageHead, Pager, Photos, Pill, post, ReasonField, Reveal, useLoad } from '../components';
import { useAdmin } from '../App';
import { ApiError } from '../lib/api';
import { date, dateTime, omr, pct, wilayatName } from '../lib/fmt';

// ---------------------------------------------------------------- applications queue (§9.2 #2)
export function Applications() {
  return (
    <Routes>
      <Route index element={<ApplicationsList />} />
      <Route path=":id" element={<TechnicianDetail back="/applications" />} />
    </Routes>
  );
}

function ApplicationsList() {
  const { m, f, locale } = useAdmin();
  const nav = useNavigate();
  const s = useLoad(() => api<any[]>('/applications'));
  return (
    <>
      <PageHead title={m.applications.title} onRefresh={s.reload} />
      <Loaded state={s}>
        {(rows) =>
          rows.length === 0 ? (
            <Card>
              <EmptyState title={m.applications.empty} />
            </Card>
          ) : (
            <Card>
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                onRow={(r) => nav(r.id)}
                columns={[
                  { key: 'name', label: m.common.name, render: (r) => <strong>{r.name ?? '—'}</strong> },
                  { key: 'status', label: m.common.status, render: (r) => <Pill status={r.status} label={(m.tech.statuses as Record<string, string>)[r.status]} /> },
                  { key: 'workStatus', label: m.applications.workStatus, render: (r) => label(WORK_STATUSES, r.workStatus, locale) },
                  { key: 'areas', label: m.common.area, render: (r) => r.areas.map((a: any) => wilayatName(a.wilayat, locale)).join('، ') },
                  { key: 'submittedAt', label: m.applications.submitted, render: (r) => dateTime(r.submittedAt, locale), sort: (a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt) },
                  {
                    key: 'waitingHours',
                    label: m.applications.waiting,
                    render: (r) => <span style={{ color: r.waitingHours > 48 ? 'var(--danger)' : undefined }}>{r.waitingHours == null ? '—' : f(m.common.hours, { n: r.waitingHours })}</span>,
                    sort: (a, b) => (a.waitingHours ?? 0) - (b.waitingHours ?? 0),
                  },
                ]}
              />
            </Card>
          )
        }
      </Loaded>
    </>
  );
}

// ---------------------------------------------------------------- technicians (§9.2 #3)
export function Technicians() {
  return (
    <Routes>
      <Route index element={<TechniciansList />} />
      <Route path=":id" element={<TechnicianDetail back="/technicians" />} />
    </Routes>
  );
}

function TechniciansList() {
  const { m, locale } = useAdmin();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const status = sp.get('status') ?? '';
  const page = Number(sp.get('page') ?? 1);
  const s = useLoad(() => api(`/technicians?${new URLSearchParams({ ...(status ? { status } : {}), ...(sp.get('q') ? { q: sp.get('q')! } : {}), page: String(page) })}`), [status, page, sp.get('q')]);
  return (
    <>
      <PageHead title={m.tech.title} onRefresh={s.reload} />
      <Card>
        <form
          className="a-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setSp({ ...(status ? { status } : {}), ...(q ? { q } : {}) });
          }}
        >
          <TextField label={m.common.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="9XXXXXXX" />
          <Select
            label={m.common.status}
            value={status}
            onChange={(e) => setSp({ ...(e.target.value ? { status: e.target.value } : {}), ...(q ? { q } : {}) })}
            options={[{ value: '', label: m.common.all }, ...Object.entries(m.tech.statuses).map(([value, l]) => ({ value, label: l as string }))]}
          />
          <Button type="submit" variant="secondary">
            {m.common.search}
          </Button>
        </form>
      </Card>
      <Loaded state={s}>
        {(d: any) => (
          <Card>
            <DataTable
              rows={d.rows}
              rowKey={(r: any) => r.id}
              onRow={(r: any) => nav(r.id)}
              csvName="technicians"
              columns={[
                { key: 'name', label: m.common.name, render: (r: any) => <strong>{r.name ?? '—'}</strong> },
                { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status} label={(m.tech.statuses as Record<string, string>)[r.status]} /> },
                { key: 'areas', label: m.tech.areas, render: (r: any) => r.areas.map((a: string) => wilayatName(a, locale)).join('، ') },
                { key: 'rating', label: m.tech.rating, render: (r: any) => (r.rating ? <span className="k-num">★ {r.rating}</span> : '—'), sort: (a: any, b: any) => (a.rating ?? 0) - (b.rating ?? 0) },
                { key: 'jobs', label: m.tech.jobsDone, render: (r: any) => <span className="k-num">{r.jobs}</span>, sort: (a: any, b: any) => a.jobs - b.jobs },
                { key: 'strikes', label: m.tech.strikes, render: (r: any) => <span className="k-num">{r.strikes}</span>, sort: (a: any, b: any) => a.strikes - b.strikes },
                { key: 'balance', label: m.tech.payouts, render: (r: any) => <Money baisa={r.balance} />, csv: (r: any) => omr(r.balance), sort: (a: any, b: any) => a.balance - b.balance },
              ]}
            />
            <Pager page={page} total={d.total} onPage={(p) => setSp({ ...Object.fromEntries(sp), page: String(p) })} />
          </Card>
        )}
      </Loaded>
    </>
  );
}

const CHECKS = ['identity_matches', 'selfie_matches', 'documents_valid', 'work_permission', 'bank_name_matches', 'references_called', 'work_photos_real', 'no_duplicates'] as const;
const REVEAL_FIELDS = ['phone', 'full_name', 'civil_id', 'dob', 'email', 'cr_number', 'iban', 'holder', 'references', 'emergency'] as const;

export function TechnicianDetail({ back }: { back: string }) {
  const { id } = useParams();
  const { m, f, locale, can } = useAdmin();
  const s = useLoad(() => api(`/technicians/${id}`), [id]);
  const [tab, setTab] = useState<'profile' | 'documents' | 'jobs' | 'strikes' | 'money' | 'history'>('profile');
  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;
  return (
    <>
      <Link to={back} className="k-btn k-btn-quiet k-btn-sm" style={{ alignSelf: 'flex-start' }}>
        <Back size={16} aria-hidden /> {m.common.back}
      </Link>
      <Loaded state={s}>
        {(t: any) => {
          const reviewing = ['submitted', 'in_review', 'needs_info'].includes(t.status);
          const act = (action: string, value?: unknown) => (reason: string) => post(`/technicians/${t.id}/action`, { action, reason, value });
          return (
            <>
              <PageHead
                title={
                  <span className="k-row" style={{ gap: 10 }}>
                    {t.photoUrl ? <img className="k-avatar" src={t.photoUrl} alt="" /> : null}
                    {t.publicName ?? '—'}
                    <Pill status={t.status} label={(m.tech.statuses as Record<string, string>)[t.status]} />
                  </span>
                }
                sub={
                  <>
                    {t.rating ? `★ ${t.rating} (${t.ratingCount}) · ` : ''}
                    {m.tech.jobsDone}: {t.jobsCompleted} · {m.tech.strikes}: {t.strikesCount}
                    {t.status === 'approved_probation' ? ` · ${f(m.tech.probation, { n: t.probationJobsLeft })}` : ''}
                  </>
                }
                onRefresh={s.reload}
              />

              {t.duplicates.phone.length > 0 && <Banner tone="danger" title={`${m.tech.duplicates}: ${t.duplicates.phone.length}`} />}

              {reviewing && can(['verifier']) && <Decision t={t} onDone={s.reload} />}

              {!reviewing && (
                <Card title={m.common.actions}>
                  <div className="a-actions">
                    {can(['verifier', 'support']) && (
                      <>
                        {['active', 'approved_probation'].includes(t.status) && <Act label={m.tech.act.pause} run={act('pause')} onDone={s.reload} />}
                        {t.status === 'paused' && <Act label={m.tech.act.unpause} run={act('unpause')} onDone={s.reload} />}
                        {t.status !== 'suspended' && t.status !== 'banned' && <Act label={m.tech.act.suspend} run={act('suspend')} onDone={s.reload} danger />}
                        {t.status === 'suspended' && <Act label={m.tech.act.unsuspend} run={act('unsuspend')} onDone={s.reload} />}
                        {can(['support']) && t.status !== 'banned' && <Act label={m.tech.act.ban} body={<Banner tone="danger" title={m.tech.banBody} />} run={act('ban')} onDone={s.reload} danger />}
                        <Act label={m.tech.act.reset_device} run={act('reset_device')} onDone={s.reload} />
                        <AddStrike id={t.id} onDone={s.reload} />
                        <MessageTech id={t.id} />
                      </>
                    )}
                    {can(['finance']) && (
                      <>
                        <Commission id={t.id} current={t.commissionOverrideBps} onDone={s.reload} />
                        {!t.identity.bankVerified && <Act label={m.tech.act.verify_bank} run={act('verify_bank')} onDone={s.reload} money />}
                        <Act label={m.tech.act.hold} run={(reason) => post('/payouts/hold', { technicianId: t.id, hold: true, reason })} onDone={s.reload} money />
                        <Act label={m.tech.act.release} run={(reason) => post('/payouts/hold', { technicianId: t.id, hold: false, reason })} onDone={s.reload} money />
                      </>
                    )}
                    <Act label={m.common.addNote} run={act('note')} onDone={s.reload} variant="quiet" />
                  </div>
                </Card>
              )}

              <Tabs
                value={tab}
                onChange={setTab}
                label={m.tech.title}
                tabs={[
                  { value: 'profile', label: m.tech.profile },
                  { value: 'documents', label: `${m.tech.documents} (${t.documents.length})` },
                  { value: 'jobs', label: `${m.tech.jobs} (${t.jobs.length})` },
                  { value: 'strikes', label: `${m.tech.strikes} · ${m.tech.reviews}` },
                  { value: 'money', label: m.tech.payouts },
                  { value: 'history', label: m.tech.history },
                ]}
              />

              {tab === 'profile' && (
                <div className="a-two">
                  <div className="k-stack">
                    <Card title={m.tech.profile}>
                      <KV
                        items={[
                          [m.applications.workStatus, label(WORK_STATUSES, t.workStatus, locale)],
                          [m.tech.services, t.services.map((x: string) => label(TECH_SERVICES, x, locale)).join('، ')],
                          [m.tech.acTypes, t.acTypes.map((x: string) => label(AC_TYPES, x, locale)).join('، ')],
                          [m.tech.areas, t.areas.map((a: any) => `${wilayatName(a.wilayat, locale)}${a.neighbourhoods.length ? ` (${a.neighbourhoods.join('، ')})` : ''}`).join(' · ')],
                          [m.tech.schedule, `${(t.workingDays ?? []).map((d: number) => WEEKDAYS[d]?.[locale] ?? d).join('، ')} · ${t.workingHours ? `${t.workingHours.from}–${t.workingHours.to}` : ''}`],
                          [m.tech.slug, t.bookingSlug ? <span className="k-ltr">/t/{t.bookingSlug}</span> : '—'],
                          [m.tech.commission, t.commissionOverrideBps == null ? m.tech.commissionDefault : pct(t.commissionOverrideBps)],
                          [m.applications.submitted, dateTime(t.submittedAt, locale)],
                          [m.tech.quiz, t.quizPassedAt ? `✓ ${date(t.quizPassedAt, locale)}` : '—'],
                        ]}
                      />
                      {t.bio && <p className="k-small" style={{ marginBlockStart: 12 }}>{t.bio}</p>}
                    </Card>
                    <Card title={m.tech.workPhotos}>
                      <Photos urls={t.workPhotos} />
                    </Card>
                    {t.edits.filter((e: any) => e.status === 'pending').length > 0 && (
                      <Card title={m.tech.edits}>
                        {t.edits
                          .filter((e: any) => e.status === 'pending')
                          .map((e: any) => (
                            <div key={e.id} className="k-stack" style={{ marginBlockEnd: 12 }}>
                              <pre className="a-pre">{JSON.stringify(e.changes, null, 2)}</pre>
                              <div className="a-actions">
                                <Act label={m.tech.act.approve_edit} run={act('approve_edit', e.id)} onDone={s.reload} variant="primary" />
                                <Act label={m.tech.act.reject_edit} run={act('reject_edit', e.id)} onDone={s.reload} />
                              </div>
                            </div>
                          ))}
                      </Card>
                    )}
                    {t.internalNotes && (
                      <Card title={m.common.notes}>
                        <pre className="a-pre">{t.internalNotes}</pre>
                      </Card>
                    )}
                  </div>
                  <div className="k-stack">
                    <Card title={m.tech.identity}>
                      <KV
                        items={[
                          [m.tech.fields.phone, <span className="k-num">{t.identity.phone}</span>],
                          [m.tech.fields.full_name, t.identity.fullNameMasked],
                          [m.tech.fields.civil_id, <span className="k-num">{t.identity.civilId}</span>],
                          [m.tech.nameEn, t.fullNameEn],
                          [m.tech.nationality, t.nationality],
                        ]}
                      />
                      <div className="k-stack" style={{ marginBlockStart: 12, gap: 6 }}>
                        {REVEAL_FIELDS.map((fld) => (
                          <div key={fld} className="k-row k-between k-small">
                            <span>{m.tech.fields[fld]}</span>
                            <Reveal path={`/technicians/${t.id}/reveal`} field={fld} label={m.tech.fields[fld]} />
                          </div>
                        ))}
                      </div>
                    </Card>
                    <Card title={m.tech.bank}>
                      <KV
                        items={[
                          [m.tech.bank, t.identity.bankName],
                          ['IBAN', <span className="k-num">{t.identity.iban}</span>],
                          [
                            m.common.status,
                            <span className="k-row" style={{ gap: 6 }}>
                              {t.identity.bankVerified ? <Pill status="active" label={m.tech.bankVerified} /> : <Pill status="pending" label={m.tech.bankUnverified} />}
                              {t.identity.holderMatches === false && <Pill status="failed" label={m.tech.holderMismatch} />}
                            </span>,
                          ],
                          ...(t.identity.bankLockedUntil ? [[m.common.status, f(m.tech.bankLocked, { date: dateTime(t.identity.bankLockedUntil, locale) })] as [string, string]] : []),
                        ]}
                      />
                    </Card>
                    <Card title={m.tech.consents}>
                      {t.consents.length === 0 ? (
                        <span className="k-muted">—</span>
                      ) : (
                        <ul className="k-stack k-small" style={{ gap: 4, paddingInlineStart: 18, margin: 0 }}>
                          {t.consents.map((c: any) => (
                            <li key={`${c.docType}-${c.version}`}>
                              {c.docType} v{c.version} — {dateTime(c.acceptedAt, locale)} {c.signatureName ? `· ✍ ${c.signatureName}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </div>
                </div>
              )}

              {tab === 'documents' && <Documents t={t} onDone={s.reload} act={act} />}

              {tab === 'jobs' && (
                <Card>
                  <DataTable
                    rows={t.jobs}
                    rowKey={(r: any) => r.id}
                    columns={[
                      { key: 'code', label: m.common.code, render: (r: any) => (can(['support', 'finance']) ? <Link to={`/bookings/${r.id}`} className="k-num">{r.code}</Link> : <span className="k-num">{r.code}</span>) },
                      { key: 'status', label: m.common.status, render: (r: any) => <StatusLabel s={r.status} /> },
                      { key: 'window', label: m.bookings.window, render: (r: any) => dateTime(r.window, locale) },
                      { key: 'net', label: m.bookings.techNet, render: (r: any) => <Money baisa={r.net} /> },
                    ]}
                  />
                </Card>
              )}

              {tab === 'strikes' && (
                <div className="a-two">
                  <Card title={m.tech.strikes}>
                    {t.strikes.length === 0 ? (
                      <span className="k-muted">—</span>
                    ) : (
                      <div className="k-list">
                        {t.strikes.map((st: any) => (
                          <div key={st.id} className="k-list-row" style={{ flexWrap: 'wrap' }}>
                            <span className="k-stack k-grow" style={{ gap: 2 }}>
                              <strong>{label(STRIKE_REASONS, st.reason, locale)}</strong>
                              <span className="k-xs k-muted">
                                {dateTime(st.createdAt, locale)} {st.removedAt ? `· ✕ ${st.removedReason ?? ''}` : ''}
                              </span>
                              {st.appealText && (
                                <span className="k-small">
                                  {m.tech.appeal}: {st.appealText}
                                </span>
                              )}
                            </span>
                            <div className="a-actions">
                              {st.appealStatus === 'pending' && can(['support']) && (
                                <>
                                  <Act label={m.tech.appealAccept} run={(reason) => post(`/strikes/${st.id}/appeal`, { accept: true, reason })} onDone={s.reload} variant="primary" />
                                  <Act label={m.tech.appealReject} run={(reason) => post(`/strikes/${st.id}/appeal`, { accept: false, reason })} onDone={s.reload} />
                                </>
                              )}
                              {!st.removedAt && can(['verifier', 'support']) && <Act label={m.tech.act.remove_strike} run={act('remove_strike', st.id)} onDone={s.reload} variant="quiet" />}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                  <Card title={m.tech.reviews}>
                    {t.reviews.length === 0 ? (
                      <span className="k-muted">—</span>
                    ) : (
                      <div className="k-list">
                        {t.reviews.map((r: any) => (
                          <div key={r.id} className="k-list-row">
                            <span className="k-stack" style={{ gap: 2 }}>
                              <span className="k-num">{'★'.repeat(r.rating)}</span>
                              {r.comment && <span className="k-small">{r.comment}</span>}
                              <span className="k-xs k-muted">{date(r.createdAt, locale)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {tab === 'money' && (
                <Card title={m.tech.payouts}>
                  <DataTable
                    rows={t.payables}
                    rowKey={(r: any) => r.id}
                    csvName={`payables-${t.id.slice(0, 8)}`}
                    columns={[
                      { key: 'source', label: m.payments.kind, render: (r: any) => (r.bookingId ? m.tech.jobs : m.payouts.adjust), csv: (r: any) => (r.bookingId ? 'booking' : 'adjustment') },
                      { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status} /> },
                      { key: 'amount', label: m.common.amount, render: (r: any) => <Money baisa={r.amount} />, csv: (r: any) => omr(r.amount) },
                      { key: 'dueAt', label: m.common.date, render: (r: any) => dateTime(r.dueAt, locale) },
                    ]}
                  />
                </Card>
              )}

              {tab === 'history' && (
                <Card title={m.tech.history}>
                  <DataTable
                    rows={t.history}
                    rowKey={(r: any) => String(r.id)}
                    columns={[
                      { key: 'createdAt', label: m.common.date, render: (r: any) => dateTime(r.createdAt, locale) },
                      { key: 'action', label: m.security.action, render: (r: any) => <code className="k-ltr">{r.action}</code> },
                      { key: 'reason', label: m.common.reason },
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

function StatusLabel({ s }: { s: string }) {
  const { t } = useAdmin();
  return <Pill status={s} label={t(`status.${s}`)} />;
}

function Decision({ t, onDone }: { t: any; onDone: () => void }) {
  const { m } = useAdmin();
  const [check, setCheck] = useState<Record<string, boolean>>(t.checklist ?? {});
  const complete = CHECKS.every((c) => check[c]);
  const decide = (decision: string) => (reason: string) => post(`/applications/${t.id}/decide`, { decision, reason, checklist: check });
  return (
    <Card title={m.applications.decide} strong float>
      <div className="a-two">
        <fieldset className="k-stack" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
          <legend className="k-label">{m.applications.checklist}</legend>
          {CHECKS.map((c) => (
            <Checkbox key={c} checked={Boolean(check[c])} onChange={(v) => setCheck({ ...check, [c]: v })}>
              {m.applications.check[c]}
            </Checkbox>
          ))}
        </fieldset>
        <div className="k-stack">
          {!complete && <Banner tone="warning" title={m.applications.checklistIncomplete} />}
          {t.status === 'submitted' && <Act label={m.applications.inReview} run={decide('in_review')} onDone={onDone} />}
          <Act label={m.applications.approve} body={<p className="k-small">{m.applications.approveBody}</p>} run={decide('approve')} onDone={onDone} variant="primary" disabled={!complete} icon={<BadgeCheck size={16} aria-hidden />} />
          <Act label={m.applications.needsInfo} body={<p className="k-small">{m.applications.needsInfoBody}</p>} run={decide('needs_info')} onDone={onDone} />
          <Act label={m.applications.reject} body={<p className="k-small">{m.applications.rejectBody}</p>} run={decide('reject')} onDone={onDone} danger />
          {t.needsInfoMessage && <Banner title={m.applications.needsInfo}>{t.needsInfoMessage}</Banner>}
        </div>
      </div>
    </Card>
  );
}

function Documents({ t, onDone, act }: { t: any; onDone: () => void; act: (a: string, v?: unknown) => (r: string) => Promise<unknown> }) {
  const { m, locale, can } = useAdmin();
  const [view, setView] = useState<{ url: string; type: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  return (
    <Card>
      <p className="k-small k-muted" style={{ marginBlockEnd: 10 }}>
        {m.tech.viewDocBody}
      </p>
      <DataTable
        rows={t.documents}
        rowKey={(r: any) => r.id}
        columns={[
          { key: 'type', label: m.tech.documents, render: (r: any) => label(DOCUMENT_TYPES, r.type, locale) },
          { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status} /> },
          { key: 'expiresAt', label: m.tech.expires, render: (r: any) => (r.expiresAt ? date(r.expiresAt, locale) : '—') },
          {
            key: 'actions',
            label: m.common.actions,
            render: (r: any) => (
              <div className="a-actions">
                {can(['verifier']) && (
                  <Button
                    size="sm"
                    variant="quiet"
                    icon={<FileText size={16} aria-hidden />}
                    loading={loading === r.id}
                    onClick={async () => {
                      setLoading(r.id);
                      try {
                        setView(await api(`/documents/${r.id}`));
                      } finally {
                        setLoading(null);
                      }
                    }}
                  >
                    {m.tech.viewDoc}
                  </Button>
                )}
                {r.status === 'pending' && can(['verifier', 'support']) && (
                  <>
                    <Act label={m.tech.approveDoc} run={act('approve_document', r.id)} onDone={onDone} variant="primary" />
                    <Act label={m.tech.rejectDoc} run={act('reject_document', r.id)} onDone={onDone} />
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
      <Modal open={Boolean(view)} onClose={() => setView(null)} title={view ? label(DOCUMENT_TYPES, view.type, locale) : ''} wide>
        {view ? <img src={view.url} alt={label(DOCUMENT_TYPES, view.type, locale)} style={{ inlineSize: '100%', borderRadius: 12 }} referrerPolicy="no-referrer" /> : <Spinner />}
      </Modal>
    </Card>
  );
}

function AddStrike({ id, onDone }: { id: string; onDone: () => void }) {
  const { m, locale } = useAdmin();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState(STRIKE_REASONS[0]!.id);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {m.tech.act.add_strike}
      </Button>
      <FormModal open={open} onClose={() => setOpen(false)} title={m.tech.act.add_strike} submitLabel={m.tech.act.add_strike} onSubmit={async () => (await post(`/technicians/${id}/action`, { action: 'add_strike', value: kind, reason }), onDone())}>
        <Select label={m.tech.strikeReason} value={kind} onChange={(e) => setKind(e.target.value)} options={STRIKE_REASONS.map((r) => ({ value: r.id, label: r[locale] }))} />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </>
  );
}

function MessageTech({ id }: { id: string }) {
  const { m } = useAdmin();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {m.tech.act.message}
      </Button>
      <FormModal open={open} onClose={() => setOpen(false)} title={m.tech.act.message} submitLabel={m.tech.act.message} onSubmit={async () => void (await post(`/technicians/${id}/action`, { action: 'message', value: text, reason }))}>
        <TextArea label={m.tech.messageText} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </>
  );
}

function Commission({ id, current, onDone }: { id: string; current: number | null; onDone: () => void }) {
  const { m } = useAdmin();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(current == null ? '' : formatPercent(current).replace('%', ''));
  const [reason, setReason] = useState('');
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {m.tech.act.commission}
      </Button>
      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title={m.tech.act.commission}
        submitLabel={m.common.save}
        onSubmit={async () => {
          const bps = v.trim() === '' ? null : parsePercent(v);
          if (v.trim() !== '' && bps == null) throw new ApiError(400, 'invalid_value');
          await post(`/technicians/${id}/action`, { action: 'commission', value: bps, reason });
          onDone();
        }}
      >
        <TextField label={m.tech.commissionValue} value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" dir="ltr" />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </>
  );
}
