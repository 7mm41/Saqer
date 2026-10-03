import { useMemo, useState } from 'react';
import { Download, FileWarning, Send } from 'lucide-react';
import { Banner, Button, Card, Checkbox, DataTable, Modal, Select, TextArea, TextField, useToast } from '@katf/ui';
import { api, FormModal, Loaded, PageHead, Pill, post, ReasonField, useLoad } from '../components';
import { useAdmin } from '../App';
import { download, errorText } from '../lib/api';
import { date, dateTime } from '../lib/fmt';

// ---------------------------------------------------------------- legal documents and consents (§9.2 #13, §11)
export function Legal() {
  const { m, locale, can } = useAdmin();
  const s = useLoad(() => api('/legal'));
  const [publish, setPublish] = useState<{ type: string; language: 'ar' | 'en' } | null>(null);
  const [view, setView] = useState<any>(null);
  return (
    <>
      <PageHead title={m.legal.title} onRefresh={s.reload} actions={can([]) && <Button size="sm" variant="primary" onClick={() => setPublish({ type: 'technician_agreement', language: 'ar' })}>{m.legal.publish}</Button>} />
      <Loaded state={s}>
        {(d: any) => {
          const title = (type: string) => d.titles[type]?.[locale] ?? type;
          return (
            <>
              {d.outOfDate.length > 0 && (
                <Banner tone="warning" icon={<FileWarning size={18} aria-hidden />} title={m.legal.outOfDate}>
                  {d.outOfDate.map((o: any) => title(o.type ?? o)).join('، ')}
                </Banner>
              )}
              <Card>
                <DataTable
                  rows={d.documents}
                  rowKey={(r: any) => r.id}
                  onRow={(r: any) => setView(r)}
                  columns={[
                    { key: 'type', label: m.legal.type, render: (r: any) => <strong>{title(r.type)}</strong> },
                    { key: 'language', label: m.legal.language, render: (r: any) => r.language.toUpperCase() },
                    { key: 'version', label: m.legal.version, render: (r: any) => <span className="k-num">{r.version}</span> },
                    { key: 'status', label: m.common.status, render: (r: any) => <Pill status={r.status === 'published' ? 'active' : r.status === 'superseded' ? 'expired' : 'pending'} label={(m.legal.statuses as Record<string, string>)[r.status] ?? r.status} /> },
                    { key: 'draft', label: m.legal.lawyer, render: (r: any) => (r.isDraft ? <Pill status="pending" label={m.legal.draft} /> : <Pill status="active" label={m.legal.approved} />) },
                    { key: 'effectiveAt', label: m.legal.effective, render: (r: any) => date(r.effectiveAt ?? r.publishedAt, locale) },
                  ]}
                />
              </Card>
              <Card title={m.legal.variables}>
                <div className="k-chips">
                  {d.variables.map((v: string) => (
                    <code key={v} className="k-chip k-ltr">{`{{${v}}}`}</code>
                  ))}
                </div>
              </Card>
              <Consents titles={d.titles} />
              <Modal open={Boolean(view)} onClose={() => setView(null)} title={view ? `${title(view.type)} · v${view.version}` : ''} wide>
                {view && (
                  <div className="k-stack">
                    {view.isDraft && <Banner tone="warning" title={m.legal.draft} />}
                    {view.changeSummary && <Banner title={m.legal.changeSummary}>{view.changeSummary}</Banner>}
                    <div className="k-legal-text" dir={view.language === 'ar' ? 'rtl' : 'ltr'}>
                      {view.renderedBody ?? view.body}
                    </div>
                    {can([]) && (
                      <Button variant="primary" onClick={() => (setPublish({ type: view.type, language: view.language }), setView(null))}>
                        {m.legal.publish}
                      </Button>
                    )}
                  </div>
                )}
              </Modal>
              {publish && <Publish d={d} initial={publish} onClose={() => setPublish(null)} onDone={s.reload} />}
            </>
          );
        }}
      </Loaded>
    </>
  );
}

