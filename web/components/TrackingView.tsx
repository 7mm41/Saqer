'use client';
/** Tracking page (§8.4): live timeline over SSE, quote approval, confirmation, report, rating, revisit, cancel. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, MessageCircle, Camera, Receipt, RotateCcw, Repeat, XCircle, Clock, Flag, Radio } from 'lucide-react';
import { formatWindow, formatDateShort, formatOMR, DISPUTE_REASONS, RATING_TAGS, FAULT_TYPES, label } from '@katf/shared';
import {
  Banner,
  BottomSheet,
  Button,
  Card,
  ChipGroup,
  Countdown,
  EmptyState,
  LinkButton,
  Money,
  MoneyRow,
  PhotoUploader,
  RadioCards,
  Rating,
  SkeletonCard,
  StatusPill,
  TextArea,
  Timeline,
  VerifiedBadge,
  useT,
  useToast,
  type UploadedPhoto,
} from '@katf/ui';
import { api, errorText, uploadFile } from '../lib/api';
import { fmt } from '../lib/fmt';
import { useSite } from './Providers';
import { SlotPicker, type Slot } from './SlotPicker';

type View = any; // the shape comes from api/src/views.ts customerBookingView

const STEPS = ['booked', 'assigned', 'on_the_way', 'arrived', 'diagnosing', 'quote', 'in_progress', 'awaiting_confirmation', 'done'] as const;
const FINAL_INFO = ['cancelled_by_customer', 'cancelled_by_technician', 'expired', 'expired_unpaid', 'refunded_full', 'refunded_partial', 'closed_visit_only', 'customer_absent', 'repair_failed_closed'];

export function TrackingView({ code, token: initialToken }: { code: string; token: string | null }) {
  const { m, locale } = useSite();
  const t = useT();
  const toast = useToast();
  const [v, setV] = useState<View | null>(null);
  const [token, setToken] = useState<string | null>(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'cancel' | 'problem' | 'reject' | 'revisit' | 'chat' | 'report' | 'appeal'>(null);
  const [live, setLive] = useState(false);
  const L = locale;

  const headers = useCallback(() => (token ? { 'x-track-token': token } : {}), [token]) as () => Record<string, string>;
  const load = useCallback(async () => {
    try {
      const q = token ? `?t=${encodeURIComponent(token)}` : '';
      const data = await api<View>(`/api/track/${encodeURIComponent(code)}${q}`);
      setV(data);
      if (data.token && !token) setToken(data.token);
      setError(null);
    } catch (e) {
      setError(errorText(t, e));
    }
  }, [code, token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // live updates
  useEffect(() => {
    if (!v?.id) return;
    const es = new EventSource(`/api/bookings/${v.id}/events${token ? `?t=${encodeURIComponent(token)}` : ''}`);
    es.onopen = () => setLive(true);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type !== 'hello') void load();
    };
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [v?.id, token, load]);

  const act = async (name: string, path: string, json?: unknown, after?: (r: any) => void) => {
    setBusy(name);
    try {
      const r = await api(path, { method: 'POST', json: json ?? {}, headers: headers() });
      after?.(r);
      await load();
      return true;
    } catch (e) {
      toast(errorText(t, e), 'danger');
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (error && !v) return <div className="k-container k-narrow" style={{ paddingTop: 30 }}><Banner tone="danger" title={error} action={<LinkButton href="/track" size="sm">{m.nav.track}</LinkButton>} /></div>;
  if (!v) return <div className="k-container k-narrow k-stack" style={{ paddingTop: 30 }}><SkeletonCard lines={4} /><SkeletonCard /></div>;

  const stepIdx = STEPS.indexOf(v.step);
  const isFinal = FINAL_INFO.includes(v.status);
  const returnUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/b/${v.code}?t=${token ?? ''}`;

  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 16, paddingTop: 20, paddingBottom: 40 }}>
      <div className="k-row k-between">
        <div className="k-stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: '1.5rem' }}>{fmt(m.tracking.title, { code: v.code })}</h1>
          <span className="k-muted k-small">{formatWindow(Date.parse(v.window.start), Date.parse(v.window.end), L)}</span>
        </div>
        <div className="k-stack" style={{ alignItems: 'flex-end', gap: 6 }}>
          <StatusPill status={v.status} label={t(`status.${v.status}`)} />
          {live && (
            <span className="k-xs k-muted k-row" style={{ gap: 4 }}>
              <Radio size={12} aria-hidden /> {m.tracking.live}
            </span>
          )}
        </div>
      </div>

      {v.isRevisit && <Banner title={m.tracking.revisitTitle} />}

      {!isFinal && (
        <Card>
          <Timeline items={STEPS.map((s, i) => ({ label: m.status[s], state: i < stepIdx ? 'done' : i === stepIdx ? 'current' : 'todo' }))} />
        </Card>
      )}

      {/* pending payment */}
      {v.can.pay && v.pendingPayment && (
        <Card float strong>
          <div className="k-stack">
            <MoneyRow label={m.tracking.payPending} baisa={v.pendingPayment.amount} total />
            <Button variant="primary" size="lg" loading={busy === 'pay'} onClick={() => act('pay', `/api/bookings/${v.id}/pay`, { returnUrl, locale: L }, (r) => (window.location.href = r.checkoutUrl))}>
              {v.status === 'repair_payment_pending' ? m.tracking.payRemaining : m.tracking.payNow}
            </Button>
          </div>
        </Card>
      )}

      {/* technician */}
      {v.technician && !isFinal && (
        <Card title={m.tracking.technicianCard}>
          <div className="k-row" style={{ alignItems: 'flex-start' }}>
            {v.technician.photoUrl ? <img className="k-avatar" src={v.technician.photoUrl} alt="" /> : <div className="k-avatar" />}
            <div className="k-stack k-grow" style={{ gap: 2 }}>
              <strong>{v.technician.name}</strong>
              <VerifiedBadge label={m.tech.verified} />
              <span className="k-small k-muted">
                {v.technician.rating ? `★ ${v.technician.rating.toFixed(1)} · ` : ''}
                {fmt(m.tech.jobs, { n: v.technician.jobs })}
              </span>
            </div>
          </div>
          {v.status === 'on_the_way' && v.etaMinutes && (
            <Banner icon={<Clock size={18} aria-hidden />} title={fmt(m.tracking.eta, { n: v.etaMinutes })} />
          )}
          {v.can.call && (
            <div className="k-row" style={{ marginTop: 12 }}>
              <Button
                variant="secondary"
                icon={<Phone size={18} aria-hidden />}
                loading={busy === 'call'}
                onClick={() => act('call', `/api/bookings/${v.id}/call`, {}, (r) => r.phone && (window.location.href = `tel:${r.phone}`))}
              >
                {m.tracking.call}
              </Button>
              <Button variant="secondary" icon={<MessageCircle size={18} aria-hidden />} onClick={() => setSheet('chat')}>
                {m.tracking.chat}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* arrival */}
      {v.arrivalPhotoUrl && ['arrived', 'diagnosing'].includes(v.status) && (
        <Card title={m.tracking.arrivedTitle}>
          <details>
            <summary style={{ cursor: 'pointer' }} className="k-row">
              <Camera size={18} aria-hidden /> {m.tracking.showArrival}
            </summary>
            <img src={v.arrivalPhotoUrl} alt="" style={{ marginTop: 10, borderRadius: 14 }} />
          </details>
        </Card>
      )}

      {/* quote */}
      {v.quote && v.status === 'quote_sent' && (
        <Card title={m.tracking.quoteTitle} float strong>
          <div className="k-stack" style={{ gap: 10 }}>
            {v.diagnosis?.faults?.length > 0 && (
              <p className="k-small">
                <span className="k-muted">{m.tracking.faults}: </span>
                {v.diagnosis.faults.map((f: string) => label(FAULT_TYPES, f, L)).join('، ')}
              </p>
            )}
            {v.diagnosis?.notes && <p className="k-small">{v.diagnosis.notes}</p>}
            {v.diagnosis?.photos?.length > 0 && (
              <div className="k-photos">
                {v.diagnosis.photos.map((p: UploadedPhoto) => (
                  <a key={p.id} className="k-photo" href={p.url} target="_blank" rel="noreferrer">
                    <img src={p.url} alt="" />
                  </a>
                ))}
              </div>
            )}
            <div>
              {v.quote.items.map((it: any, i: number) => (
                <MoneyRow key={i} label={<span>{it.label} <span className="k-xs k-muted">({m.tracking[it.kind as 'labor' | 'part' | 'other']}{it.qty > 1 ? ` × ${it.qty}` : ''})</span></span>} baisa={it.amount} />
              ))}
              <MoneyRow label={m.tracking.total} baisa={v.quote.total} total />
              <MoneyRow label={fmt(m.tracking.visitPaid, { fee: formatOMR(v.quote.visitFee) })} baisa={v.quote.alreadyPaid} negative />
              <MoneyRow label={m.tracking.due} baisa={v.quote.due} total />
            </div>
            {v.quote.validUntil && (
              <p className="k-small k-muted k-row">
                {m.tracking.quoteValid} <Countdown until={Date.parse(v.quote.validUntil)} onDone={load} />
              </p>
            )}
            <Button variant="primary" size="lg" loading={busy === 'approve'} onClick={() => act('approve', `/api/bookings/${v.id}/quote/${v.quote.id}/approve`, { returnUrl, locale: L }, (r) => r.checkoutUrl && (window.location.href = r.checkoutUrl))}>
              {v.quote.due > 0 ? m.tracking.approve : m.tracking.approveFree}
            </Button>
            <Button variant="secondary" onClick={() => setSheet('reject')}>
              {m.tracking.reject}
            </Button>
          </div>
        </Card>
      )}

      {/* work done */}
      {v.completion && ['completed_pending_confirmation', 'disputed', 'confirmed', 'settled', 'paid_out'].includes(v.status) && (
        <Card title={m.tracking.workDone}>
          <div className="k-stack" style={{ gap: 12 }}>
            <div className="k-grid" style={{ '--min': '140px' } as React.CSSProperties}>
              <div className="k-stack" style={{ gap: 6 }}>
                <span className="k-small k-muted">{m.tracking.before}</span>
                <div className="k-photos">{v.completion.before.map((p: UploadedPhoto) => <div className="k-photo" key={p.id}><img src={p.url} alt="" /></div>)}</div>
              </div>
              <div className="k-stack" style={{ gap: 6 }}>
                <span className="k-small k-muted">{m.tracking.after}</span>
                <div className="k-photos">{v.completion.after.map((p: UploadedPhoto) => <div className="k-photo" key={p.id}><img src={p.url} alt="" /></div>)}</div>
              </div>
            </div>
            {v.completion.parts?.length > 0 && <p className="k-small"><span className="k-muted">{m.tracking.parts}: </span>{v.completion.parts.join('، ')}</p>}
            {v.completion.notes && <p className="k-small"><span className="k-muted">{m.tracking.notes}: </span>{v.completion.notes}</p>}
            {v.status === 'completed_pending_confirmation' && (
              <>
                {v.autoConfirmAt && (
                  <p className="k-small k-muted k-row">
                    {m.tracking.autoConfirmIn} <Countdown until={v.autoConfirmAt} long onDone={load} />
                  </p>
                )}
                <Button variant="primary" size="lg" loading={busy === 'confirm'} onClick={() => act('confirm', `/api/bookings/${v.id}/confirm`)}>
                  {m.tracking.allGood}
                </Button>
                <Button variant="danger" icon={<Flag size={18} aria-hidden />} onClick={() => setSheet('problem')}>
                  {m.tracking.problem}
                </Button>
              </>
            )}
          </div>
        </Card>
      )}

      {/* dispute */}
      {v.dispute && (
        <Banner tone={v.dispute.status === 'decided' || v.dispute.status === 'closed' ? 'info' : 'warning'} title={v.dispute.status === 'decided' || v.dispute.status === 'closed' ? m.tracking.disputeDecided : m.tracking.disputeOpen} action={v.dispute.status === 'decided' && !v.dispute.appealUsed ? <Button size="sm" variant="secondary" onClick={() => setSheet('appeal')}>{m.tracking.appeal}</Button> : undefined}>
          {v.dispute.decisionAmounts?.refund ? <Money baisa={v.dispute.decisionAmounts.refund} /> : null}
        </Banner>
      )}

      {/* final states */}
      {isFinal && (
        <Card>
          <EmptyState
            icon={<XCircle size={40} aria-hidden />}
            title={v.status === 'closed_visit_only' || v.status === 'customer_absent' ? m.tracking.visitOnly : v.status.startsWith('expired') ? m.tracking.expired : t(`status.${v.status}`)}
            body={v.money.refunded > 0 ? `${fmt(m.tracking.cancelPreview, { refund: formatOMR(v.money.refunded) })}. ${m.tracking.refundNote}` : undefined}
          />
        </Card>
      )}

      {/* after confirmation */}
      {v.can.rate && <RateCard id={v.id} headers={headers} onDone={load} />}
      {v.review && <Banner tone="success" title={m.tracking.thanksRating} />}
      {(v.can.receipt || v.can.rebook || v.can.revisit) && (
        <div className="k-grid" style={{ '--min': '200px' } as React.CSSProperties}>
          {v.can.receipt && (
            <LinkButton href={`/b/${v.code}/receipt?t=${token ?? ''}`} variant="secondary" icon={<Receipt size={18} aria-hidden />}>
              {m.tracking.receipt}
            </LinkButton>
          )}
          {v.can.rebook && v.technician?.slug && (
            <LinkButton href={`/book?t=${encodeURIComponent(v.technician.slug)}&repeat=${v.id}`} variant="secondary" icon={<Repeat size={18} aria-hidden />}>
              {m.tracking.rebook}
            </LinkButton>
          )}
          {v.can.revisit && (
            <Button variant="secondary" icon={<RotateCcw size={18} aria-hidden />} onClick={() => setSheet('revisit')}>
              {m.tracking.samProblem}
            </Button>
          )}
        </div>
      )}
      {v.warrantyEndsAt && v.can.revisit && <p className="k-small k-muted">{fmt(m.tracking.warrantyUntil, { date: formatDateShort(v.warrantyEndsAt, L) })}</p>}

      {/* cancel and report */}
      <div className="k-row k-between">
        {v.can.cancel && (
          <Button variant="quiet" icon={<XCircle size={18} aria-hidden />} onClick={() => setSheet('cancel')}>
            {m.tracking.cancel}
          </Button>
        )}
        {v.technician && (
          <Button variant="quiet" size="sm" onClick={() => setSheet('report')}>
            {m.tracking.reportBehaviour}
          </Button>
        )}
      </div>

      {/* sheets */}
      <BottomSheet open={sheet === 'cancel'} onClose={() => setSheet(null)} label={m.tracking.cancelTitle}>
        <div className="k-stack">
          <h3>{m.tracking.cancelTitle}</h3>
          <Banner tone={v.cancel.fee > 0 ? 'warning' : 'success'} title={v.cancel.tier === 'technician_late' ? m.tracking.cancelLate : v.cancel.fee > 0 ? fmt(m.tracking.cancelFee, { fee: formatOMR(v.cancel.fee) }) : m.tracking.cancelFree}>
            {v.cancel.refund > 0 ? fmt(m.tracking.cancelPreview, { refund: formatOMR(v.cancel.refund) }) : null}
          </Banner>
          <p className="k-small k-muted">{m.tracking.refundNote}</p>
          <Button variant="danger" loading={busy === 'cancel'} onClick={async () => (await act('cancel', `/api/bookings/${v.id}/cancel`, {})) && setSheet(null)}>
            {m.tracking.confirmCancel}
          </Button>
          <Button variant="secondary" onClick={() => setSheet(null)}>
            {m.tracking.keep}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'reject'} onClose={() => setSheet(null)} label={m.tracking.reject}>
        <div className="k-stack">
          <h3>{m.tracking.reject}</h3>
          <p>{m.tracking.rejectConfirm}</p>
          <Button variant="danger" loading={busy === 'reject'} onClick={async () => (await act('reject', `/api/bookings/${v.id}/quote/reject`)) && setSheet(null)}>
            {t('actions.confirm')}
          </Button>
          <Button variant="secondary" onClick={() => setSheet(null)}>
            {t('actions.back')}
          </Button>
        </div>
      </BottomSheet>

      <ProblemSheet open={sheet === 'problem'} onClose={() => setSheet(null)} onSubmit={(body) => act('dispute', `/api/bookings/${v.id}/dispute`, body).then((ok) => ok && setSheet(null))} busy={busy === 'dispute'} slaHours={v.policy.disputeSlaHours} token={token} />

      {sheet === 'revisit' && <RevisitSheet slug={v.technician?.slug} onClose={() => setSheet(null)} onSubmit={(s) => act('revisit', `/api/bookings/${v.id}/revisit`, { windowStart: s.start, windowEnd: s.end }, (r) => (window.location.href = `/b/${r.code}?t=${token ?? ''}`))} />}

      {sheet === 'chat' && <ChatSheet bookingId={v.id} headers={headers} onClose={() => setSheet(null)} />}

      <TextSheet open={sheet === 'report'} title={m.tracking.reportBehaviour} label={m.tracking.reportText} onClose={() => setSheet(null)} onSubmit={(text) => act('report', `/api/bookings/${v.id}/report`, { text }, () => toast(m.tracking.sent, 'success')).then((ok) => ok && setSheet(null))} />
      <TextSheet open={sheet === 'appeal'} title={m.tracking.appeal} label={m.tracking.problemDesc} onClose={() => setSheet(null)} onSubmit={(text) => act('appeal', `/api/disputes/${v.dispute?.id}/appeal`, { text }).then((ok) => ok && setSheet(null))} />
    </div>
  );
}

