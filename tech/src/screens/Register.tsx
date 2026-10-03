/** Technician registration wizard (§6): ten short steps, server-side draft, camera-first uploads. */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check, Save, FileText, ShieldCheck } from 'lucide-react';
import { TECH_SERVICES, AC_TYPES, BRANDS, EXPERIENCE_BANDS, TOOLS, WORK_STATUSES, WEEKDAYS } from '@katf/shared';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  ChipGroup,
  Modal,
  PhotoUploader,
  Progress,
  RadioCards,
  Select,
  SignaturePad,
  Spinner,
  TextArea,
  TextField,
  useT,
  useToast,
  type UploadedPhoto,
} from '@katf/ui';
import { api, errorText, uploadFile, ApiError } from '../lib/api';
import { useApp } from '../App';

const NATIONALITIES = [
  ['OM', 'عُماني', 'Omani'],
  ['IN', 'هندي', 'Indian'],
  ['PK', 'باكستاني', 'Pakistani'],
  ['BD', 'بنغالي', 'Bangladeshi'],
  ['EG', 'مصري', 'Egyptian'],
  ['PH', 'فلبيني', 'Filipino'],
  ['LK', 'سريلانكي', 'Sri Lankan'],
  ['NP', 'نيبالي', 'Nepali'],
  ['XX', 'أخرى', 'Other'],
] as const;

interface AppStatus {
  status: string;
  wizardStep: number;
  draft: Record<string, Record<string, unknown>>;
  documents: { id: string; type: string; status: string; expiresAt: string | null }[];
  needsInfo: string[] | null;
  needsInfoMessage: string | null;
  reviewSla: string;
}

