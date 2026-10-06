'use client';
/**
 * Booking flow (§8.3): six screens, progress bar, back button, and a draft kept in the
 * browser for 24 hours so a refresh loses nothing (no OTP or tokens are stored).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, ArrowRight, Crosshair, MapPin, ShieldCheck, Wrench, ThumbsUp, CalendarCheck, CircleDollarSign, Minus, Plus, Lock } from 'lucide-react';
import { BOOKING_PROBLEMS, AC_TYPES, formatWindow, formatOMR } from '@katf/shared';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Progress,
  RadioCards,
  Select,
  TextArea,
  TextField,
  PhotoUploader,
  Spinner,
  useT,
  useToast,
  type UploadedPhoto,
} from '@katf/ui';
import { api, errorText, uploadFile, ApiError } from '../lib/api';
import { fmt } from '../lib/fmt';
import { useSite } from './Providers';
import { OtpLogin } from './OtpLogin';
import { LegalModal } from './LegalModal';
import { SlotPicker, type Slot } from './SlotPicker';
import { Waitlist } from './Waitlist';
import type { Area } from '../lib/server-api';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false, loading: () => <div className="k-map k-skeleton" /> });

const KEY = 'katf-booking-draft';
const DAY = 86_400_000;
const MUSCAT = { lat: 23.588, lng: 58.3829 };

interface Draft {
  step: number;
  problem: string;
  units: number;
  acType: string;
  details: string;
  media: UploadedPhoto[];
  urgency: 'today' | 'day';
  wilayat: string;
  neighbourhood: string;
  lat: number | null;
  lng: number | null;
  wayNo: string;
  buildingNo: string;
  flatNo: string;
  landmark: string;
  notes: string;
  saveAddress: boolean;
  slot: { start: number; end: number } | null;
  name: string;
  email: string;
  savedAt: number;
}

const EMPTY: Draft = {
  step: 1,
  problem: '',
  units: 1,
  acType: '',
  details: '',
  media: [],
  urgency: 'day',
  wilayat: '',
  neighbourhood: '',
  lat: null,
  lng: null,
  wayNo: '',
  buildingNo: '',
  flatNo: '',
  landmark: '',
  notes: '',
  saveAddress: true,
  slot: null,
  name: '',
  email: '',
  savedAt: 0,
};

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (Date.now() - d.savedAt > DAY) {
      localStorage.removeItem(KEY);
      return null;
    }
    // blob previews do not survive a reload; keep the uploaded ids
    return { ...EMPTY, ...d, media: d.media.map((x) => ({ ...x, url: '/icon.svg' })) };
  } catch {
    return null;
  }
}

export function BookingFlow({ areas, techSlug, techName, repeatOf }: { areas: Area[]; techSlug: string | null; techName: string | null; repeatOf: string | null }) {
  const { m, locale, config } = useSite();
  const t = useT();
  const toast = useToast();
  const [d, setD] = useState<Draft>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [coverage, setCoverage] = useState<'ok' | 'outside' | 'pin' | null>(null);
  const [locating, setLocating] = useState(false);
  const [legal, setLegal] = useState<{ type: string } | null>(null);
  const [docs, setDocs] = useState<{ type: string; id: string }[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = config.settings;
  const r = config.rendered;
  const active = areas.filter((a) => a.active);
  const area = active.find((a) => a.wilayat === d.wilayat);
  const nb = area?.neighbourhoods.find((n) => n.id === d.neighbourhood);
  const L = locale;
  const feeText = area && (area as Area & { visitFeeOverride?: number | null }).visitFeeOverride != null ? formatOMR((area as Area & { visitFeeOverride: number }).visitFeeOverride) : (r.visit_fee ?? '');
  const Next = L === 'ar' ? ArrowLeft : ArrowRight;
  const Back = L === 'ar' ? ArrowRight : ArrowLeft;

  useEffect(() => {
    const saved = loadDraft();
    if (saved) {
      setD(saved);
      if (saved.step > 1) toast(m.book.draftRestored);
    }
    setHydrated(true);
    api('/api/me').then(
      (me: unknown) => {
        setSignedIn(true);
        const name = (me as { name?: string }).name;
        if (name) setD((x) => (x.name ? x : { ...x, name }));
      },
      () => setSignedIn(false),
    );
    api<{ type: string; id: string }[]>('/api/legal').then(setDocs, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
    } catch {
      /* storage unavailable: the flow still works */
    }
  }, [d, hydrated]);

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v })), []);

  // slots for step 4
  useEffect(() => {
    if (d.step !== 4) return;
    setSlots(null);
    const q = techSlug ? `slug=${encodeURIComponent(techSlug)}` : `wilayat=${d.wilayat}&neighbourhood=${d.neighbourhood}`;
    api<Slot[]>(`/api/slots?${q}`).then(setSlots, () => setSlots([]));
  }, [d.step, techSlug, d.wilayat, d.neighbourhood]);

  const locate = () => {
    if (!navigator.geolocation) return toast(m.book.locationDenied, 'danger');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setD((x) => ({ ...x, lat: p.coords.latitude, lng: p.coords.longitude }));
        // pick the nearest active neighbourhood
        let best: { w: string; n: string; dist: number } | null = null;
        for (const a of active)
          for (const n of a.neighbourhoods) {
            const dist = Math.hypot(n.lat - p.coords.latitude, n.lng - p.coords.longitude);
            if (!best || dist < best.dist) best = { w: a.wilayat, n: n.id, dist };
          }
        if (best && best.dist < 0.08) setD((x) => ({ ...x, wilayat: best!.w, neighbourhood: best!.n }));
      },
      () => {
        setLocating(false);
        toast(m.book.locationDenied, 'danger');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const checkCoverage = async () => {
    if (!d.wilayat || !d.neighbourhood || d.lat == null || d.lng == null) return false;
    const c = await api<{ ok: boolean; reason?: string }>(`/api/coverage?wilayat=${d.wilayat}&neighbourhood=${d.neighbourhood}&lat=${d.lat}&lng=${d.lng}`).catch(() => ({ ok: false, reason: 'outside_coverage' }));
    setCoverage(c.ok ? 'ok' : c.reason === 'pin_outside_area' ? 'pin' : 'outside');
    return c.ok;
  };

  const canNext = useMemo(() => {
    switch (d.step) {
      case 1:
        return Boolean(d.problem && d.acType && d.units >= 1);
      case 2:
        return d.details.length <= Number(s.problem_text_max_chars ?? 500);
      case 3:
        return Boolean(d.wilayat && d.neighbourhood && d.lat != null);
      case 4:
        return Boolean(d.slot);
      case 5:
        return Boolean(signedIn && d.name.trim());
      default:
        return true;
    }
  }, [d, signedIn, s.problem_text_max_chars]);

  const go = async (step: number) => {
    setErr(null);
    if (step > d.step && d.step === 3 && !(await checkCoverage())) return;
    set('step', step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pay = async () => {
    setBusy(true);
    setErr(null);
    try {
      const need = docs.filter((x) => ['customer_terms', 'cancellation_refund'].includes(x.type)).map((x) => x.id);
      const res = await api<{ id: string; code: string; checkoutUrl: string; trackingToken: string }>('/api/bookings', {
        method: 'POST',
        json: {
          technicianSlug: techSlug,
          repeatOf,
          problem: d.problem,
          units: [{ type: d.acType, count: d.units }],
          problemText: d.details || null,
          mediaIds: d.media.map((x) => x.id),
          urgency: d.urgency,
          address: { wilayat: d.wilayat, neighbourhood: d.neighbourhood, wayNo: d.wayNo || null, buildingNo: d.buildingNo || null, flatNo: d.flatNo || null, landmark: d.landmark || null, notes: d.notes || null },
          lat: d.lat,
          lng: d.lng,
          saveAddress: d.saveAddress,
          windowStart: d.slot!.start,
          windowEnd: d.slot!.end,
          name: d.name.trim(),
          email: d.email.trim() || null,
          acceptedDocIds: need,
          locale: L,
          returnUrl: `${window.location.origin}/book/return`,
        },
      });
      try {
        sessionStorage.setItem('katf-last-booking', JSON.stringify({ id: res.id, code: res.code, token: res.trackingToken, slot: d.slot }));
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      window.location.href = res.checkoutUrl;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'slot_unavailable') {
        set('slot', null);
        set('step', 4);
      }
      setErr(errorText(t, e));
      setBusy(false);
    }
  };

  if (!hydrated) return <Spinner />;

  const problemLabel = BOOKING_PROBLEMS.find((p) => p.id === d.problem)?.[L];
  const typeLabel = AC_TYPES.find((p) => p.id === d.acType)?.[L];
  const total = 6;

  return (
    <div className="k-container k-narrow k-stack booking-shell" style={{ gap: 18, paddingTop: 20 }}>
      <div className="k-stack" style={{ gap: 8 }}>
        <h1 style={{ fontSize: '1.6rem' }}>{techName ? fmt(m.book.withTech, { name: techName }) : m.book.title}</h1>
        <Progress step={d.step} total={total} label={`${fmt(m.book.stepOf, { n: d.step, total })} — ${m.book.steps[d.step - 1]}`} />
      </div>

      {d.step === 1 && (
        <Card>
          <div className="k-stack" style={{ gap: 18 }}>
            <RadioCards name="problem" legend={m.book.problem} value={d.problem || null} onChange={(v) => set('problem', v)} options={BOOKING_PROBLEMS.map((p) => ({ value: p.id, label: p[L] }))} min={140} />
            <div className="k-field">
              <span className="k-label">{m.book.units}</span>
              <div className="k-row">
                <button type="button" className="k-icon-btn" aria-label="−" onClick={() => set('units', Math.max(1, d.units - 1))}>
                  <Minus size={18} aria-hidden />
                </button>
                <span className="k-stat-value k-num" aria-live="polite" style={{ minWidth: 40, textAlign: 'center' }}>
                  {d.units}
                </span>
                <button type="button" className="k-icon-btn" aria-label="+" onClick={() => set('units', Math.min(20, d.units + 1))}>
                  <Plus size={18} aria-hidden />
                </button>
              </div>
            </div>
            <RadioCards name="type" legend={m.book.type} value={d.acType || null} onChange={(v) => set('acType', v)} options={AC_TYPES.map((p) => ({ value: p.id, label: p[L] }))} min={120} />
          </div>
        </Card>
      )}

      {d.step === 2 && (
        <Card>
          <div className="k-stack" style={{ gap: 18 }}>
            <TextArea label={m.book.details} hint={m.book.detailsHint} value={d.details} onChange={(e) => set('details', e.target.value)} maxLength={Number(s.problem_text_max_chars ?? 500)} counter />
            <PhotoUploader
              label={m.book.media}
              hint={fmt(m.book.mediaHint, { n: Number(s.max_booking_media ?? 5) })}
              value={d.media}
              onChange={(v) => set('media', v)}
              max={Number(s.max_booking_media ?? 5)}
              acceptVideo
              upload={(f, p) => uploadFile(f, 'booking_problem', p)}
            />
            <RadioCards
              name="urgency"
              legend={m.book.urgency}
              value={d.urgency}
              onChange={(v) => set('urgency', v)}
              options={[
                { value: 'today', label: m.book.today },
                { value: 'day', label: m.book.chooseDay },
              ]}
            />
          </div>
        </Card>
      )}

      {d.step === 3 && (
        <Card>
          <div className="k-stack" style={{ gap: 16 }}>
            <p className="k-muted k-small">{m.book.locationAsk}</p>
            <Button variant="secondary" icon={<Crosshair size={18} aria-hidden />} loading={locating} onClick={locate}>
              {locating ? m.book.locating : m.book.useLocation}
            </Button>
            <div className="k-grid" style={{ '--min': '200px', '--gap': '12px' } as React.CSSProperties}>
              <Select
                label={m.book.wilayat}
                value={d.wilayat}
                placeholder="—"
                onChange={(e) => {
                  setCoverage(null);
                  setD((x) => ({ ...x, wilayat: e.target.value, neighbourhood: '' }));
                }}
                options={areas.map((a) => ({ value: a.wilayat, label: `${L === 'en' ? a.nameEn : a.nameAr}${a.active ? '' : ` — ${m.areas.soon}`}`, disabled: !a.active }))}
              />
              <Select
                label={m.book.neighbourhood}
                value={d.neighbourhood}
                placeholder="—"
                disabled={!area}
                onChange={(e) => {
                  const n = area?.neighbourhoods.find((x) => x.id === e.target.value);
                  setCoverage(null);
                  setD((x) => ({ ...x, neighbourhood: e.target.value, ...(n && x.lat == null ? { lat: n.lat, lng: n.lng } : {}) }));
                }}
                options={(area?.neighbourhoods ?? []).map((n) => ({ value: n.id, label: L === 'en' ? n.en : n.ar }))}
              />
            </div>
            <span className="k-small k-muted k-row">
              <MapPin size={16} aria-hidden /> {m.book.dragPin}
            </span>
            <MapPicker
              lat={d.lat ?? nb?.lat ?? MUSCAT.lat}
              lng={d.lng ?? nb?.lng ?? MUSCAT.lng}
              tileUrl={config.mapTileUrl}
              label={m.book.dragPin}
              onChange={(p) => {
                setCoverage(null);
                setD((x) => ({ ...x, lat: p.lat, lng: p.lng }));
              }}
            />
            {coverage === 'pin' && <Banner tone="warning" title={m.book.pinOutside} />}
            {coverage === 'outside' && (
              <div className="k-stack">
                <Banner tone="warning" title={m.book.outside} />
                <Waitlist areas={areas} defaultWilayat={d.wilayat} />
              </div>
            )}
            <div className="k-grid" style={{ '--min': '140px', '--gap': '12px' } as React.CSSProperties}>
              <TextField label={m.book.wayNo} value={d.wayNo} onChange={(e) => set('wayNo', e.target.value)} inputMode="numeric" maxLength={20} />
              <TextField label={m.book.buildingNo} value={d.buildingNo} onChange={(e) => set('buildingNo', e.target.value)} inputMode="numeric" maxLength={20} />
              <TextField label={m.book.flatNo} value={d.flatNo} onChange={(e) => set('flatNo', e.target.value)} maxLength={20} />
            </div>
            <TextField label={m.book.landmark} value={d.landmark} onChange={(e) => set('landmark', e.target.value)} maxLength={120} />
            <TextArea label={m.book.notes} value={d.notes} onChange={(e) => set('notes', e.target.value)} maxLength={300} rows={2} />
            <Checkbox checked={d.saveAddress} onChange={(v) => set('saveAddress', v)}>
              {m.book.saveAddress}
            </Checkbox>
            <p className="k-small k-muted k-row">
              <Lock size={14} aria-hidden /> {m.book.exactLater}
            </p>
          </div>
        </Card>
      )}

      {d.step === 4 && (
        <Card title={m.book.pickTime}>
          {!slots ? (
            <Spinner />
          ) : slots.length === 0 ? (
            <Banner tone="warning" title={m.book.noSlots} />
          ) : (
            <SlotPicker slots={slots} value={d.slot} onChange={(x) => set('slot', { start: x.start, end: x.end })} locale={L} onlyToday={d.urgency === 'today' && slots.some((x) => new Date(x.start).toDateString() === new Date().toDateString())} />
          )}
        </Card>
      )}

      {d.step === 5 && (
        <Card>
          <div className="k-stack" style={{ gap: 16 }}>
            <TextField label={m.book.name} value={d.name} onChange={(e) => set('name', e.target.value)} autoComplete="given-name" maxLength={80} required />
            {signedIn ? (
              <Banner tone="success" title={m.book.verified} />
            ) : (
              <OtpLogin locale={L} phoneLabel={m.book.phone} intro={m.book.privacyLine} onDone={() => setSignedIn(true)} />
            )}
            <TextField label={m.book.email} type="email" value={d.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" maxLength={120} />
          </div>
        </Card>
      )}

      {d.step === 6 && (
        <div className="k-stack" style={{ gap: 14 }}>
          <Card title={m.book.summary} actions={<Button size="sm" variant="quiet" onClick={() => go(1)}>{m.book.edit}</Button>}>
            <div className="k-stack" style={{ gap: 6 }}>
              <span>
                <strong>{problemLabel}</strong> · <span className="k-num">{d.units}</span> × {typeLabel}
              </span>
              <span className="k-muted">
                {(L === 'en' ? area?.nameEn : area?.nameAr) ?? ''} · {(L === 'en' ? nb?.en : nb?.ar) ?? ''}
              </span>
              {d.slot && <span>{formatWindow(d.slot.start, d.slot.end, L)}</span>}
              {techName && <span className="k-muted">{fmt(m.book.withTech, { name: techName })}</span>}
            </div>
          </Card>
          <Card float strong>
            <div className="k-stack" style={{ gap: 10 }}>
              <strong style={{ fontSize: '1.05rem' }}>{fmt(m.book.priceBlock, { fee: feeText })}</strong>
              <p className="k-muted k-small">{m.book.finalPrice}</p>
              <div className="icons4" aria-hidden>
                {[CircleDollarSign, Wrench, ThumbsUp, CalendarCheck].map((Icon, i) => (
                  <div key={i}>
                    <span className="k-feature-icon">
                      <Icon size={20} />
                    </span>
                    {m.book.icons[i]}
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Card title={m.book.cancelBox} icon={<ShieldCheck size={20} aria-hidden />}>
            <ul className="k-stack k-small" style={{ gap: 4, margin: 0, paddingInlineStart: 18 }}>
              {m.book.cancelLines.map((line, i) => (
                <li key={i}>{fmt(line, { minutes: r.free_cancel_minutes ?? '', late: r.late_cancel_fee_pct ?? '', otw: r.on_the_way_cancel_fee_pct ?? '' })}</li>
              ))}
            </ul>
            <button type="button" className="k-btn k-btn-quiet k-btn-sm" onClick={() => setLegal({ type: 'cancellation_refund' })}>
              {m.book.fullPolicy}
            </button>
          </Card>
          <Checkbox checked={consent} onChange={setConsent}>
            {(() => {
              const parts = m.book.consent.split(/(\{terms\}|\{policy\})/);
              return parts.map((p, i) =>
                p === '{terms}' ? (
                  <button key={i} type="button" className="k-btn-link" onClick={(e) => (e.preventDefault(), setLegal({ type: 'customer_terms' }))}>
                    {m.book.terms}
                  </button>
                ) : p === '{policy}' ? (
                  <button key={i} type="button" className="k-btn-link" onClick={(e) => (e.preventDefault(), setLegal({ type: 'cancellation_refund' }))}>
                    {m.book.policy}
                  </button>
                ) : (
                  <span key={i}>{p}</span>
                ),
              );
            })()}
          </Checkbox>
          <p className="k-xs k-muted">{m.book.under18}</p>
          {!config.paymentsLive && <Banner tone="info" title={m.book.testPayments} />}
          {err && <Banner tone="danger" title={err} />}
          <p className="k-xs k-muted k-row">
            <Lock size={14} aria-hidden /> {m.book.payNote}
          </p>
        </div>
      )}

      {legal && <LegalModal type={legal.type} lang={L} open onClose={() => setLegal(null)} draftLabel={t('states.draftLegal')} closeLabel={t('actions.close')} />}

      <div className="sticky-cta k-no-print">
        {d.step > 1 && (
          <Button variant="secondary" onClick={() => go(d.step - 1)} aria-label={t('actions.back')} icon={<Back size={18} aria-hidden />}>
            {t('actions.back')}
          </Button>
        )}
        {d.step < 6 ? (
          <Button variant="primary" className="k-grow" disabled={!canNext} onClick={() => go(d.step + 1)}>
            {t('actions.next')} <Next size={18} aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" className="k-grow" size="lg" disabled={!consent || !d.slot} loading={busy} onClick={pay}>
            {fmt(m.book.pay, { fee: feeText })}
          </Button>
        )}
      </div>
    </div>
  );
}