function RateCard({ id, headers, onDone }: { id: string; headers: () => Record<string, string>; onDone: () => void }) {
  const { m, locale } = useSite();
  const t = useT();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card title={m.tracking.rateTitle}>
      <div className="k-stack">
        <Rating value={rating} onChange={setRating} label={m.tracking.rateTitle} />
        <ChipGroup values={tags} onChange={setTags} options={RATING_TAGS.map((x) => ({ value: x.id, label: x[locale] }))} />
        <TextArea label={m.tracking.comment} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2} error={err} />
        <Button
          variant="primary"
          disabled={!rating}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/bookings/${id}/rate`, { method: 'POST', json: { rating, tags, comment: comment || null }, headers: headers() });
              onDone();
            } catch (e) {
              setErr(errorText(t, e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {m.tracking.sendRating}
        </Button>
      </div>
    </Card>
  );
}

function ProblemSheet({ open, onClose, onSubmit, busy, slaHours, token }: { open: boolean; onClose: () => void; onSubmit: (b: unknown) => void; busy: boolean; slaHours: number; token: string | null }) {
  const { m, locale } = useSite();
  const [reason, setReason] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  return (
    <BottomSheet open={open} onClose={onClose} label={m.tracking.problemTitle}>
      <div className="k-stack">
        <h3>{m.tracking.problemTitle}</h3>
        <RadioCards name="reason" value={reason} onChange={setReason} options={DISPUTE_REASONS.map((r) => ({ value: r.id, label: r[locale] }))} min={160} />
        <TextArea label={m.tracking.problemDesc} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} rows={3} />
        <PhotoUploader label={m.tracking.problemPhotos} value={photos} onChange={setPhotos} max={6} upload={(f, p) => uploadFile(f, 'dispute', p, token ?? undefined)} />
        <Banner tone="warning" title={fmt(m.tracking.problemNote, { hours: slaHours })} />
        <Button variant="danger" disabled={!reason} loading={busy} onClick={() => onSubmit({ reasonCode: reason, description: desc || null, evidence: photos.map((p) => p.id) })}>
          {m.tracking.submitProblem}
        </Button>
      </div>
    </BottomSheet>
  );
}

function RevisitSheet({ slug, onClose, onSubmit }: { slug: string | undefined; onClose: () => void; onSubmit: (s: Slot) => void }) {
  const { m, locale } = useSite();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [pick, setPick] = useState<Slot | null>(null);
  useEffect(() => {
    if (slug) api<Slot[]>(`/api/slots?slug=${encodeURIComponent(slug)}`).then(setSlots, () => setSlots([]));
  }, [slug]);
  return (
    <BottomSheet open onClose={onClose} label={m.tracking.revisitTitle}>
      <div className="k-stack">
        <h3>{m.tracking.revisitTitle}</h3>
        <p className="k-muted">{m.tracking.revisitBody}</p>
        {slots ? slots.length ? <SlotPicker slots={slots.slice(0, 18)} value={pick} onChange={setPick} locale={locale} /> : <Banner tone="warning" title={m.book.noSlots} /> : <span className="k-spinner" />}
        <Button variant="primary" disabled={!pick} onClick={() => pick && onSubmit(pick)}>
          {m.tracking.samProblem}
        </Button>
      </div>
    </BottomSheet>
  );
}

function ChatSheet({ bookingId, headers, onClose }: { bookingId: string; headers: () => Record<string, string>; onClose: () => void }) {
  const { m } = useSite();
  const [msgs, setMsgs] = useState<{ id: string; mine: boolean; body: string; flagged: boolean; at: string }[]>([]);
  const [text, setText] = useState('');
  const [masked, setMasked] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const r = await api<typeof msgs>(`/api/bookings/${bookingId}/messages`, { headers: headers() }).catch(() => []);
    setMsgs(r);
    setTimeout(() => end.current?.scrollIntoView({ block: 'end' }), 50);
  }, [bookingId, headers]);
  useEffect(() => {
    void load();
    const i = setInterval(load, 8000);
    return () => clearInterval(i);
  }, [load]);
  return (
    <BottomSheet open onClose={onClose} label={m.tracking.messages}>
      <div className="k-stack" style={{ gap: 8 }}>
        <h3>{m.tracking.messages}</h3>
        <div className="k-stack" style={{ gap: 6, maxHeight: '45dvh', overflow: 'auto' }}>
          {msgs.map((x) => (
            <div key={x.id} className="k-card k-tight" style={{ alignSelf: x.mine ? 'flex-start' : 'flex-end', maxWidth: '85%', background: x.mine ? 'var(--accent-soft)' : undefined }}>
              {x.body}
            </div>
          ))}
          <div ref={end} />
        </div>
        {masked && <p className="k-xs k-muted">{m.tracking.masked}</p>}
        <form
          className="k-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            const r = await api<{ masked: boolean }>(`/api/bookings/${bookingId}/messages`, { method: 'POST', json: { body: text }, headers: headers() }).catch(() => null);
            if (r?.masked) setMasked(true);
            setText('');
            void load();
          }}
        >
          <input className="k-input k-grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={m.tracking.messagePlaceholder} maxLength={1000} aria-label={m.tracking.messagePlaceholder} />
          <Button variant="primary" type="submit">
            {'➤'}
          </Button>
        </form>
      </div>
    </BottomSheet>
  );
}

function TextSheet({ open, title, label: lbl, onClose, onSubmit }: { open: boolean; title: string; label: string; onClose: () => void; onSubmit: (text: string) => void }) {
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
