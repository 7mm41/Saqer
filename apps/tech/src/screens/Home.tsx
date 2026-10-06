import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { MapPin, Clock, QrCode, AlertTriangle, ShieldCheck, ChevronLeft, ChevronRight, BellRing } from 'lucide-react';
import { formatWindow, formatPercent, DECLINE_REASONS } from '@katf/shared';
import { Banner, BottomSheet, Button, Card, Countdown, EmptyState, Money, RadioCards, SkeletonCard, Stat, StatusPill, useT, useToast } from '@katf/ui';
import { api, errorText } from '../lib/api';
import { buzz, chime } from '../lib/native';
import { useApp } from '../App';

export function HomeScreen() {
  const { m, locale, f } = useApp();
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const [h, setH] = useState<any>(null);
  const seen = useRef<Set<string>>(new Set());
  const load = useCallback(async () => {
    const d = await api<any>('/api/tech/home').catch(() => null);
    if (!d) return;
    for (const r of d.requests) {
      if (!seen.current.has(r.id)) {
        seen.current.add(r.id);
        chime();
        void buzz(true);
      }
    }
    setH(d);
    if (d.alerts.termsPending.length) nav('/terms');
  }, [nav]);
  useEffect(() => {
    void load();
    const i = setInterval(load, 15_000);
    return () => clearInterval(i);
  }, [load]);
  if (!h) return <div className="k-stack"><SkeletonCard /><SkeletonCard /></div>;
  const Chevron = locale === 'ar' ? ChevronLeft : ChevronRight;
  const toggle = async () => {
    await api('/api/tech/availability', { method: 'POST', json: { available: !h.available } }).catch((e) => toast(errorText(t, e), 'danger'));
    void load();
  };
  return (
    <div className="k-stack" style={{ gap: 16 }}>
      {h.requests.map((r: any) => (
        <RequestCard key={r.id} r={r} onDone={load} />
      ))}

      <Card strong>
        <div className="k-row k-between">
          <div className="k-stack" style={{ gap: 2 }}>
            <strong>{h.available ? m.home.available : m.home.busy}</strong>
            {h.rating && <span className="k-small k-muted">★ <span className="k-num">{h.rating.toFixed(1)}</span> ({h.ratingCount})</span>}
          </div>
          <button type="button" role="switch" aria-checked={h.available} onClick={toggle} className="k-switch" aria-label={m.home.available}>
            <span />
          </button>
        </div>
      </Card>

      {h.alerts.paused && <Banner tone="warning" icon={<AlertTriangle size={18} aria-hidden />} title={f(m.home.paused, { reason: h.alerts.paused })} />}
      {h.alerts.documentsExpiring.map((d: any) => (
        <Banner key={d.type} tone="warning" title={f(m.home.docExpiring, { doc: d.type, date: d.expiresAt })} action={<Link to="/account/documents" className="k-btn k-btn-sm k-btn-secondary">{m.account.renew}</Link>} />
      ))}
      {h.status === 'approved_probation' && <Banner title={f(m.home.probation, { n: h.probationJobsLeft ?? '' })} />}

      {h.next && (
        <Card title={m.home.next} float>
          <Link to={`/jobs/${h.next.id}`} className="k-stack" style={{ gap: 6, textDecoration: 'none' }}>
            <div className="k-row k-between">
              <strong>{h.next.problem[locale]}</strong>
              <StatusPill status={h.next.status} label={t(`status.${h.next.status}`)} />
            </div>
            <span className="k-small k-muted k-row" style={{ gap: 6 }}>
              <Clock size={16} aria-hidden /> {formatWindow(Date.parse(h.next.window.start), Date.parse(h.next.window.end), locale)}
            </span>
            <span className="k-small k-muted k-row" style={{ gap: 6 }}>
              <MapPin size={16} aria-hidden /> {h.next.area.neighbourhood[locale]}
            </span>
          </Link>
          <Button variant="primary" size="lg" block onClick={() => nav(`/jobs/${h.next.id}`)} style={{ marginTop: 12 }}>
            {m.job.code} {h.next.code} <Chevron size={18} aria-hidden />
          </Button>
        </Card>
      )}

      <Card title={m.home.today}>
        {h.today.length === 0 ? (
          <EmptyState title={m.home.noJobs} body={m.home.noJobsBody} action={<Link to="/link" className="k-btn k-btn-secondary"><QrCode size={18} aria-hidden /> {m.home.openLink}</Link>} />
        ) : (
          <div className="k-list">
            {h.today.map((j: any) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="k-list-row">
                <span className="k-stack k-grow" style={{ gap: 0 }}>
                  <strong>{locale === 'en' ? j.problemEn : j.problem}</strong>
                  <span className="k-small k-muted">
                    {formatWindow(Date.parse(j.window.start), Date.parse(j.window.end), locale)} · {j.area.neighbourhood[locale]}
                  </span>
                </span>
                <StatusPill status={j.status} label={t(`status.${j.status}`)} />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card title={m.home.week}>
        <div className="k-grid" style={{ '--min': '120px' } as React.CSSProperties}>
          <Stat label={m.home.awaiting} value={<span className="k-num">{h.week.awaiting}</span>} />
          <Stat label={m.home.scheduled} value={<Money baisa={h.week.scheduled} />} />
          <Stat label={m.home.paid} value={<Money baisa={h.week.paid} />} />
        </div>
      </Card>

      <Card>
        <div className="k-row">
          <ShieldCheck color={h.alerts.strikes ? 'var(--warning)' : 'var(--success)'} aria-hidden />
          <span>{h.alerts.strikes ? f(m.home.strikes, { n: h.alerts.strikes }) : m.home.standingGood}</span>
        </div>
      </Card>
    </div>
  );
}

/** Full-attention request card with countdown (§7.2). */
export function RequestCard({ r, onDone }: { r: any; onDone: () => void }) {
  const { m, locale, f } = useApp();
  const t = useT();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [decline, setDecline] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [km, setKm] = useState<number | null>(null);
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const R = 6371;
        const dLat = ((r.approx.lat - p.coords.latitude) * Math.PI) / 180;
        const dLng = ((r.approx.lng - p.coords.longitude) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos((p.coords.latitude * Math.PI) / 180) * Math.cos((r.approx.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
        setKm(Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10);
      },
      () => {},
      { timeout: 8000 },
    );
  }, [r.approx.lat, r.approx.lng]);
  const act = async (what: 'accept' | 'decline') => {
    setBusy(what);
    try {
      await api(`/api/tech/jobs/${r.id}/${what}`, { method: 'POST', json: what === 'decline' ? { reason } : {} });
      if (what === 'accept') nav(`/jobs/${r.id}`);
      else onDone();
    } catch (e) {
      toast(errorText(t, e), 'danger');
      onDone();
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card float strong className="k-request-hero">
      <div className="k-stack" style={{ gap: 10 }}>
        <div className="k-row k-between">
          <span className="k-pill k-pill-accent">
            <BellRing size={14} aria-hidden /> {m.request.title}
          </span>
          {r.acceptDeadline && (
            <span className="k-small">
              {m.request.acceptWithin} <Countdown until={Date.parse(r.acceptDeadline)} onDone={onDone} />
            </span>
          )}
        </div>
        <h2 style={{ fontSize: '1.3rem' }}>
          {r.problem[locale]} · {f(m.request.units, { n: r.units.reduce((s: number, u: any) => s + u.count, 0) })}
        </h2>
        {r.problemText && <p className="k-small">{r.problemText}</p>}
        {r.media.length > 0 && (
          <div className="k-photos">
            {r.media.map((p: any) => (
              <a key={p.id} className="k-photo" href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt="" />
              </a>
            ))}
          </div>
        )}
        <span className="k-row k-small" style={{ gap: 6 }}>
          <MapPin size={16} aria-hidden /> {r.area.neighbourhood[locale]} — {r.area.wilayat[locale]} {km != null && <span className="k-muted">· {f(m.request.distance, { km })}</span>}
        </span>
        <span className="k-row k-small" style={{ gap: 6 }}>
          <Clock size={16} aria-hidden /> {formatWindow(Date.parse(r.window.start), Date.parse(r.window.end), locale)}
        </span>
        <div className="k-card k-tight" style={{ background: 'var(--surface-2)' }}>
          <div className="k-money-row">
            <span>{m.request.guaranteed}</span>
            <Money baisa={r.money.visitFee} strong />
          </div>
          <div className="k-money-row">
            <span>
              {m.request.receive} <span className="k-xs k-muted">({m.request.receiveVisit})</span>
            </span>
            <Money baisa={r.money.visitOnlyNet} strong />
          </div>
          <span className="k-xs k-muted">{f(m.request.commission, { pct: formatPercent(r.money.commissionBps) })}</span>
        </div>
        <div className="k-row">
          <Button variant="primary" size="lg" className="k-grow" loading={busy === 'accept'} onClick={() => act('accept')}>
            {m.request.accept}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setDecline(true)}>
            {m.request.decline}
          </Button>
        </div>
      </div>
      <BottomSheet open={decline} onClose={() => setDecline(false)} label={m.request.decline}>
        <div className="k-stack">
          <RadioCards name="dr" legend={m.request.declineReason} value={reason} onChange={setReason} options={DECLINE_REASONS.map((d) => ({ value: d.id, label: d[locale] }))} />
          <Button variant="danger" loading={busy === 'decline'} onClick={() => act('decline')}>
            {m.request.decline}
          </Button>
        </div>
      </BottomSheet>
    </Card>
  );
}
