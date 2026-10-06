import { useState } from 'react';
import { History, Lock, Plus, Scale, ShieldAlert } from 'lucide-react';
import { formatOMR, formatPercent, parseOMR, parsePercent, renderSettingValue } from '@katf/shared';
import { Banner, Button, Card, Checkbox, DataTable, Money, Select, Tabs, TextArea, TextField } from '@katf/ui';
import { Act, api, FormModal, Loaded, PageHead, Pill, post, ReasonField, useLoad } from '../components';
import { useAdmin, type Role } from '../App';
import { ApiError } from '../lib/api';
import { dateTime } from '../lib/fmt';

type Group = 'money' | 'timing' | 'technicians' | 'security' | 'content' | 'branding' | 'flags';
const GROUPS: Group[] = ['money', 'timing', 'technicians', 'security', 'content', 'branding', 'flags'];

// ---------------------------------------------------------------- settings (§9.2 #17)
export function Settings() {
  const { m, locale, can } = useAdmin();
  const s = useLoad(() => api<any[]>('/settings'));
  const [group, setGroup] = useState<Group>('money');
  const [edit, setEdit] = useState<any>(null);
  const [hist, setHist] = useState<string | null>(null);
  const owner = can([]);
  const show = (d: any, v: unknown) =>
    d.type === 'json' ? <code className="k-ltr k-xs">{JSON.stringify(v)}</code> : d.type === 'bool' ? (v ? m.common.yes : m.common.no) : d.type === 'baisa' ? <Money baisa={v as number} /> : d.type === 'bps' ? `${renderSettingValue(d.key, v)}%` : renderSettingValue(d.key, v);
  return (
    <>
      <PageHead title={m.settings.title} sub={m.settings.body} onRefresh={s.reload} />
      <Tabs value={group} onChange={setGroup} label={m.settings.title} tabs={GROUPS.map((g) => ({ value: g, label: m.settings.groups[g] }))} />
      {group === 'flags' && <Banner tone="danger" icon={<ShieldAlert size={18} aria-hidden />} title={m.settings.gateWarn} />}
      <Loaded state={s}>
        {(rows) => (
          <Card>
            <div className="k-list">
              {rows
                .filter((d) => d.group === group)
                .map((d) => {
                  const changed = JSON.stringify(d.value) !== JSON.stringify(d.defaultValue);
                  return (
                    <div key={d.key} className="k-list-row" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <span className="k-stack k-grow" style={{ gap: 2, minInlineSize: 220 }}>
                        <strong>{d[locale]}</strong>
                        <code className="k-ltr k-xs k-muted" style={{ alignSelf: 'flex-start' }}>
                          {d.key}
                        </code>
                        <span className="k-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          {d.ownerOnly && <span className="k-pill k-pill-muted"><Lock size={12} aria-hidden /> {m.settings.ownerOnly}</span>}
                          {d.legal && <span className="k-pill k-pill-accent"><Scale size={12} aria-hidden /> {m.settings.legalVar}</span>}
                        </span>
                      </span>
                      <span className="k-stack" style={{ gap: 2, alignItems: 'flex-end', minInlineSize: 140 }}>
                        <strong className="k-num" style={{ color: changed ? 'var(--accent-strong)' : undefined, overflowWrap: 'anywhere' }}>
                          {show(d, d.value)}
                        </strong>
                        {changed && (
                          <span className="k-xs k-muted">
                            {m.settings.default}: {show(d, d.defaultValue)}
                          </span>
                        )}
                        <span className="a-actions">
                          {d.history.length > 0 && (
                            <Button size="sm" variant="quiet" icon={<History size={14} aria-hidden />} onClick={() => setHist(hist === d.key ? null : d.key)}>
                              {m.settings.history}
                            </Button>
                          )}
                          {owner && (
                            <Button size="sm" onClick={() => setEdit(d)}>
                              {m.settings.change}
                            </Button>
                          )}
                        </span>
                      </span>
                      {hist === d.key && (
                        <div style={{ flexBasis: '100%' }}>
                          <DataTable
                            rows={d.history}
                            rowKey={(r: any) => String(r.id)}
                            columns={[
                              { key: 'createdAt', label: m.common.date, render: (r: any) => dateTime(r.createdAt, locale) },
                              { key: 'old', label: m.settings.oldValue, render: (r: any) => show(d, r.oldValue) },
                              { key: 'new', label: m.settings.newValue, render: (r: any) => show(d, r.newValue) },
                              { key: 'reason', label: m.common.reason },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </Card>
        )}
      </Loaded>
      {edit && <SettingEdit d={edit} onClose={() => setEdit(null)} onDone={s.reload} />}
    </>
  );
}

function SettingEdit({ d, onClose, onDone }: { d: any; onClose: () => void; onDone: () => void }) {
  const { m, locale } = useAdmin();
  const initial = d.type === 'baisa' ? formatOMR(d.value) : d.type === 'bps' ? formatPercent(d.value).replace('%', '') : d.type === 'json' ? JSON.stringify(d.value, null, 2) : d.type === 'bool' ? '' : String(d.value ?? '');
  const [text, setText] = useState(initial);
  const [bool, setBool] = useState(Boolean(d.value));
  const [reason, setReason] = useState('');
  const parse = (): unknown => {
    switch (d.type) {
      case 'bool':
        return bool;
      case 'baisa': {
        const v = parseOMR(text);
        if (v == null) throw new ApiError(400, 'invalid_amount');
        return v;
      }
      case 'bps': {
        const v = parsePercent(text);
        if (v == null) throw new ApiError(400, 'invalid_value');
        return v;
      }
      case 'text':
      case 'time':
      case 'enum':
        return text;
      case 'json':
        try {
          return JSON.parse(text);
        } catch {
          throw new ApiError(400, 'invalid_json');
        }
      default:
        if (!/^-?\d+$/.test(text.trim())) throw new ApiError(400, 'must_be_integer');
        return Number(text.trim());
    }
  };
  const risky = d.group === 'money' || d.group === 'flags' || d.legal;
  return (
    <FormModal
      open
      onClose={onClose}
      title={d[locale]}
      submitLabel={m.common.save}
      danger={d.key === 'legal_gate_cleared'}
      money={risky ? m.common.reviewTwice : undefined}
      onSubmit={async () => {
        await api(`/settings/${d.key}`, { method: 'PUT', json: { value: parse(), reason, confirm: true } });
        onDone();
      }}
    >
      <code className="k-ltr k-xs k-muted">{d.key}</code>
      {d.key === 'legal_gate_cleared' && <Banner tone="danger" title={m.settings.gateWarn} />}
      {d.type === 'bool' ? (
        <Checkbox checked={bool} onChange={setBool}>
          {d[locale]}
        </Checkbox>
      ) : d.type === 'enum' ? (
        <Select label={m.settings.newValue} value={text} onChange={(e) => setText(e.target.value)} options={(d.options ?? []).map((o: string) => ({ value: o, label: o }))} />
      ) : d.type === 'json' ? (
        <TextArea label={`${m.settings.newValue} (${m.settings.jsonHint})`} value={text} onChange={(e) => setText(e.target.value)} rows={8} dir="ltr" />
      ) : d.type === 'text' ? (
        <TextArea label={m.settings.newValue} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
      ) : (
        <TextField
          label={`${m.settings.newValue}${d.type === 'baisa' ? ' (OMR)' : d.type === 'bps' ? ' (%)' : ''}`}
          hint={d.min != null || d.max != null ? `${d.type === 'baisa' ? formatOMR(d.min ?? 0) : d.type === 'bps' ? formatPercent(d.min ?? 0) : d.min ?? ''} – ${d.type === 'baisa' ? formatOMR(d.max ?? 0) : d.type === 'bps' ? formatPercent(d.max ?? 0) : d.max ?? ''}` : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode={d.type === 'time' ? 'text' : 'decimal'}
          dir="ltr"
        />
      )}
      <span className="k-small k-muted">
        {m.settings.default}: {d.type === 'json' ? JSON.stringify(d.defaultValue) : renderSettingValue(d.key, d.defaultValue)}
      </span>
      <ReasonField value={reason} onChange={setReason} />
    </FormModal>
  );
}

// ---------------------------------------------------------------- staff (owner)
export function Staff() {
  const { m, locale, me } = useAdmin();
  const s = useLoad(() => api<any[]>('/staff'));
  const [add, setAdd] = useState(false);
  const [pw, setPw] = useState<string | null>(null);
  return (
    <>
      <PageHead title={m.staff.title} onRefresh={s.reload} actions={<Button size="sm" variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setAdd(true)}>{m.staff.add}</Button>} />
      <Loaded state={s}>
        {(rows) => (
          <Card>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'name', label: m.common.name, render: (r) => <strong>{r.name}</strong> },
                { key: 'role', label: m.staff.role, render: (r) => m.roles[r.role as Role] },
                { key: 'active', label: m.common.status, render: (r) => (r.lockedUntil && Date.parse(r.lockedUntil) > Date.now() ? <Pill status="failed" label={m.staff.locked} /> : <Pill status={r.active ? 'active' : 'expired'} label={r.active ? m.staff.active : m.staff.disabled} />) },
                { key: 'totp', label: m.staff.totp, render: (r) => (r.totpEnabled ? '✓' : '—') },
                { key: 'lastSignInAt', label: m.staff.lastSignIn, render: (r) => <span className="k-small">{dateTime(r.lastSignInAt, locale)}{r.lastSignInDevice ? ` · ${r.lastSignInDevice.slice(0, 40)}` : ''}</span> },
                {
                  key: 'actions',
                  label: m.common.actions,
                  render: (r) =>
                    r.id === me.id ? null : (
                      <div className="a-actions">
                        {r.active ? <Act label={m.staff.disable} run={(reason) => post(`/staff/${r.id}`, { active: false, reason })} onDone={s.reload} danger /> : <Act label={m.staff.enable} run={(reason) => post(`/staff/${r.id}`, { active: true, reason })} onDone={s.reload} />}
                        <Act label={m.staff.resetTotp} run={(reason) => post(`/staff/${r.id}`, { resetTotp: true, reason })} onDone={s.reload} variant="quiet" />
                        <Button size="sm" variant="quiet" onClick={() => setPw(r.id)}>
                          {m.staff.setPassword}
                        </Button>
                      </div>
                    ),
                },
              ]}
            />
          </Card>
        )}
      </Loaded>
      {add && <AddStaff onClose={() => setAdd(false)} onDone={s.reload} />}
      {pw && <SetPassword id={pw} onClose={() => setPw(null)} onDone={s.reload} />}
    </>
  );
}

function AddStaff({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { m } = useAdmin();
  const [v, setV] = useState({ email: '', displayName: '', role: 'support', temporaryPassword: '' });
  const [reason, setReason] = useState('');
  return (
    <FormModal open onClose={onClose} title={m.staff.add} submitLabel={m.staff.add} onSubmit={async () => (await post('/staff', { ...v, reason }), onDone())}>
      <TextField label={m.staff.email} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} dir="ltr" autoComplete="off" />
      <TextField label={m.common.name} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
      <Select label={m.staff.role} value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} options={(['verifier', 'support', 'finance', 'owner'] as Role[]).map((r) => ({ value: r, label: m.roles[r] }))} />
      <TextField label={m.staff.tempPassword} type="password" value={v.temporaryPassword} onChange={(e) => setV({ ...v, temporaryPassword: e.target.value })} dir="ltr" autoComplete="new-password" minLength={12} />
      <ReasonField value={reason} onChange={setReason} />
    </FormModal>
  );
}

function SetPassword({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const { m } = useAdmin();
  const [pw, setPw] = useState('');
  const [reason, setReason] = useState('');
  return (
    <FormModal
      open
      onClose={onClose}
      title={m.staff.setPassword}
      submitLabel={m.common.save}
      onSubmit={async () => {
        if (pw.length < 12) throw new ApiError(400, 'password_too_short');
        await post(`/staff/${id}`, { newPassword: pw, reason });
        onDone();
      }}
    >
      <TextField label={m.staff.newPassword} type="password" value={pw} onChange={(e) => setPw(e.target.value)} dir="ltr" autoComplete="new-password" minLength={12} />
      <ReasonField value={reason} onChange={setReason} />
    </FormModal>
  );
}

// ---------------------------------------------------------------- security and audit (§9.2 #18)
export function Security() {
  const { m, locale, can, me } = useAdmin();
  const s = useLoad(() => api('/security'));
  const owner = can([]);
  const [tab, setTab] = useState<'sessions' | 'signins' | 'blocked' | 'audit' | 'waitlist'>('sessions');
  return (
    <>
      <PageHead title={m.security.title} onRefresh={s.reload} />
      <Tabs
        value={tab}
        onChange={setTab}
        label={m.security.title}
        tabs={[
          { value: 'sessions', label: m.security.sessions },
          { value: 'signins', label: m.security.signIns },
          ...(owner
            ? [
                { value: 'blocked' as const, label: m.security.blocked },
                { value: 'audit' as const, label: m.security.audit },
              ]
            : []),
          ...(can(['support']) ? [{ value: 'waitlist' as const, label: m.security.waitlist }] : []),
        ]}
      />
      {tab === 'audit' && owner ? (
        <Audit />
      ) : tab === 'waitlist' ? (
        <Waitlist />
      ) : (
        <Loaded state={s}>
          {(d: any) => (
            <>
              {tab === 'sessions' && (
                <Card>
                  <DataTable
                    rows={d.sessions}
                    rowKey={(r: any) => r.id}
                    columns={[
                      { key: 'device', label: m.security.device, render: (r: any) => <span className="k-small">{r.device ?? '—'}</span> },
                      { key: 'kind', label: m.payments.kind },
                      { key: 'lastUsedAt', label: m.security.lastUsed, render: (r: any) => dateTime(r.lastUsedAt, locale) },
                      { key: 'createdAt', label: m.common.date, render: (r: any) => dateTime(r.createdAt, locale) },
                      { key: 'end', label: m.common.actions, render: (r: any) => <Act label={m.security.end} run={(reason) => post(`/security/sessions/${r.id}/end`, { reason })} onDone={s.reload} variant="quiet" /> },
                    ]}
                  />
                </Card>
              )}
              {tab === 'signins' && (
                <Card>
                  <DataTable
                    rows={d.signIns}
                    rowKey={(r: any) => r.id}
                    csvName="sign-ins"
                    columns={[
                      { key: 'createdAt', label: m.common.date, render: (r: any) => dateTime(r.createdAt, locale), csv: (r: any) => r.createdAt },
                      { key: 'success', label: m.common.status, render: (r: any) => <Pill status={r.success ? 'active' : 'failed'} label={r.success ? m.security.success : m.security.failed} />, csv: (r: any) => (r.success ? 'ok' : 'failed') },
                      { key: 'reason', label: m.common.reason, render: (r: any) => <code className="k-ltr k-xs">{r.reason}</code> },
                      { key: 'device', label: m.security.device, render: (r: any) => <span className="k-xs">{r.device ?? '—'}</span> },
                      { key: 'self', label: m.security.you, render: (r: any) => (r.userId === me.id ? '✓' : '') },
                    ]}
                  />
                </Card>
              )}
              {tab === 'blocked' && owner && <Blocked rows={d.blocked} onDone={s.reload} />}
            </>
          )}
        </Loaded>
      )}
    </>
  );
}

function Blocked({ rows, onDone }: { rows: any[]; onDone: () => void }) {
  const { m, locale } = useAdmin();
  const [add, setAdd] = useState(false);
  const [kind, setKind] = useState('phone');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Card title={m.security.blocked} actions={<Button size="sm" variant="danger" onClick={() => setAdd(true)}>{m.security.addBlocked}</Button>}>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: 'kind', label: m.security.kind, render: (r) => (m.security.kinds as Record<string, string>)[r.kind] ?? r.kind },
          { key: 'reason', label: m.common.reason },
          { key: 'createdAt', label: m.common.date, render: (r) => dateTime(r.createdAt, locale) },
          { key: 'unblock', label: m.common.actions, render: (r) => <Act label={m.security.unblock} run={(rs) => api(`/blocked/${r.id}`, { method: 'DELETE', json: { reason: rs } })} onDone={onDone} variant="quiet" /> },
        ]}
      />
      <FormModal open={add} onClose={() => setAdd(false)} title={m.security.addBlocked} submitLabel={m.security.addBlocked} danger onSubmit={async () => (await post('/blocked', { kind, value, reason }), setValue(''), onDone())}>
        <Select label={m.security.kind} value={kind} onChange={(e) => setKind(e.target.value)} options={Object.entries(m.security.kinds).map(([v, l]) => ({ value: v, label: l as string }))} />
        <TextField label={m.security.value} value={value} onChange={(e) => setValue(e.target.value)} dir="ltr" autoComplete="off" />
        <ReasonField value={reason} onChange={setReason} />
      </FormModal>
    </Card>
  );
}

function Audit() {
  const { m, f, locale } = useAdmin();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const s = useLoad(() => api(`/audit?${new URLSearchParams({ page: String(page), ...(q ? { action: q } : {}) })}`), [page, q]);
  return (
    <Loaded state={s}>
      {(d: any) => (
        <>
          <Banner tone={d.chain.ok ? 'success' : 'danger'} title={d.chain.ok ? f(m.security.chainOk, { n: d.chain.checked }) : f(m.security.chainBroken, { n: d.chain.brokenAt })} />
          <Card>
            <form
              className="a-toolbar"
              style={{ marginBlockEnd: 12 }}
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setQ(action);
              }}
            >
              <TextField label={m.security.action} value={action} onChange={(e) => setAction(e.target.value)} dir="ltr" placeholder="technician." />
              <Button type="submit">{m.common.search}</Button>
            </form>
            <DataTable
              rows={d.rows}
              rowKey={(r: any) => String(r.id)}
              csvName="audit"
              columns={[
                { key: 'id', label: '#', render: (r: any) => <span className="k-num k-xs">{r.id}</span> },
                { key: 'createdAt', label: m.common.date, render: (r: any) => dateTime(r.createdAt, locale), csv: (r: any) => r.createdAt },
                { key: 'actor', label: m.security.actor, render: (r: any) => r.actorName ?? r.actorRole, csv: (r: any) => r.actorName ?? r.actorRole },
                { key: 'action', label: m.security.action, render: (r: any) => <code className="k-ltr k-xs">{r.action}</code>, csv: (r: any) => r.action },
                { key: 'entity', label: m.security.entity, render: (r: any) => <code className="k-ltr k-xs">{r.entity}{r.entityId ? `:${r.entityId.slice(0, 8)}` : ''}</code>, csv: (r: any) => `${r.entity}:${r.entityId ?? ''}` },
                { key: 'reason', label: m.common.reason, render: (r: any) => <span className="k-small">{r.reason ?? ''}</span> },
              ]}
            />
            <div style={{ marginBlockStart: 10 }}>
              <div className="k-row k-between k-small">
                <span className="k-muted">{f(m.common.total, { n: d.total })}</span>
                <div className="k-row" style={{ gap: 6 }}>
                  <Button size="sm" variant="quiet" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    {m.common.prev}
                  </Button>
                  <Button size="sm" variant="quiet" disabled={page * 100 >= d.total} onClick={() => setPage(page + 1)}>
                    {m.common.next}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </Loaded>
  );
}

function Waitlist() {
  const { m } = useAdmin();
  const s = useLoad(() => api<any[]>('/waitlist'));
  return (
    <Loaded state={s}>
      {(rows) => {
        const by = new Map<string, number>();
        for (const r of rows) by.set(r.wilayat, (by.get(r.wilayat) ?? 0) + 1);
        return (
          <Card title={m.security.waitlist}>
            <DataTable
              rows={[...by.entries()].map(([wilayat, n]) => ({ wilayat, n }))}
              rowKey={(r) => r.wilayat}
              csvName="waitlist"
              columns={[
                { key: 'wilayat', label: m.common.area },
                { key: 'n', label: m.areas.waitlist, render: (r) => <span className="k-num">{r.n}</span>, sort: (a, b) => a.n - b.n },
              ]}
            />
          </Card>
        );
      }}
    </Loaded>
  );
}