export function Register() {
  const { m, locale, reload, f } = useApp();
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const [st, setSt] = useState<AppStatus | null>(null);
  const [step, setStep] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = async () => {
    const s = await api<AppStatus>('/api/tech/application');
    setSt(s);
    return s;
  };
  useEffect(() => {
    void load().then((s) => setStep(Math.min(10, Math.max(2, s.wizardStep))));
  }, []);

  if (!st) return <div className="k-container" style={{ paddingTop: 40 }}><Spinner /></div>;
  if (done)
    return (
      <div className="k-container k-narrow" style={{ paddingTop: 40 }}>
        <Card float strong>
          <div className="k-stack k-center" style={{ alignItems: 'center' }}>
            <Check size={48} color="var(--success)" aria-hidden />
            <p style={{ fontSize: '1.1rem' }}>{f(m.wizard.submitted, { sla: st.reviewSla })}</p>
            <Button variant="primary" onClick={() => void reload().then(() => nav('/status'))}>
              {m.status.title}
            </Button>
          </div>
        </Card>
      </div>
    );

  const draft = (n: number) => (st.draft?.[`step${n}`] ?? {}) as Record<string, any>;
  const save = async (n: number, data: Record<string, unknown>, advance = true) => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/tech/application/step/${n}`, { method: 'PUT', json: data });
      await load();
      if (advance) {
        setStep(n + 1);
        window.scrollTo({ top: 0 });
      } else toast(m.wizard.saved, 'success');
    } catch (e) {
      const ex = e as ApiError;
      setErr(ex.code === 'documents_missing' ? `${t('errors.required')} (${(ex.details?.missing as string[] | undefined)?.length ?? ''})` : errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 16, paddingBlock: 20 }}>
      <Progress step={step} total={10} label={`${f(m.wizard.progress, { n: step })} — ${m.wizard.steps[step - 1]}`} />
      <h1 style={{ fontSize: '1.4rem' }}>{m.wizard.steps[step - 1]}</h1>
      {st.status === 'needs_info' && st.needsInfoMessage && <Banner tone="warning" title={m.status.requested}>{st.needsInfoMessage}</Banner>}
      {err && <Banner tone="danger" title={err} />}
      {step === 2 && <Step2 initial={draft(2)} busy={busy} onSave={(d, adv) => save(2, d, adv)} />}
      {step === 3 && <Step3 initial={draft(3)} docs={st.documents} busy={busy} onSave={(d, adv) => save(3, d, adv)} onDocs={load} />}
      {step === 4 && <Step4 docs={st.documents} workStatus={String(draft(3).workStatus ?? '')} busy={busy} onSave={() => save(4, {})} onDocs={load} />}
      {step === 5 && <Step5 initial={draft(5)} busy={busy} onSave={(d, adv) => save(5, d, adv)} />}
      {step === 6 && <Step6 initial={draft(6)} busy={busy} onSave={(d, adv) => save(6, d, adv)} />}
      {step === 7 && <Step7 initial={draft(7)} busy={busy} onSave={(d, adv) => save(7, d, adv)} />}
      {step === 8 && <Step8 initial={draft(8)} busy={busy} onSave={(d, adv) => save(8, d, adv)} />}
      {step === 9 && <Step9 onPassed={() => (load(), setStep(10))} />}
      {step === 10 && <Step10 onSubmitted={() => setDone(true)} />}
      {step > 2 && (
        <Button variant="quiet" icon={<Back size={18} aria-hidden />} onClick={() => setStep(step - 1)}>
          {t('actions.back')}
        </Button>
      )}
    </div>
  );
}

function Footer({ busy, onNext, onLater, disabled }: { busy: boolean; onNext: () => void; onLater?: () => void; disabled?: boolean }) {
  const { m, locale } = useApp();
  const t = useT();
  const Next = locale === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <div className="k-stack" style={{ gap: 8 }}>
      <Button variant="primary" size="lg" loading={busy} disabled={disabled} onClick={onNext}>
        {t('actions.next')} <Next size={18} aria-hidden />
      </Button>
      {onLater && (
        <Button variant="quiet" icon={<Save size={18} aria-hidden />} onClick={onLater}>
          {m.wizard.saveLater}
        </Button>
      )}
    </div>
  );
}

const up = (purpose: string) => (file: File, p: (n: number) => void) => uploadFile(file, purpose, p);

// ---------------------------------------------------------------- step 2
function Step2({ initial, busy, onSave }: { initial: Record<string, any>; busy: boolean; onSave: (d: Record<string, unknown>, advance: boolean) => void }) {
  const { m, locale } = useApp();
  const [v, setV] = useState({ fullNameAr: '', fullNameEn: initial.fullNameEn ?? '', dob: '', nationality: initial.nationality ?? 'OM', civilId: '', email: initial.email ?? '', locale: initial.locale ?? locale });
  const [photo, setPhoto] = useState<UploadedPhoto[]>(initial.photoFileId ? [{ id: initial.photoFileId, url: '' }] : []);
  const set = (k: keyof typeof v, x: string) => setV({ ...v, [k]: x });
  const data = { ...v, photoFileId: photo[0]?.id ?? '' };
  const ok = v.fullNameAr.trim().split(/\s+/).length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(v.dob) && v.civilId.length >= 8 && photo.length === 1;
  return (
    <Card>
      <div className="k-stack">
        <TextField label={m.wizard.fullNameAr} value={v.fullNameAr} onChange={(e) => set('fullNameAr', e.target.value)} autoComplete="name" maxLength={120} dir="rtl" />
        <TextField label={m.wizard.fullNameEn} value={v.fullNameEn} onChange={(e) => set('fullNameEn', e.target.value)} maxLength={120} dir="ltr" />
        <TextField label={m.wizard.dob} type="date" value={v.dob} onChange={(e) => set('dob', e.target.value)} max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().slice(0, 10)} />
        <Select label={m.wizard.nationality} value={v.nationality} onChange={(e) => set('nationality', e.target.value)} options={NATIONALITIES.map(([c, a, en]) => ({ value: c, label: locale === 'en' ? en : a }))} />
        <TextField label={m.wizard.civilId} hint={m.wizard.civilIdHint} value={v.civilId} onChange={(e) => set('civilId', e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" className="k-ltr" />
        <TextField label={m.wizard.email} type="email" value={v.email} onChange={(e) => set('email', e.target.value)} maxLength={120} dir="ltr" />
        <RadioCards name="lang" legend={m.wizard.language} value={v.locale} onChange={(x) => set('locale', x)} options={[{ value: 'ar', label: 'عربي' }, { value: 'en', label: 'English' }]} />
        <PhotoUploader label={m.wizard.photo} hint={m.wizard.photoHint} value={photo} onChange={setPhoto} max={1} upload={up('profile_photo')} />
        <Footer busy={busy} disabled={!ok} onNext={() => onSave(data, true)} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- document helper
function DocUpload({ type, label, needsExpiry, docs, onDone, hint }: { type: string; label: string; needsExpiry?: boolean; docs: AppStatus['documents']; onDone: () => void; hint?: string }) {
  const { m } = useApp();
  const t = useT();
  const existing = docs.find((d) => d.type === type);
  const [expiry, setExpiry] = useState(existing?.expiresAt ?? '');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const f = photos[0];
    if (!f) return;
    if (needsExpiry && !expiry) return;
    api('/api/tech/application/documents', { method: 'POST', json: { type, fileId: f.id, expiresAt: needsExpiry ? expiry : null } }).then(
      () => (setErr(null), onDone()),
      (e) => (setErr(errorText(t, e)), setPhotos([])),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, expiry]);
  return (
    <div className="k-card k-tight k-stack" style={{ gap: 10 }}>
      <div className="k-row k-between">
        <strong>{label}</strong>
        {existing && (
          <span className="k-pill k-pill-success">
            <Check size={12} aria-hidden /> {m.wizard.uploaded}
          </span>
        )}
      </div>
      {hint && <p className="k-small k-muted">{hint}</p>}
      {needsExpiry && <TextField label={m.wizard.expiry} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} min={new Date().toISOString().slice(0, 10)} />}
      <PhotoUploader value={photos} onChange={setPhotos} max={1} upload={up('document')} />
      {err && <span className="k-error">{err}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- step 3
function Step3({ initial, docs, busy, onSave, onDocs }: { initial: Record<string, any>; docs: AppStatus['documents']; busy: boolean; onSave: (d: Record<string, unknown>, a: boolean) => void; onDocs: () => void }) {
  const { m, locale } = useApp();
  const [ws, setWs] = useState<string | null>(initial.workStatus ?? null);
  const [cr, setCr] = useState('');
  const [decl, setDecl] = useState(Boolean(initial.declaration));
  return (
    <Card>
      <div className="k-stack">
        <RadioCards name="ws" legend={m.wizard.workStatus} value={ws} onChange={setWs} options={WORK_STATUSES.map((w) => ({ value: w.id, label: w[locale] }))} min={260} />
        {ws === 'expat_labour_card' && <DocUpload type="labour_card" label={m.wizard.labourCard} needsExpiry docs={docs} onDone={onDocs} />}
        {ws === 'company' && (
          <>
            <TextField label={m.wizard.crNumber} value={cr} onChange={(e) => setCr(e.target.value)} className="k-ltr" maxLength={30} />
            <DocUpload type="commercial_registration" label={m.wizard.crDoc} needsExpiry docs={docs} onDone={onDocs} />
          </>
        )}
        <Checkbox checked={decl} onChange={setDecl}>
          {m.wizard.declaration}
        </Checkbox>
        <Footer busy={busy} disabled={!ws || !decl} onNext={() => onSave({ workStatus: ws, crNumber: cr, declaration: decl }, true)} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- step 4
function Step4({ docs, workStatus, busy, onSave, onDocs }: { docs: AppStatus['documents']; workStatus: string; busy: boolean; onSave: () => void; onDocs: () => void }) {
  const { m } = useApp();
  const need = ['civil_id_front', 'civil_id_back', 'selfie_with_id', ...(workStatus === 'expat_labour_card' ? ['residence_card'] : [])];
  const ok = need.every((n) => docs.some((d) => d.type === n));
  return (
    <div className="k-stack">
      <DocUpload type="civil_id_front" label={m.wizard.civilFront} needsExpiry docs={docs} onDone={onDocs} />
      <DocUpload type="civil_id_back" label={m.wizard.civilBack} docs={docs} onDone={onDocs} />
      {workStatus === 'expat_labour_card' && <DocUpload type="residence_card" label={m.wizard.residenceCard} needsExpiry docs={docs} onDone={onDocs} />}
      <div className="k-card k-tight k-row" style={{ gap: 14 }}>
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden>
          <circle cx="28" cy="26" r="12" fill="var(--line)" />
          <path d="M8 66c2-14 10-22 20-22s18 8 20 22" fill="var(--line)" />
          <rect x="40" y="30" width="26" height="17" rx="3" fill="var(--accent)" opacity=".85" />
          <rect x="44" y="34" width="8" height="9" rx="1.5" fill="#fff" />
        </svg>
        <p className="k-small">{m.wizard.selfieHint}</p>
      </div>
      <DocUpload type="selfie_with_id" label={m.wizard.selfie} docs={docs} onDone={onDocs} />
      <Footer busy={busy} disabled={!ok} onNext={onSave} />
    </div>
  );
}

// ---------------------------------------------------------------- step 5
function Step5({ initial, busy, onSave }: { initial: Record<string, any>; busy: boolean; onSave: (d: Record<string, unknown>, a: boolean) => void }) {
  const { m, locale, config, f } = useApp();
  const max = Number(config.settings.bio_max_chars ?? 300);
  const [v, setV] = useState({
    services: (initial.services as string[]) ?? [],
    acTypes: (initial.acTypes as string[]) ?? [],
    brands: (initial.brands as string[]) ?? [],
    experienceBand: (initial.experienceBand as string) ?? null,
    bio: (initial.bio as string) ?? '',
    ownVehicle: Boolean(initial.ownVehicle),
    tools: (initial.tools as string[]) ?? [],
    teamSize: (initial.teamSize as string) ?? 'solo',
  });
  const [work, setWork] = useState<UploadedPhoto[]>(((initial.workPhotoIds as string[]) ?? []).map((id) => ({ id, url: '' })));
  const [certs, setCerts] = useState<UploadedPhoto[]>([]);
  const minW = Number(config.settings.work_photos_min ?? 3);
  const maxW = Number(config.settings.work_photos_max ?? 10);
  const data = { ...v, workPhotoIds: work.map((w) => w.id) };
  const ok = v.services.length > 0 && v.experienceBand && work.length >= minW && v.bio.length <= max;
  useEffect(() => {
    const c = certs[certs.length - 1];
    if (c) void api('/api/tech/application/documents', { method: 'POST', json: { type: 'certification', fileId: c.id } }).catch(() => {});
  }, [certs]);
  return (
    <Card>
      <div className="k-stack" style={{ gap: 18 }}>
        <div className="k-field">
          <span className="k-label">{m.wizard.category}</span>
          <span className="k-pill k-pill-accent">{m.wizard.categoryAc}</span>
        </div>
        <ChipGroup legend={m.wizard.services} values={v.services} onChange={(x) => setV({ ...v, services: x })} options={TECH_SERVICES.map((s) => ({ value: s.id, label: s[locale] }))} />
        <ChipGroup legend={m.wizard.acTypes} values={v.acTypes} onChange={(x) => setV({ ...v, acTypes: x })} options={AC_TYPES.filter((a) => a.id !== 'unknown').map((s) => ({ value: s.id, label: s[locale] }))} />
        <ChipGroup legend={m.wizard.brands} values={v.brands} onChange={(x) => setV({ ...v, brands: x })} options={BRANDS.map((s) => ({ value: s.id, label: s.en }))} />
        <RadioCards name="exp" legend={m.wizard.experience} value={v.experienceBand} onChange={(x) => setV({ ...v, experienceBand: x })} options={EXPERIENCE_BANDS.map((s) => ({ value: s.id, label: s[locale] }))} min={140} />
        <PhotoUploader label={m.wizard.certs} value={certs} onChange={setCerts} max={5} upload={up('certification')} />
        <PhotoUploader label={m.wizard.workPhotos} value={work} onChange={setWork} max={maxW} min={minW} upload={up('work_sample')} />
        <TextArea label={m.wizard.bio} hint={f(m.wizard.bioHint, { n: max })} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} maxLength={max} counter />
        <Checkbox checked={v.ownVehicle} onChange={(x) => setV({ ...v, ownVehicle: x })}>
          {m.wizard.vehicle}
        </Checkbox>
        <ChipGroup legend={m.wizard.tools} values={v.tools} onChange={(x) => setV({ ...v, tools: x })} options={TOOLS.map((s) => ({ value: s.id, label: s[locale] }))} />
        <RadioCards name="team" legend={m.wizard.team} value={v.teamSize} onChange={(x) => setV({ ...v, teamSize: x })} options={[{ value: 'solo', label: m.wizard.solo }, { value: 'assistant', label: m.wizard.assistant }]} />
        <Footer busy={busy} disabled={!ok} onNext={() => onSave(data, true)} onLater={() => onSave(data, false)} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- step 6
interface AreaRow {
  wilayat: string;
  nameAr: string;
  nameEn: string;
  active: boolean;
  neighbourhoods: { id: string; ar: string; en: string }[];
}

export function CoverageForm({ initial, busy, onSave, submitLabel }: { initial: Record<string, any>; busy: boolean; onSave: (d: Record<string, unknown>, a: boolean) => void; submitLabel?: string }) {
  const { m, locale } = useApp();
  const [areas, setAreas] = useState<AreaRow[]>([]);
  useEffect(() => {
    void api<AreaRow[]>('/api/areas').then(setAreas);
  }, []);
  const [sel, setSel] = useState<{ wilayat: string; neighbourhoods: string[] }[]>((initial.areas as never) ?? []);
  const [days, setDays] = useState<string[]>(((initial.workingDays as number[]) ?? [0, 1, 2, 3, 4]).map(String));
  const [from, setFrom] = useState(String(initial.from ?? initial.workingHours?.from ?? '08:00'));
  const [to, setTo] = useState(String(initial.to ?? initial.workingHours?.to ?? '20:00'));
  const [maxJobs, setMaxJobs] = useState(String(initial.maxJobsPerDay ?? 4));
  const [maxKm, setMaxKm] = useState(String(initial.maxDistanceKm ?? ''));
  const [vacation, setVacation] = useState(String(initial.vacationUntil ?? '').slice(0, 10));
  const data = { areas: sel, workingDays: days.map(Number), from, to, workingHours: { from, to }, maxJobsPerDay: Number(maxJobs), maxDistanceKm: maxKm ? Number(maxKm) : undefined, vacationUntil: vacation || null };
  return (
    <div className="k-stack" style={{ gap: 16 }}>
      <ChipGroup
        legend={m.wizard.wilayats}
        values={sel.map((s) => s.wilayat)}
        onChange={(ws) => setSel(ws.map((w) => sel.find((s) => s.wilayat === w) ?? { wilayat: w, neighbourhoods: [] }))}
        options={areas.filter((a) => a.active).map((a) => ({ value: a.wilayat, label: locale === 'en' ? a.nameEn : a.nameAr }))}
      />
      <div className="k-chips">
        {areas.filter((a) => !a.active).map((a) => (
          <span key={a.wilayat} className="k-pill k-pill-muted">
            {locale === 'en' ? a.nameEn : a.nameAr} · {m.wizard.soon}
          </span>
        ))}
      </div>
      {sel.map((s) => {
        const a = areas.find((x) => x.wilayat === s.wilayat);
        if (!a) return null;
        return (
          <ChipGroup
            key={s.wilayat}
            legend={`${locale === 'en' ? a.nameEn : a.nameAr} — ${m.wizard.neighbourhoods}`}
            values={s.neighbourhoods}
            onChange={(ns) => setSel(sel.map((x) => (x.wilayat === s.wilayat ? { ...x, neighbourhoods: ns } : x)))}
            options={a.neighbourhoods.map((n) => ({ value: n.id, label: locale === 'en' ? n.en : n.ar }))}
          />
        );
      })}
      <TextField label={m.wizard.maxDistance} type="number" inputMode="numeric" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} min={1} max={100} />
      <ChipGroup legend={m.wizard.days} values={days} onChange={setDays} options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d[locale] }))} />
      <div className="k-grid" style={{ '--min': '140px' } as React.CSSProperties}>
        <TextField label={m.wizard.from} type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={m.wizard.to} type="time" value={to} onChange={(e) => setTo(e.target.value)} />
        <TextField label={m.wizard.maxJobs} type="number" inputMode="numeric" value={maxJobs} onChange={(e) => setMaxJobs(e.target.value)} min={1} max={12} />
      </div>
      <TextField label={m.wizard.vacation} type="date" value={vacation} onChange={(e) => setVacation(e.target.value)} />
      {submitLabel ? (
        <Button variant="primary" loading={busy} disabled={!sel.length || !days.length} onClick={() => onSave(data, true)}>
          {submitLabel}
        </Button>
      ) : (
        <Footer busy={busy} disabled={!sel.length || !days.length} onNext={() => onSave(data, true)} onLater={() => onSave(data, false)} />
      )}
    </div>
  );
}

function Step6(p: { initial: Record<string, any>; busy: boolean; onSave: (d: Record<string, unknown>, a: boolean) => void }) {
  return (
    <Card>
      <CoverageForm {...p} />
    </Card>
  );
}

// ---------------------------------------------------------------- step 7
export function BankForm({ initial, busy, onSave, extra, submitLabel }: { initial: Record<string, any>; busy: boolean; onSave: (d: Record<string, unknown>, a: boolean) => void; extra?: React.ReactNode; submitLabel?: string }) {
  const { m, config } = useApp();
  const banks = (config.settings.banks as string[] | undefined) ?? ((config as unknown as { banks?: string[] }).banks ?? []);
  const [bankName, setBank] = useState(initial.bankName ?? '');
  const [iban, setIban] = useState('');
  const [holder, setHolder] = useState('');
  const [letter, setLetter] = useState<UploadedPhoto[]>([]);
  const ok = bankName && /^OM\d{2}[A-Z0-9]{19}$/i.test(iban.replace(/\s/g, '')) && holder.trim().length > 2;
  const data = { bankName, iban: iban.replace(/\s/g, '').toUpperCase(), holderName: holder, letterFileId: letter[0]?.id ?? null };
  return (
    <div className="k-stack">
      <Select label={m.wizard.bank} value={bankName} onChange={(e) => setBank(e.target.value)} placeholder="—" options={banks.map((b) => ({ value: b, label: b }))} />
      <TextField label={m.wizard.iban} hint={m.wizard.ibanHint} value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} className="k-ltr" maxLength={30} autoCapitalize="characters" />
      <TextField label={m.wizard.holder} value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={120} />
      <PhotoUploader label={m.wizard.bankLetter} value={letter} onChange={setLetter} max={1} upload={up('document')} />
      <Banner icon={<ShieldCheck size={18} aria-hidden />} title={m.wizard.ownAccount} />
      {extra}
      {submitLabel ? (
        <Button variant="primary" loading={busy} disabled={!ok} onClick={() => onSave(data, true)}>
          {submitLabel}
        </Button>
      ) : (
        <Footer busy={busy} disabled={!ok} onNext={() => onSave(data, true)} />
      )}
    </div>
  );
}

function Step7(p: { initial: Record<string, any>; busy: boolean; onSave: (d: Record<string, unknown>, a: boolean) => void }) {
  return (
    <Card>
      <BankForm {...p} />
    </Card>
  );
}

// ---------------------------------------------------------------- step 8
function Step8({ busy, onSave }: { initial: Record<string, any>; busy: boolean; onSave: (d: Record<string, unknown>, a: boolean) => void }) {
  const { m } = useApp();
  const [refs, setRefs] = useState([
    { name: '', phone: '', relation: '' },
    { name: '', phone: '', relation: '' },
  ]);
  const [em, setEm] = useState({ name: '', phone: '' });
  const data = { references: refs.filter((r) => r.name.trim()), emergency: em };
  return (
    <Card>
      <div className="k-stack" style={{ gap: 18 }}>
        <div className="k-stack">
          <strong>{m.wizard.references}</strong>
          <p className="k-small k-muted">{m.wizard.referencesHint}</p>
          {refs.map((r, i) => (
            <div key={i} className="k-grid" style={{ '--min': '150px', '--gap': '10px' } as React.CSSProperties}>
              <TextField label={m.wizard.refName} value={r.name} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={80} />
              <TextField label={m.wizard.refPhone} value={r.phone} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, phone: e.target.value.replace(/\D/g, '').slice(0, 8) } : x)))} inputMode="tel" className="k-ltr" />
              <TextField label={m.wizard.refRelation} value={r.relation} onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))} maxLength={40} />
            </div>
          ))}
        </div>
        <div className="k-stack">
          <strong>{m.wizard.emergency}</strong>
          <div className="k-grid" style={{ '--min': '150px', '--gap': '10px' } as React.CSSProperties}>
            <TextField label={m.wizard.refName} value={em.name} onChange={(e) => setEm({ ...em, name: e.target.value })} maxLength={80} />
            <TextField label={m.wizard.refPhone} value={em.phone} onChange={(e) => setEm({ ...em, phone: e.target.value.replace(/\D/g, '').slice(0, 8) })} inputMode="tel" className="k-ltr" />
          </div>
        </div>
        <Footer busy={busy} disabled={!em.name || em.phone.length !== 8} onNext={() => onSave(data, true)} onLater={() => onSave(data, false)} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- step 9
function Step9({ onPassed }: { onPassed: () => void }) {
  const { m, locale, config, f } = useApp();
  const t = useT();
  const r = config.rendered;
  const s = config.settings;
  const [quiz, setQuiz] = useState<{ id: string; topic: string; q: { ar: string; en: string }; options: { ar: string; en: string }[] }[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ passed: boolean; reviewTopics: string[] } | null>(null);
  const vars = { hours: r.auto_confirm_hours ?? '', m: Number(s.arrival_geofence_meters ?? 300), pct: r.commission_pct ?? '', own: r.own_customer_commission_pct ?? '', payout: r.payout_delay_hours ?? '', first: r.new_technician_payout_delay_hours ?? '', jobs: Number(s.new_technician_payout_jobs ?? 3) };
  return (
    <div className="k-stack">
      {!quiz ? (
        <Card title={m.wizard.lessons}>
          <div className="k-stack">
            <p className="k-small k-muted">{f(m.wizard.lessonsBody, { pct: Number(s.quiz_pass_pct ?? 80) })}</p>
            {m.wizard.lessonTitles.map((title, i) => (
              <details key={i} className="k-card k-tight" open={i === 0}>
                <summary className="k-strong" style={{ cursor: 'pointer' }}>
                  <span className="k-num">{i + 1}.</span> {title}
                </summary>
                <p style={{ marginTop: 8 }}>{f(m.wizard.lessonBodies[i]!, vars)}</p>
              </details>
            ))}
            <Button variant="primary" size="lg" onClick={async () => setQuiz(await api('/api/tech/quiz'))}>
              {m.wizard.startQuiz}
            </Button>
          </div>
        </Card>
      ) : (
        <Card title={m.wizard.quiz}>
          <div className="k-stack" style={{ gap: 18 }}>
            {quiz.map((q, i) => (
              <RadioCards
                key={q.id}
                name={q.id}
                legend={`${i + 1}. ${q.q[locale]}`}
                value={answers[q.id] != null ? String(answers[q.id]) : null}
                onChange={(x) => setAnswers({ ...answers, [q.id]: Number(x) })}
                options={q.options.map((o, j) => ({ value: String(j), label: o[locale] }))}
                min={260}
              />
            ))}
            {result && !result.passed && (
              <Banner tone="warning" title={m.wizard.failed}>
                {result.reviewTopics.map((x) => m.wizard.topics[x as keyof typeof m.wizard.topics] ?? x).join('، ')}
              </Banner>
            )}
            <Button
              variant="primary"
              size="lg"
              disabled={Object.keys(answers).length < quiz.length}
              onClick={async () => {
                const r2 = await api<{ passed: boolean; reviewTopics: string[] }>('/api/tech/quiz', { method: 'POST', json: { answers } });
                setResult(r2);
                if (r2.passed) onPassed();
                else {
                  setAnswers({});
                  setQuiz(null);
                }
              }}
            >
              {result && !result.passed ? m.wizard.retry : m.wizard.submitQuiz}
            </Button>
            <span className="k-xs k-muted">{t('actions.continue')}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- step 10
const AGREEMENTS = ['technician_agreement', 'code_of_conduct', 'cancellation_refund', 'privacy'] as const;

function Step10({ onSubmitted }: { onSubmitted: () => void }) {
  const { m, locale } = useApp();
  const t = useT();
  const [docs, setDocs] = useState<{ type: string; id: string; title: string; titleEn: string }[]>([]);
  const [readEnd, setReadEnd] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [doc, setDoc] = useState<{ title: string; body: string; isDraft: boolean } | null>(null);
  const [truth, setTruth] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [sigName, setSigName] = useState('');
  const [sig, setSig] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void api<typeof docs>('/api/legal').then(setDocs);
  }, []);
  useEffect(() => {
    if (!open) return setDoc(null);
    void api<{ title: string; body: string; isDraft: boolean }>(`/api/legal/${open}?lang=${locale}`).then(setDoc);
  }, [open, locale]);
  const all = AGREEMENTS.every((a) => checked[a]) && truth && sigName.trim().length > 3 && sig;
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const sigId = await uploadFile(new File([sig!], 'signature.png', { type: 'image/png' }), 'signature', () => {});
      await api('/api/tech/application/submit', {
        method: 'POST',
        json: { acceptedDocIds: docs.filter((d) => (AGREEMENTS as readonly string[]).includes(d.type)).map((d) => d.id), truthDeclaration: true, marketing, signatureName: sigName.trim(), signatureFileId: sigId, locale },
      });
      onSubmitted();
    } catch (e) {
      setErr(errorText(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="k-stack">
      <Banner icon={<FileText size={18} aria-hidden />} title={m.wizard.agreements} />
      {AGREEMENTS.map((a) => {
        const d = docs.find((x) => x.type === a);
        return (
          <div key={a} className="k-stack" style={{ gap: 6 }}>
            <Checkbox checked={Boolean(checked[a])} disabled={!readEnd[a]} onChange={(v) => setChecked({ ...checked, [a]: v })}>
              <span className="k-strong">{d ? (locale === 'en' ? d.titleEn : d.title) : a}</span>
              {!readEnd[a] && <span className="k-small k-muted"> — {m.wizard.readToUnlock}</span>}
            </Checkbox>
            <Button size="sm" variant="quiet" onClick={() => setOpen(a)}>
              {t('actions.readFull')}
            </Button>
          </div>
        );
      })}
      <Checkbox checked={truth} onChange={setTruth}>
        <span className="k-strong">{m.wizard.docTruth}</span>
      </Checkbox>
      <Checkbox checked={marketing} onChange={setMarketing}>
        {m.wizard.marketing}
      </Checkbox>
      <TextField label={m.wizard.signatureName} value={sigName} onChange={(e) => setSigName(e.target.value)} maxLength={120} dir="rtl" />
      <SignaturePad label={m.wizard.signature} onChange={setSig} />
      {err && <Banner tone="danger" title={err} />}
      <Button variant="primary" size="lg" disabled={!all} loading={busy} onClick={submit}>
        {m.wizard.submit}
      </Button>
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={doc?.title ?? '…'} onReachEnd={() => open && setReadEnd((r) => ({ ...r, [open]: true }))} footer={<Button onClick={() => setOpen(null)}>{t('actions.close')}</Button>}>
        {doc ? (
          <div className="k-stack">
            {doc.isDraft && <Banner tone="warning" title={t('states.draftLegal')} />}
            <div className="k-legal-text">{doc.body}</div>
          </div>
        ) : (
          <Spinner />
        )}
      </Modal>
    </div>
  );
}

export { useMemo };
