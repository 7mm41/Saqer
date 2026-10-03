import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, CalendarDays, Star, FileText, LogOut, Trash2, Languages, Fingerprint, LifeBuoy, ShieldCheck, Pencil, ChevronLeft, ChevronRight, QrCode, UserRound } from 'lucide-react';
import { formatDateShort, label, TECH_SERVICES, AC_TYPES, EXPERIENCE_BANDS, DOCUMENT_TYPES, STRIKE_REASONS } from '@katf/shared';
import { Banner, BottomSheet, Button, Card, ChipGroup, Modal, PhotoUploader, Rating, SkeletonCard, StatusPill, TextArea, TextField, VerifiedBadge, useT, useToast, type UploadedPhoto } from '@katf/ui';
import { api, errorText, signOut, uploadFile } from '../lib/api';
import { biometricAvailable, registerPush, secureGet, secureSet } from '../lib/native';
import { useApp } from '../App';
import { CoverageForm } from './Register';

const up = (purpose: string) => (file: File, p: (n: number) => void) => uploadFile(file, purpose, p);

export function Account() {
  const { m, locale, setLocale, reload, config, f } = useApp();
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const [p, setP] = useState<any>(null);
  const [push, setPush] = useState<string>('');
  const [bio, setBio] = useState<boolean | null>(null);
  const [bioOn, setBioOn] = useState(false);
  const [del, setDel] = useState(false);
  const [appeal, setAppeal] = useState<string | null>(null);
  const [ticket, setTicket] = useState(false);
  const load = async () => setP(await api('/api/tech/profile'));
  useEffect(() => {
    void load();
    void biometricAvailable().then(setBio);
    void secureGet('biometric').then((v) => setBioOn(v === 'on'));
  }, []);
  if (!p) return <SkeletonCard lines={5} />;
  const Chevron = locale === 'ar' ? ChevronLeft : ChevronRight;
  const row = (to: string, icon: React.ReactNode, text: string) => (
    <Link to={to} className="k-list-row">
      {icon}
      <span className="k-grow">{text}</span>
      <Chevron size={18} aria-hidden />
    </Link>
  );
  return (
    <div className="k-stack" style={{ gap: 14 }}>
      <h1 style={{ fontSize: '1.5rem' }}>{m.account.title}</h1>
      <Card title={m.account.preview} float>
        <div className="k-row" style={{ alignItems: 'flex-start' }}>
          {p.photoUrl ? (
            <img className="k-avatar k-avatar-lg" src={p.photoUrl} alt="" />
          ) : (
            <div className="k-avatar k-avatar-lg" style={{ display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
              <UserRound size={40} aria-hidden />
            </div>
          )}
          <div className="k-stack k-grow" style={{ gap: 4 }}>
            <strong style={{ fontSize: '1.2rem' }}>{p.publicName}</strong>
            <VerifiedBadge label={m.account.verified} />
            <span className="k-small k-muted">
              {p.rating ? `★ ${p.rating.toFixed(1)} (${p.ratingCount}) · ` : ''}
              {p.experienceBand ? label(EXPERIENCE_BANDS, p.experienceBand, locale) : ''}
            </span>
          </div>
        </div>
        {p.bio && <p className="k-small" style={{ marginTop: 10 }}>{p.bio}</p>}
        <div className="k-chips" style={{ marginTop: 10 }}>
          {p.services.map((s: string) => (
            <span key={s} className="k-chip" style={{ cursor: 'default' }}>{label(TECH_SERVICES, s, locale)}</span>
          ))}
        </div>
        {p.pendingEdits.length > 0 && <Banner tone="warning" title={m.account.pending} />}
        <Link to="/account/profile" className="k-btn k-btn-secondary" style={{ marginTop: 12 }}>
          <Pencil size={18} aria-hidden /> {m.account.edit}
        </Link>
      </Card>

      <Card>
        <div className="k-list">
          {row('/link', <QrCode size={20} aria-hidden />, m.link.title)}
          {row('/account/schedule', <CalendarDays size={20} aria-hidden />, m.account.schedule)}
          {row('/account/reviews', <Star size={20} aria-hidden />, m.account.reviews)}
          {row('/account/documents', <FileText size={20} aria-hidden />, m.account.documents)}
        </div>
      </Card>

      <Card title={m.account.standing} icon={<ShieldCheck size={20} aria-hidden />}>
        {p.strikes.length === 0 ? (
          <p>{m.home.standingGood}</p>
        ) : (
          <div className="k-list">
            {p.strikes.map((s: any) => (
              <div key={s.id} className="k-list-row">
                <span className="k-grow">
                  {label(STRIKE_REASONS, s.reasonCode, locale)} <span className="k-xs k-muted">· {formatDateShort(Date.parse(s.expiresAt), locale)}</span>
                </span>
                {s.appealStatus ? <StatusPill label={s.appealStatus} tone="muted" /> : <Button size="sm" variant="secondary" onClick={() => setAppeal(s.id)}>{m.account.appeal}</Button>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="k-stack">
          <Button
            variant="secondary"
            icon={<Bell size={18} aria-hidden />}
            onClick={async () => {
              const r = await registerPush((s) => api('/api/push/subscribe', { method: 'POST', json: s }).then(() => {}), config.vapidPublicKey).catch(() => 'unsupported' as const);
              setPush(r);
              if (r === 'on') toast(m.account.pushOn, 'success');
            }}
          >
            {push === 'on' ? m.account.pushOn : m.account.enablePush}
          </Button>
          {bio && (
            <label className="k-check">
              <input
                type="checkbox"
                checked={bioOn}
                onChange={async (e) => {
                  setBioOn(e.target.checked);
                  await secureSet('biometric', e.target.checked ? 'on' : null);
                }}
              />
              <span className="k-row" style={{ gap: 6 }}>
                <Fingerprint size={18} aria-hidden /> {m.account.biometric}
              </span>
            </label>
          )}
          <Button variant="secondary" icon={<Languages size={18} aria-hidden />} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
            {m.account.language}: {locale === 'ar' ? 'العربية' : 'English'}
          </Button>
        </div>
      </Card>

      <Card title={m.account.help} icon={<LifeBuoy size={20} aria-hidden />}>
        <p className="k-small">{config.settings.whatsapp_number ? f(m.account.helpBody, { wa: String(config.settings.whatsapp_number) }) : m.account.helpNoWa}</p>
        <Button variant="secondary" onClick={() => setTicket(true)} style={{ marginTop: 10 }}>
          {m.account.newTicket}
        </Button>
        <div className="k-chips" style={{ marginTop: 10 }}>
          {(['technician-agreement', 'conduct', 'cancellation', 'privacy'] as const).map((pth) => (
            <a key={pth} className="k-chip" href={`${config.publicOrigin ?? ''}/${pth}`} target="_blank" rel="noreferrer">
              {m.account.docs[pth]}
            </a>
          ))}
        </div>
      </Card>

      <Button variant="secondary" icon={<LogOut size={18} aria-hidden />} onClick={async () => (await signOut(), await reload(), nav('/'))}>
        {m.account.logout}
      </Button>
      <Button variant="danger" icon={<Trash2 size={18} aria-hidden />} onClick={() => setDel(true)}>
        {m.account.delete}
      </Button>

      <Modal
        open={del}
        onClose={() => setDel(false)}
        title={m.account.delete}
        footer={
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await api('/api/tech/account', { method: 'DELETE' });
                await signOut();
                await reload();
              } catch (e) {
                toast(errorText(t, e), 'danger');
              }
            }}
          >
            {m.account.deleteConfirm}
          </Button>
        }
      >
        <p>{m.account.deleteBody}</p>
      </Modal>
      <TextSheet open={Boolean(appeal)} title={m.account.appeal} label={m.account.appealText} onClose={() => setAppeal(null)} onSubmit={async (text) => { try { await api(`/api/tech/strikes/${appeal}/appeal`, { method: 'POST', json: { text } }); setAppeal(null); void load(); } catch (e) { toast(errorText(t, e), 'danger'); } }} />
      <TextSheet open={ticket} title={m.account.newTicket} label={m.job.notes} onClose={() => setTicket(false)} onSubmit={async (text) => { await api('/api/support/tickets', { method: 'POST', json: { subject: m.account.help, body: text } }).catch(() => {}); setTicket(false); toast(m.account.saved, 'success'); }} />
    </div>
  );
}

function TextSheet({ open, title, label: lbl, onClose, onSubmit }: { open: boolean; title: string; label: string; onClose: () => void; onSubmit: (t: string) => void }) {
  const [text, setText] = useState('');
  const t = useT();
  return (
    <BottomSheet open={open} onClose={onClose} label={title}>
      <div className="k-stack">
        <h3>{title}</h3>
        <TextArea label={lbl} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={4} />
        <Button variant="primary" disabled={text.trim().length < 5} onClick={() => onSubmit(text)}>
          {t('actions.send')}
        </Button>
      </div>
    </BottomSheet>
  );
}

export function EditProfile() {
  const { m, locale } = useApp();
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const [p, setP] = useState<any>(null);
  const [services, setServices] = useState<string[]>([]);
  const [acTypes, setAcTypes] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [photo, setPhoto] = useState<UploadedPhoto[]>([]);
  const [work, setWork] = useState<UploadedPhoto[]>([]);
  useEffect(() => {
    void api<any>('/api/tech/profile').then((x) => {
      setP(x);
      setServices(x.services);
      setAcTypes(x.acTypes);
      setBio(x.bio ?? '');
      setWork(x.workPhotos);
    });
  }, []);
  if (!p) return <SkeletonCard />;
  return (
    <Card title={m.account.edit}>
      <div className="k-stack" style={{ gap: 16 }}>
        <Banner title={m.account.editNote} />
        <PhotoUploader label={m.wizard.photo} value={photo} onChange={setPhoto} max={1} upload={up('profile_photo')} />
        <TextArea label={m.wizard.bio} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} counter />
        <PhotoUploader label={m.wizard.workPhotos} value={work} onChange={setWork} max={10} upload={up('work_sample')} />
        <ChipGroup legend={m.wizard.services} values={services} onChange={setServices} options={TECH_SERVICES.map((s) => ({ value: s.id, label: s[locale] }))} />
        <ChipGroup legend={m.wizard.acTypes} values={acTypes} onChange={setAcTypes} options={AC_TYPES.filter((a) => a.id !== 'unknown').map((s) => ({ value: s.id, label: s[locale] }))} />
        <Button
          variant="primary"
          onClick={async () => {
            try {
              await api('/api/tech/profile', { method: 'PATCH', json: { services, acTypes, bio, workPhotoIds: work.map((w) => w.id), ...(photo[0] ? { photoFileId: photo[0].id } : {}) } });
              toast(m.account.saved, 'success');
              nav('/account');
            } catch (e) {
              toast(errorText(t, e), 'danger');
            }
          }}
        >
          {t('actions.save')}
        </Button>
      </div>
    </Card>
  );
}

export function Schedule() {
  const { m } = useApp();
  const t = useT();
  const toast = useToast();
  const [p, setP] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api('/api/tech/profile').then(setP);
  }, []);
  if (!p) return <SkeletonCard />;
  return (
    <Card title={m.account.schedule}>
      <CoverageForm
        initial={{ areas: p.areas, workingDays: p.workingDays, workingHours: p.workingHours, maxJobsPerDay: p.maxJobsPerDay, vacationUntil: p.vacationUntil ?? '' }}
        busy={busy}
        submitLabel={t('actions.save')}
        onSave={async (d) => {
          setBusy(true);
          try {
            await api('/api/tech/profile', { method: 'PATCH', json: { areas: d.areas, workingDays: d.workingDays, workingHours: d.workingHours, maxJobsPerDay: d.maxJobsPerDay, vacationUntil: d.vacationUntil } });
            toast(m.account.saved, 'success');
          } catch (e) {
            toast(errorText(t, e), 'danger');
          } finally {
            setBusy(false);
          }
        }}
      />
    </Card>
  );
}

export function Reviews() {
  const { m, locale } = useApp();
  const [r, setR] = useState<any>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const load = () => api('/api/tech/reviews').then(setR);
  useEffect(() => {
    void load();
  }, []);
  if (!r) return <SkeletonCard />;
  const total = r.distribution.reduce((s: number, n: number) => s + n, 0) || 1;
  return (
    <div className="k-stack" style={{ gap: 14 }}>
      <Card title={m.account.reviews}>
        {[5, 4, 3, 2, 1].map((n) => (
          <div key={n} className="k-row" style={{ gap: 8 }}>
            <span className="k-num" style={{ width: 16 }}>{n}</span>
            <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--line)' }}>
              <div style={{ width: `${(r.distribution[n - 1] / total) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--accent)' }} />
            </div>
            <span className="k-num k-small">{r.distribution[n - 1]}</span>
          </div>
        ))}
      </Card>
      {r.reviews.map((x: any) => (
        <Card key={x.id}>
          <Rating value={x.rating} size={22} />
          {x.comment && <p>{x.comment}</p>}
          <span className="k-xs k-muted">{formatDateShort(Date.parse(x.at), locale)}</span>
          {x.reply ? (
            <p className="k-small k-muted">↳ {x.reply}</p>
          ) : (
            <div className="k-row" style={{ marginTop: 8 }}>
              <input className="k-input k-grow" placeholder={m.account.reply} value={reply[x.id] ?? ''} onChange={(e) => setReply({ ...reply, [x.id]: e.target.value })} maxLength={500} aria-label={m.account.reply} />
              <Button size="sm" variant="secondary" disabled={!reply[x.id]} onClick={async () => (await api(`/api/tech/reviews/${x.id}/reply`, { method: 'POST', json: { reply: reply[x.id] } }), load())}>
                ➤
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export function Documents() {
  const { m, locale, f } = useApp();
  const t = useT();
  const toast = useToast();
  const [p, setP] = useState<any>(null);
  const [renew, setRenew] = useState<string | null>(null);
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState<UploadedPhoto[]>([]);
  const load = () => api('/api/tech/profile').then(setP);
  useEffect(() => {
    void load();
  }, []);
  if (!p) return <SkeletonCard />;
  return (
    <div className="k-stack" style={{ gap: 14 }}>
      <Card title={m.account.documents}>
        <div className="k-list">
          {p.documents.map((d: any) => (
            <div key={d.id} className="k-list-row">
              <span className="k-grow">
                {label(DOCUMENT_TYPES, d.type, locale)}
                {d.expiresAt && <span className="k-xs k-muted"> · {f(m.account.expires, { date: formatDateShort(Date.parse(d.expiresAt), locale) })}</span>}
              </span>
              <StatusPill label={d.status} tone={d.status === 'approved' ? 'success' : d.status === 'expired' ? 'danger' : 'warning'} />
              {d.expiresAt && (
                <Button size="sm" variant="quiet" onClick={() => (setRenew(d.type), setFile([]), setExpiry(''))}>
                  {m.account.renew}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
      <BottomSheet open={Boolean(renew)} onClose={() => setRenew(null)} label={m.account.renew}>
        <div className="k-stack">
          <h3>{renew ? label(DOCUMENT_TYPES, renew, locale) : ''}</h3>
          <TextField label={m.wizard.expiry} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <PhotoUploader value={file} onChange={setFile} max={1} upload={up('document')} />
          <Button
            variant="primary"
            disabled={!file[0] || !expiry}
            onClick={async () => {
              try {
                await api('/api/tech/application/documents', { method: 'POST', json: { type: renew, fileId: file[0]!.id, expiresAt: expiry } });
                setRenew(null);
                void load();
              } catch (e) {
                toast(errorText(t, e), 'danger');
              }
            }}
          >
            {t('actions.upload')}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