function Publish({ d, initial, onClose, onDone }: { d: any; initial: { type: string; language: 'ar' | 'en' }; onClose: () => void; onDone: () => void }) {
  const { m, locale } = useAdmin();
  const latest = (type: string, language: string) => d.documents.find((x: any) => x.type === type && x.language === language && x.status === 'published') ?? d.documents.find((x: any) => x.type === type && x.language === language);
  const [type, setType] = useState(initial.type);
  const [language, setLanguage] = useState<'ar' | 'en'>(initial.language);
  const base = latest(type, language);
  const [title, setTitle] = useState(base?.title ?? d.titles[type]?.[language] ?? '');
  const [body, setBody] = useState(base?.body ?? '');
  const [summary, setSummary] = useState('');
  const [reaccept, setReaccept] = useState(true);
  const [lawyer, setLawyer] = useState(false);
  const [effective, setEffective] = useState('');
  const [reason, setReason] = useState('');
  const pick = (t: string, l: 'ar' | 'en') => {
    setType(t);
    setLanguage(l);
    const b = latest(t, l);
    setTitle(b?.title ?? d.titles[t]?.[l] ?? '');
    setBody(b?.body ?? '');
  };
  return (
    <FormModal
      open
      onClose={onClose}
      title={m.legal.publish}
      submitLabel={m.legal.publish}
      money={m.common.reviewTwice}
      onSubmit={async () => {
        await post('/legal/publish', { type, language, title, body, changeSummary: summary, requiresReacceptance: reaccept, lawyerApproved: lawyer, ...(effective ? { effectiveAt: new Date(`${effective}T00:00:00+04:00`).toISOString() } : {}), reason, confirm: true });
        onDone();
      }}
    >
      <div className="k-grid" style={{ '--min': '200px' } as React.CSSProperties}>
        <Select label={m.legal.type} value={type} onChange={(e) => pick(e.target.value, language)} options={d.types.map((t: string) => ({ value: t, label: d.titles[t]?.[locale] ?? t }))} />
        <Select label={m.legal.language} value={language} onChange={(e) => pick(type, e.target.value as 'ar' | 'en')} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} />
        <TextField label={m.legal.effective} type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
      </div>
      <TextField label={m.legal.titleField} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} dir={language === 'ar' ? 'rtl' : 'ltr'} />
      <TextArea label={m.legal.body} value={body} onChange={(e) => setBody(e.target.value)} rows={14} dir={language === 'ar' ? 'rtl' : 'ltr'} />
      <TextArea label={m.legal.changeSummary} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
      <Checkbox checked={reaccept} onChange={setReaccept}>
        {m.legal.reaccept}
      </Checkbox>
      <Banner tone="warning" title={m.legal.lawyerWarn} />
      <Checkbox checked={lawyer} onChange={setLawyer}>
        {m.legal.lawyerApproved}
      </Checkbox>
      <ReasonField value={reason} onChange={setReason} />
    </FormModal>
  );
}

function Consents({ titles }: { titles: Record<string, { ar: string; en: string }> }) {
  const { m, locale, can } = useAdmin();
  const [docType, setDocType] = useState('');
  const q = useMemo(() => new URLSearchParams(docType ? { docType } : {}).toString(), [docType]);
  const s = useLoad(() => (can(['support', 'verifier']) ? api<any[]>(`/consents?${q}`) : Promise.resolve([])), [q]);
  if (!can(['support', 'verifier'])) return null;
  return (
    <Card title={m.legal.consents} actions={<Button size="sm" icon={<Download size={14} aria-hidden />} onClick={() => download(`/consents?${q}${q ? '&' : ''}format=csv`, 'consents.csv')}>{m.legal.consentsCsv}</Button>}>
      <div className="a-toolbar" style={{ marginBlockEnd: 12 }}>
        <Select label={m.legal.type} value={docType} onChange={(e) => setDocType(e.target.value)} options={[{ value: '', label: m.common.all }, ...Object.keys(titles).map((t) => ({ value: t, label: titles[t]![locale] }))]} />
      </div>
      <Loaded state={s}>
        {(rows) => (
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: 'docType', label: m.legal.type, render: (r) => titles[r.docType]?.[locale] ?? r.docType },
              { key: 'version', label: m.legal.version, render: (r) => <span className="k-num">{r.version}</span> },
              { key: 'context', label: m.payments.kind },
              { key: 'acceptedAt', label: m.legal.accepted, render: (r) => dateTime(r.acceptedAt, locale) },
              { key: 'withdrawnAt', label: m.legal.withdrawn, render: (r) => (r.withdrawnAt ? dateTime(r.withdrawnAt, locale) : '—') },
              { key: 'textSha256', label: 'SHA-256', render: (r) => <code className="k-ltr k-xs">{r.textSha256.slice(0, 12)}…</code> },
            ]}
          />
        )}
      </Loaded>
    </Card>
  );
}

