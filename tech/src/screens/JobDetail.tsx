/** Job details (§7.3): stepper, customer card, and the one primary action for the current state. */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Phone, MessageCircle, Navigation, Camera, AlertTriangle, ShieldAlert, Plus, Trash2, ArrowRight, ArrowLeft, MapPin, Clock, Hash } from 'lucide-react';
import { FAULT_TYPES, TECH_CANCEL_REASONS, formatOMR, formatTime, formatWindow, formatDateShort, parseOMR, formatPercent, type QuoteLineKind } from '@katf/shared';
import {
  Banner,
  BottomSheet,
  Button,
  Card,
  ChipGroup,
  Countdown,
  Money,
  MoneyRow,
  PhotoUploader,
  RadioCards,
  SkeletonCard,
  StatusPill,
  TextArea,
  TextField,
  Timeline,
  useT,
  useToast,
  type UploadedPhoto,
} from '@katf/ui';
import { api, errorText, uploadFile, ApiError } from '../lib/api';
import { buzz, currentPosition, mapsLink, takePhoto } from '../lib/native';
import { useApp } from '../App';
import { RequestCard } from './Home';

const STEP_KEYS = ['accepted', 'on_the_way', 'arrived', 'diagnosing', 'quote', 'in_progress', 'completed', 'customer_confirmed', 'payout'];
const up = (purpose: string) => (file: File, p: (n: number) => void) => uploadFile(file, purpose, p);