// ---------------------------------------------------------------- messaging (§9.2 #14)
export function Messaging() {
  const { m, t, locale, f, can } = useAdmin();
  const toast = useToast();
  const s = useLoad(() => api('/templates'));
  const [edit, setEdit] = useState<any>(null);
  const [seg, setSeg] = useState<'all_technicians' | 'technicians_wilayat' | 'customers_open'>('all_technicians');
  const [wilayat, setWilayat] = useState('seeb');
  const [bAr, setBAr] = useState('');
  const [bEn, setBEn] = useState('');
  const [reason, setReason] = useState('');
  const [bcast, setBcast] = useState(false);
  return (
    <>
      <PageHead title={m.messaging.title} sub={m.messaging.noPrivate} onRefresh={s.reload} />
      <Loaded state={s}>
        {(d: any) => (
          <>
            <Card title={m.messaging.templates}>
              <DataTable
                rows={d.templates}
                rowKey={(r: any) => r.key}
                onRow={can([]) ? (r: any) => setEdit(r) : undefined}
                columns={[
                  { key: 'key', label: 'key', render: (r: any) => <code className="k-ltr k-xs">{r.key}</code> },
                  { key: 'bodyAr', label: m.messaging.bodyAr, render: (r: any) => <span className="k-small">{r.bodyAr}</span> },
                  { key: 'bodyEn', label: m.messaging.bodyEn, render: (r: any) => <span className="k-small" dir="ltr">{r.bodyEn}</span> },
                  {
                    key: 'test',
                    label: m.common.actions,
                    render: (r: any) => (
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await post(`/templates/${r.key}/test`);
                            toast(m.common.done, 'success');
                          } catch (er) {
                            toast(errorText(t, er), 'danger');
                          }
                        }}
                      >
                        {m.messaging.test}
                      </Button>
                    ),
                  },
                ]}
              />
            </Card>
            <Card title={m.messaging.broadcast}>
              <div className="k-stack">
                <div className="k-grid" style={{ '--min': '200px' } as React.CSSProperties}>
                  <Select label={m.messaging.segment} value={seg} onChange={(e) => setSeg(e.target.value as typeof seg)} options={Object.entries(m.messaging.segments).map(([value, l]) => ({ value, label: l as string }))} />
                  {seg === 'technicians_wilayat' && <TextField label={m.messaging.wilayat} value={wilayat} onChange={(e) => setWilayat(e.target.value)} dir="ltr" />}
                </div>
                <TextArea label={m.messaging.bodyAr} value={bAr} onChange={(e) => setBAr(e.target.value)} maxLength={300} counter />
                <TextArea label={m.messaging.bodyEn} value={bEn} onChange={(e) => setBEn(e.target.value)} maxLength={300} dir="ltr" counter />
                <Button variant="primary" icon={<Send size={16} aria-hidden />} disabled={bAr.trim().length < 2} onClick={() => setBcast(true)} style={{ alignSelf: 'flex-start' }}>
                  {m.messaging.broadcast}
                </Button>
              </div>
              <FormModal
                open={bcast}
                onClose={() => setBcast(false)}
                title={m.messaging.broadcast}
                submitLabel={m.messaging.broadcast}
                money={m.common.reviewTwice}
                onSubmit={async () => {
                  const r = await post('/broadcasts', { segment: seg, ...(seg === 'technicians_wilayat' ? { wilayat } : {}), bodyAr: bAr, bodyEn: bEn, reason, confirm: true });
                  toast(f(m.messaging.recipients, { n: r.sent ?? r.sentCount ?? 0 }), 'success');
                  setBAr('');
                  setBEn('');
                  s.reload();
                }}
              >
                <p className="k-small">{bAr}</p>
                <ReasonField value={reason} onChange={setReason} />
              </FormModal>
            </Card>
            <Card title={m.messaging.history}>
              <DataTable
                rows={d.broadcasts}
                rowKey={(r: any) => r.id}
                columns={[
                  { key: 'createdAt', label: m.common.date, render: (r: any) => dateTime(r.createdAt, locale) },
                  { key: 'segment', label: m.messaging.segment, render: (r: any) => (m.messaging.segments as Record<string, string>)[r.segment] ?? r.segment },
                  { key: 'bodyAr', label: m.messaging.bodyAr, render: (r: any) => <span className="k-small">{r.bodyAr}</span> },
                  { key: 'sentCount', label: m.messaging.recipients.replace('{n} ', ''), render: (r: any) => <span className="k-num">{r.sentCount}</span> },
                ]}
              />
            </Card>
            {edit && <TemplateEdit tpl={edit} onClose={() => setEdit(null)} onDone={s.reload} />}
          </>
        )}
      </Loaded>
    </>
  );
}

function TemplateEdit({ tpl, onClose, onDone }: { tpl: any; onClose: () => void; onDone: () => void }) {
  const { m } = useAdmin();
  const [ar, setAr] = useState(tpl.bodyAr);
  const [en, setEn] = useState(tpl.bodyEn);
  const [reason, setReason] = useState('');
  return (
    <FormModal open onClose={onClose} title={tpl.key} submitLabel={m.common.save} onSubmit={async () => (await api(`/templates/${tpl.key}`, { method: 'PATCH', json: { bodyAr: ar, bodyEn: en, reason } }), onDone())}>
      <Banner tone="warning" title={m.messaging.noPrivate} />
      <TextArea label={m.messaging.bodyAr} value={ar} onChange={(e) => setAr(e.target.value)} maxLength={500} counter />
      <TextArea label={m.messaging.bodyEn} value={en} onChange={(e) => setEn(e.target.value)} maxLength={500} dir="ltr" counter />
      <ReasonField value={reason} onChange={setReason} />
    </FormModal>
  );
}