export function JobDetail() {
  const { id } = useParams();
  const { m, locale, f } = useApp();
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const [j, setJ] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'eta' | 'cancel' | 'safety' | 'chat' | 'absent' | 'override' | 'failed'>(null);
  const [overrideInfo, setOverrideInfo] = useState<{ lat: number; lng: number; photo: string; distance: number } | null>(null);

  const load = useCallback(async () => {
    try {
      setJ(await api(`/api/tech/jobs/${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) nav('/jobs');
    }
  }, [id, nav]);
  useEffect(() => {
    void load();
    const i = setInterval(load, 10_000);
    return () => clearInterval(i);
  }, [load]);

  const act = async (name: string, path: string, json?: unknown) => {
    setBusy(name);
    try {
      const r = await api<any>(`/api/tech/jobs/${id}/${path}`, { method: 'POST', json: json ?? {} });
      void buzz();
      await load();
      return r ?? true;
    } catch (e) {
      toast(errorText(t, e), 'danger');
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (!j) return <div className="k-stack"><SkeletonCard /><SkeletonCard lines={5} /></div>;
  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;
  if (j.status === 'requested')
    return (
      <div className="k-stack">
        <button type="button" className="k-btn k-btn-quiet" onClick={() => nav(-1)}>
          <Back size={18} aria-hidden /> {t('actions.back')}
        </button>
        <RequestCard r={j} onDone={load} />
      </div>
    );

  const idx = STEP_KEYS.indexOf(j.step);
  const accepted = ['accepted', 'on_the_way'].includes(j.status);

  const arrive = async () => {
    setBusy('arrive');
    try {
      const file = await takePhoto();
      if (!file) return;
      const photo = await uploadFile(file, 'arrival', () => {});
      const pos = await currentPosition();
      try {
        await api(`/api/tech/jobs/${id}/arrive`, { method: 'POST', json: { lat: pos.lat, lng: pos.lng, photoFileId: photo } });
        void buzz();
        await load();
      } catch (e) {
        if (e instanceof ApiError && e.code === 'outside_geofence') {
          setOverrideInfo({ lat: pos.lat, lng: pos.lng, photo, distance: Number(e.details?.distance ?? 0) });
          setSheet('override');
        } else toast(errorText(t, e), 'danger');
      }
    } catch (e) {
      toast(errorText(t, e), 'danger');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="k-stack" style={{ gap: 14 }}>
      <div className="k-row k-between">
        <button type="button" className="k-btn k-btn-quiet" onClick={() => nav('/home')}>
          <Back size={18} aria-hidden /> {t('actions.back')}
        </button>
        <StatusPill status={j.status} label={t(`status.${j.status}`)} />
      </div>
      {j.isRevisit && <Banner title={m.job.revisit} />}

      <Card>
        <Timeline items={m.job.steps.map((s, i) => ({ label: s, state: i < idx ? 'done' : i === idx ? 'current' : 'todo' }))} />
      </Card>

      {/* customer card — exact address only after acceptance */}
      <Card title={j.customerFirstName ? `${m.job.customer}: ${j.customerFirstName}` : m.job.customer}>
        <div className="k-stack" style={{ gap: 8 }}>
          <span className="k-row k-small" style={{ gap: 6 }}>
            <Hash size={16} aria-hidden /> <span className="k-num">{j.code}</span>
          </span>
          <span className="k-row k-small" style={{ gap: 6 }}>
            <Clock size={16} aria-hidden /> {formatWindow(Date.parse(j.window.start), Date.parse(j.window.end), locale)}
          </span>
          <span className="k-row k-small" style={{ gap: 6 }}>
            <MapPin size={16} aria-hidden /> {j.area.neighbourhood[locale]} — {j.area.wilayat[locale]}
          </span>
          {j.address && (
            <span className="k-small">
              {[j.address.wayNo, j.address.buildingNo, j.address.flatNo, j.address.landmark].filter(Boolean).join(' · ')}
              {j.address.notes && <span className="k-muted"> — {j.address.notes}</span>}
            </span>
          )}
          <span className="k-small">
            <strong>{j.problem[locale]}</strong> · {j.units.map((u: any) => `${u.count}× ${u.type}`).join('، ')}
          </span>
          {j.problemText && <p className="k-small k-muted">{j.problemText}</p>}
          {j.media.length > 0 && (
            <div className="k-photos">
              {j.media.map((p: UploadedPhoto) => (
                <a key={p.id} className="k-photo" href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt="" />
                </a>
              ))}
            </div>
          )}
          {j.location && (
            <div className="k-row">
              <Button size="sm" variant="secondary" icon={<Phone size={16} aria-hidden />} loading={busy === 'call'} onClick={async () => { const r = await act('call', 'call'); if (r?.phone) window.location.href = `tel:${r.phone}`; }}>
                {m.job.call}
              </Button>
              <Button size="sm" variant="secondary" icon={<MessageCircle size={16} aria-hidden />} onClick={() => setSheet('chat')}>
                {m.job.chat}
              </Button>
              <a className="k-btn k-btn-secondary k-btn-sm" href={mapsLink(j.location.lat, j.location.lng)} target="_blank" rel="noreferrer">
                <Navigation size={16} aria-hidden /> {m.job.openMap}
              </a>
            </div>
          )}
        </div>
      </Card>

      {/* primary action by state */}
      {j.status === 'accepted' && (
        <Card float strong>
          <div className="k-stack">
            {j.freeCancelUntil > Date.now() && <Banner tone="warning" title={f(m.job.freeCancelUntil, { time: formatTime(j.freeCancelUntil, locale) })} />}
            <Button variant="primary" size="lg" onClick={() => setSheet('eta')}>
              {m.job.onTheWay}
            </Button>
          </div>
        </Card>
      )}
      {j.status === 'on_the_way' && (
        <Card float strong>
          <Button variant="primary" size="lg" block icon={<Camera size={20} aria-hidden />} loading={busy === 'arrive'} onClick={arrive}>
            {m.job.arrived}
          </Button>
          <p className="k-xs k-muted" style={{ marginTop: 8 }}>{m.job.arrivalPhoto}</p>
        </Card>
      )}
      {j.status === 'arrived' && (
        <Card float strong>
          <div className="k-stack">
            <Button variant="primary" size="lg" loading={busy === 'diagnose'} onClick={() => act('diagnose', 'diagnose')}>
              {m.job.startDiagnosis}
            </Button>
            <Button variant="secondary" onClick={() => setSheet('absent')}>
              {m.job.absent}
            </Button>
          </div>
        </Card>
      )}
      {j.status === 'diagnosing' && !j.isRevisit && (j.quote?.status === 'pending_admin' ? <Banner tone="warning" title={m.job.heldForAdmin} /> : <QuoteBuilder job={j} first onSent={load} />)}
      {j.status === 'diagnosing' && j.isRevisit && (
        <Card float strong>
          <div className="k-stack">
            <Button variant="primary" size="lg" loading={busy === 'rv'} onClick={() => act('rv', 'revisit-start')}>
              {m.job.revisitWork}
            </Button>
            <Button variant="danger" onClick={() => setSheet('failed')}>
              {m.job.revisitFailed}
            </Button>
          </div>
        </Card>
      )}
      {j.status === 'quote_sent' && (
        <Card title={m.job.waiting}>
          {j.quote?.validUntil && (
            <p className="k-row k-small">
              {m.job.validFor} <Countdown until={Date.parse(j.quote.validUntil)} onDone={load} />
            </p>
          )}
          {j.quote && <QuoteSummary q={j.quote} />}
        </Card>
      )}
      {j.status === 'repair_payment_pending' && <Banner tone="info" title={m.job.approvedPay} />}
      {j.status === 'in_progress' && (
        <>
          <DoneForm job={j} onDone={load} />
          {!j.isRevisit && <QuoteBuilder job={j} first={false} onSent={load} />}
          {j.isRevisit && (
            <Button variant="danger" onClick={() => setSheet('failed')}>
              {m.job.revisitFailed}
            </Button>
          )}
        </>
      )}
      {j.status === 'completed_pending_confirmation' && <Banner tone="info" title={m.job.awaitingCustomer} />}
      {['confirmed', 'settled', 'paid_out'].includes(j.status) && (
        <Banner tone="success" title={m.job.confirmed}>
          {j.money.payoutDueAt && f(m.job.payoutOn, { date: formatDateShort(Date.parse(j.money.payoutDueAt), locale) })}
        </Banner>
      )}
      {['closed_visit_only', 'customer_absent'].includes(j.status) && <Banner title={m.job.rejected}><Money baisa={j.money.technicianNet} /></Banner>}

      {/* amounts */}
      <Card title={m.job.amounts}>
        <MoneyRow label={m.request.guaranteed} baisa={j.money.visitFee} />
        {j.money.quoteTotal != null && <MoneyRow label={m.job.total} baisa={j.money.quoteTotal} />}
        <MoneyRow label={`${m.earnings.commission.replace('{pct}', formatPercent(j.money.commissionBps))}`} baisa={j.money.quoteTotal != null && j.money.expectedNet != null ? j.money.quoteTotal - j.money.expectedNet : null} />
        <MoneyRow label={m.job.net} baisa={j.money.technicianNet ?? j.money.expectedNet ?? j.money.visitOnlyNet} total />
      </Card>

      {/* problems */}
      {['accepted', 'on_the_way', 'arrived', 'diagnosing', 'in_progress', 'quote_sent'].includes(j.status) && (
        <div className="k-row k-between">
          {accepted && (
            <Button variant="quiet" icon={<AlertTriangle size={18} aria-hidden />} onClick={() => setSheet('cancel')}>
              {m.job.cantComplete}
            </Button>
          )}
          <Button variant="danger" size="sm" icon={<ShieldAlert size={18} aria-hidden />} onClick={() => setSheet('safety')}>
            {m.job.safety}
          </Button>
        </div>
      )}

      {/* sheets */}
      <BottomSheet open={sheet === 'eta'} onClose={() => setSheet(null)} label={m.job.eta}>
        <div className="k-stack">
          <h3>{m.job.eta}</h3>
          <div className="k-radio-cards" style={{ '--min': '90px' } as React.CSSProperties}>
            {[10, 20, 30, 45, 60, 90].map((n) => (
              <Button key={n} variant="secondary" loading={busy === `eta${n}`} onClick={async () => (await act(`eta${n}`, 'travel', { etaMinutes: n })) && setSheet(null)}>
                {f(m.job.etaMin, { n })}
              </Button>
            ))}
          </div>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'override'} onClose={() => setSheet(null)} label={m.job.override}>
        <OverrideForm info={overrideInfo} onSubmit={async (reason) => { if (!overrideInfo) return; if (await act('override', 'arrive', { lat: overrideInfo.lat, lng: overrideInfo.lng, photoFileId: overrideInfo.photo, override: true, overrideReason: reason })) setSheet(null); }} />
      </BottomSheet>

      <BottomSheet open={sheet === 'absent'} onClose={() => setSheet(null)} label={m.job.absent}>
        <div className="k-stack">
          <h3>{m.job.absent}</h3>
          <p>{f(m.job.absentBody, { m: Math.round(((j.waitUntil ?? Date.now()) - Date.parse(j.timeline.arrived ?? new Date().toISOString())) / 60000), n: j.callAttempts })}</p>
          {j.waitUntil > Date.now() && <Countdown until={j.waitUntil} onDone={load} />}
          <Button variant="secondary" icon={<Phone size={18} aria-hidden />} onClick={async () => { const r = await act('call', 'call'); if (r?.phone) window.location.href = `tel:${r.phone}`; }}>
            {m.job.call}
          </Button>
          <Button variant="danger" disabled={j.waitUntil > Date.now() || j.callAttempts < 2} loading={busy === 'absent'} onClick={async () => (await act('absent', 'absent')) && setSheet(null)}>
            {m.job.absent}
          </Button>
        </div>
      </BottomSheet>

      <CancelSheet open={sheet === 'cancel'} onClose={() => setSheet(null)} hours={j.policy.strikeHours} onSubmit={async (reason) => (await act('cancel', 'cancel', { reason })) && (setSheet(null), nav('/home'))} />

      <BottomSheet open={sheet === 'safety'} onClose={() => setSheet(null)} label={m.job.safety}>
        <div className="k-stack">
          <h3 className="k-row"><ShieldAlert color="var(--danger)" aria-hidden /> {m.job.safety}</h3>
          <p>{m.job.safetyBody}</p>
          <a className="k-btn k-btn-danger k-btn-lg" href="tel:9999">
            <Phone size={20} aria-hidden /> {m.job.call9999}
          </a>
          <Button
            variant="secondary"
            loading={busy === 'safety'}
            onClick={async () => {
              const pos = await currentPosition().catch(() => null);
              if (await act('safety', 'safety', { lat: pos?.lat ?? null, lng: pos?.lng ?? null })) toast(m.job.sendSafety, 'success');
            }}
          >
            {m.job.sendSafety}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'failed'} onClose={() => setSheet(null)} label={m.job.revisitFailed}>
        <FailedForm onSubmit={async (note) => (await act('failed', 'revisit-failed', { note })) && setSheet(null)} />
      </BottomSheet>

      {sheet === 'chat' && <Chat bookingId={j.id} onClose={() => setSheet(null)} />}
    </div>
  );
}

function OverrideForm({ info, onSubmit }: { info: { distance: number } | null; onSubmit: (r: string) => void }) {
  const { m, f } = useApp();
  const [reason, setReason] = useState('');
  return (
    <div className="k-stack">
      <Banner tone="warning" title={f(m.job.outside, { m: info?.distance ?? '' })} />
      <TextArea label={m.job.overrideReason} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} />
      <Button variant="primary" disabled={reason.trim().length < 5} onClick={() => onSubmit(reason)}>
        {m.job.override}
      </Button>
    </div>
  );
}

function CancelSheet({ open, onClose, onSubmit, hours }: { open: boolean; onClose: () => void; onSubmit: (r: string) => void; hours: number }) {
  const { m, locale, f } = useApp();
  const [reason, setReason] = useState<string | null>(null);
  return (
    <BottomSheet open={open} onClose={onClose} label={m.job.cantComplete}>
      <div className="k-stack">
        <h3>{m.job.cantComplete}</h3>
        <Banner tone="warning" title={f(m.job.cantBody, { h: hours })} />
        <RadioCards name="cr" legend={m.job.reason} value={reason} onChange={setReason} options={TECH_CANCEL_REASONS.map((r) => ({ value: r.id, label: r[locale] }))} min={150} />
        <Button variant="danger" disabled={!reason} onClick={() => reason && onSubmit(reason)}>
          {m.job.confirmCancel}
        </Button>
      </div>
    </BottomSheet>
  );
}

function FailedForm({ onSubmit }: { onSubmit: (n: string) => void }) {
  const { m } = useApp();
  const [note, setNote] = useState('');
  return (
    <div className="k-stack">
      <h3>{m.job.revisitFailed}</h3>
      <Banner tone="warning" title={m.job.revisitFailedBody} />
      <TextArea label={m.job.notes} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
      <Button variant="danger" disabled={note.trim().length < 3} onClick={() => onSubmit(note)}>
        {m.job.revisitFailed}
      </Button>
    </div>
  );
}

function QuoteSummary({ q }: { q: any }) {
  const { m } = useApp();
  return (
    <div>
      {q.items.map((it: any, i: number) => (
        <MoneyRow key={i} label={`${it.label}${it.qty > 1 ? ` × ${it.qty}` : ''}`} baisa={it.amount} />
      ))}
      <MoneyRow label={m.job.total} baisa={q.total} total />
    </div>
  );
}

interface Line {
  kind: QuoteLineKind;
  label: string;
  qty: string;
  price: string;
  catalogId?: string | null;
}

function QuoteBuilder({ job, first, onSent }: { job: any; first: boolean; onSent: () => void }) {
  const { m, locale, f, config } = useApp();
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(first);
  const [faults, setFaults] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [duration, setDuration] = useState('');
  const [lines, setLines] = useState<Line[]>([{ kind: 'labor', label: '', qty: '1', price: '' }]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ catalog: any[] }>('/api/tech/catalog').then((r) => setCatalog(r.catalog));
  }, []);
  const parsed = lines.map((l) => ({ ...l, unit: parseOMR(l.price || '0'), q: Number(l.qty) }));
  const total = parsed.reduce((s, l) => s + (l.unit ?? 0) * (Number.isInteger(l.q) ? l.q : 0), 0);
  const minTotal = first ? job.money.visitFee : (job.money.quoteTotal ?? 0) + 1;
  const valid = parsed.every((l) => l.label.trim() && l.unit != null && Number.isInteger(l.q) && l.q >= 1) && total >= minTotal && (!first || (faults.length > 0 && photos.length >= 2));
  if (!open)
    return (
      <Button variant="secondary" icon={<Plus size={18} aria-hidden />} onClick={() => setOpen(true)}>
        {m.job.extraWork}
      </Button>
    );
  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ status: string }>(`/api/tech/jobs/${job.id}/quote`, {
        method: 'POST',
        json: {
          faults: first ? faults : ['other'],
          notes: notes || null,
          photos: photos.map((p) => p.id),
          durationMin: duration ? Number(duration) : null,
          items: parsed.map((l) => ({ kind: l.kind, label: l.label.trim(), qty: l.q, unitPrice: l.unit, catalogId: l.catalogId ?? null })),
        },
      });
      if (r.status === 'pending_admin') toast(m.job.heldForAdmin);
      setOpen(first);
      onSent();
    } catch (e) {
      toast(errorText(t, e), 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={first ? m.job.diagnosis : m.job.extraWork} float>
      <div className="k-stack" style={{ gap: 16 }}>
        {first && (
          <>
            <ChipGroup legend={m.job.faults} values={faults} onChange={setFaults} options={FAULT_TYPES.map((x) => ({ value: x.id, label: x[locale] }))} />
            <PhotoUploader label={m.job.diagnosisPhotos} value={photos} onChange={setPhotos} max={8} min={2} upload={up('diagnosis')} />
            <TextArea label={m.job.notes} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={2} />
            <TextField label={m.job.duration} value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
          </>
        )}
        <strong>{m.job.quote}</strong>
        {lines.map((l, i) => {
          const c = catalog.find((x) => x.id === l.catalogId);
          const unit = parseOMR(l.price || '0');
          const oob = c && c.priceGuideMin != null && unit != null && (unit < c.priceGuideMin || unit > c.priceGuideMax);
          return (
            <div key={i} className="k-card k-tight k-stack" style={{ gap: 8 }}>
              <div className="k-row">
                <select className="k-select" style={{ width: 'auto' }} value={l.kind} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, kind: e.target.value as QuoteLineKind } : x)))} aria-label={m.job.kind}>
                  <option value="labor">{m.job.labor}</option>
                  <option value="part">{m.job.part}</option>
                  <option value="other">{m.job.other}</option>
                </select>
                <select
                  className="k-select k-grow"
                  value={l.catalogId ?? ''}
                  aria-label={m.job.fromCatalog}
                  onChange={(e) => {
                    const it = catalog.find((x) => x.id === e.target.value);
                    setLines(lines.map((x, j) => (j === i ? { ...x, catalogId: it?.id ?? null, label: it ? (locale === 'en' ? it.nameEn : it.nameAr) : x.label } : x)));
                  }}
                >
                  <option value="">{m.job.fromCatalog}</option>
                  {catalog.map((c2) => (
                    <option key={c2.id} value={c2.id}>
                      {locale === 'en' ? c2.nameEn : c2.nameAr}
                    </option>
                  ))}
                </select>
                {lines.length > 1 && (
                  <button type="button" className="k-icon-btn" aria-label={t('actions.delete')} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    <Trash2 size={18} aria-hidden />
                  </button>
                )}
              </div>
              <TextField label={m.job.lineLabel} value={l.label} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={120} />
              <div className="k-grid" style={{ '--min': '110px', '--gap': '8px' } as React.CSSProperties}>
                <TextField label={m.job.qty} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, '') } : x)))} inputMode="numeric" className="k-ltr" />
                <TextField label={m.job.unitPrice} value={l.price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} inputMode="decimal" className="k-ltr" placeholder="0.000" />
              </div>
              {c && c.priceGuideMin != null && <span className={oob ? 'k-small k-error' : 'k-xs k-muted'}>{oob ? m.job.outOfBand : f(m.job.band, { min: formatOMR(c.priceGuideMin), max: formatOMR(c.priceGuideMax) })}</span>}
            </div>
          );
        })}
        <Button variant="quiet" icon={<Plus size={18} aria-hidden />} onClick={() => setLines([...lines, { kind: 'part', label: '', qty: '1', price: '' }])}>
          {m.job.addLine}
        </Button>
        <MoneyRow label={m.job.total} baisa={total} total />
        {first && <p className="k-xs k-muted">{m.job.visitIncluded}</p>}
        {total < minTotal && first && <span className="k-error k-small">{f(m.job.minTotal, { fee: formatOMR(job.money.visitFee) })}</span>}
        <p className="k-xs k-muted">{f(m.job.warranty, { days: job.policy.warrantyDays })}</p>
        <p className="k-xs k-muted">{f(m.job.probationCap, { cap: formatOMR(job.policy.probationMaxQuote) })}</p>
        <Button variant="primary" size="lg" disabled={!valid} loading={busy} onClick={send}>
          {m.job.sendQuote}
        </Button>
      </div>
      <span hidden>{String(config.settings.app_name ?? '')}</span>
    </Card>
  );
}

function DoneForm({ job, onDone }: { job: any; onDone: () => void }) {
  const { m } = useApp();
  const t = useT();
  const toast = useToast();
  const [before, setBefore] = useState<UploadedPhoto[]>([]);
  const [after, setAfter] = useState<UploadedPhoto[]>([]);
  const [parts, setParts] = useState<{ label: string; receipt: UploadedPhoto[] }[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Card title={m.job.done} float strong>
      <div className="k-stack" style={{ gap: 14 }}>
        <PhotoUploader label={m.job.before} value={before} onChange={setBefore} max={6} min={1} upload={up('before')} />
        <PhotoUploader label={m.job.after} value={after} onChange={setAfter} max={6} min={1} upload={up('after')} />
        <strong>{m.job.partsUsed}</strong>
        {parts.map((p, i) => (
          <div key={i} className="k-card k-tight k-stack" style={{ gap: 8 }}>
            <TextField label={m.job.lineLabel} value={p.label} onChange={(e) => setParts(parts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} maxLength={120} />
            <PhotoUploader label={m.job.receipt} value={p.receipt} onChange={(r) => setParts(parts.map((x, j) => (j === i ? { ...x, receipt: r } : x)))} max={1} upload={up('receipt')} />
          </div>
        ))}
        <Button variant="quiet" icon={<Plus size={18} aria-hidden />} onClick={() => setParts([...parts, { label: '', receipt: [] }])}>
          {m.job.addLine}
        </Button>
        <TextArea label={m.job.workNotes} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} />
        <Button
          variant="primary"
          size="lg"
          disabled={!before.length || !after.length}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/tech/jobs/${job.id}/complete`, { method: 'POST', json: { before: before.map((x) => x.id), after: after.map((x) => x.id), notes: notes || null, parts: parts.filter((p) => p.label.trim()).map((p) => ({ label: p.label.trim(), receiptFileId: p.receipt[0]?.id ?? null })) } });
              onDone();
            } catch (e) {
              toast(errorText(t, e), 'danger');
            } finally {
              setBusy(false);
            }
          }}
        >
          {m.job.done}
        </Button>
      </div>
    </Card>
  );
}

function Chat({ bookingId, onClose }: { bookingId: string; onClose: () => void }) {
  const { m } = useApp();
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const load = useCallback(async () => setMsgs(await api<any[]>(`/api/bookings/${bookingId}/messages`).catch(() => [])), [bookingId]);
  useEffect(() => {
    void load();
    const i = setInterval(load, 8000);
    return () => clearInterval(i);
  }, [load]);
  return (
    <BottomSheet open onClose={onClose} label={m.job.chat}>
      <div className="k-stack" style={{ gap: 8 }}>
        <h3>{m.job.chat}</h3>
        <div className="k-stack" style={{ gap: 6, maxHeight: '45dvh', overflow: 'auto' }}>
          {msgs.map((x) => (
            <div key={x.id} className="k-card k-tight" style={{ alignSelf: x.mine ? 'flex-start' : 'flex-end', maxWidth: '85%', background: x.mine ? 'var(--accent-soft)' : undefined }}>
              {x.body}
            </div>
          ))}
        </div>
        <form
          className="k-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            await api(`/api/bookings/${bookingId}/messages`, { method: 'POST', json: { body: text } }).catch(() => {});
            setText('');
            void load();
          }}
        >
          <input className="k-input k-grow" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} aria-label={m.job.chat} />
          <Button variant="primary" type="submit">
            ➤
          </Button>
        </form>
      </div>
    </BottomSheet>
  );
}
