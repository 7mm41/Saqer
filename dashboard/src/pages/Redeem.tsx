import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, DEMO, get, post, type Booking, type Localized, type Page } from '../api';
import { useI18n } from '../i18n';
import { Icon } from '../icons';
import { useLive } from '../live';
import { useNav } from '../nav';
import { Empty, Loading, PageHead, SearchField, StatusBadge, useDebounced, useErrorText, useLoad } from '../ui';

type Result =
  | { ok: true; booking: Booking & { offerTitle: Localized }; member: { fullName: string; memberNumber: string } }
  | { ok: false; message: string };

// Chrome/Android and recent Safari expose BarcodeDetector; elsewhere staff type the code.
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window { BarcodeDetector?: new (options: { formats: string[] }) => Detector }
}

/** Codes arrive as "SRN-AB12-CD34" or inside the QR link "sarena://redeem?code=…". */
function extractCode(raw: string) {
  const match = /code=([A-Za-z0-9-]+)/.exec(raw);
  return (match ? match[1]! : raw).trim().toUpperCase();
}

export function RedeemPage() {
  const { t, L, money, dateTime, number } = useI18n();
  const errorText = useErrorText();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { intent, clearIntent } = useNav();
  // Recent redemptions, or any code matching the search.
  const [lookup, setLookup] = useState('');
  const search = useDebounced(lookup.trim());
  const { data: recent, reload } = useLoad(() => get<Page<Booking>>(search
    ? `admin/bookings?pageSize=8&q=${encodeURIComponent(search)}`
    : 'admin/bookings?status=used&pageSize=8'), [search]);

  // Opened from search: the code is ready to redeem.
  useEffect(() => {
    if (!intent?.code) return;
    setCode(intent.code);
    setResult(null);
    input.current?.focus();
    clearIntent();
  }, [intent, clearIntent]);
  const [samples, setSamples] = useState<string[]>([]);
  const loadSamples = () => {
    if (DEMO) void import('../demo/server').then(({ demoCodes }) => setSamples(demoCodes()));
  };
  useEffect(loadSamples, []);
  useLive(['bookings'], () => { void reload(); loadSamples(); });

  const redeem = async (value: string) => {
    const normalized = extractCode(value);
    if (normalized.length < 6) return;
    setBusy(true);
    try {
      const response = await post<{ booking: Booking; member: { fullName: string; memberNumber: string } }>('admin/bookings/redeem', { code: normalized });
      setResult({ ok: true, ...response });
      setCode('');
      navigator.vibrate?.(60);
    } catch (error) {
      const message = error instanceof ApiError
        ? error.code === 'already_used' ? t('alreadyUsed') : error.code === 'expired' ? t('codeExpired') : error.code === 'not_found' ? t('codeNotFound') : errorText(error)
        : errorText(error);
      setResult({ ok: false, message });
      navigator.vibrate?.([80, 60, 80]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void redeem(code);
  };

  useEffect(() => {
    if (!scanning || !window.BarcodeDetector) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current || stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!stopped) {
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) {
            setScanning(false);
            void redeem(codes[0].rawValue);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch {
        setScanning(false);
      }
    })();
    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  return (
    <>
      <PageHead title={t('redeem')} hint={t('redeemHint')} />
      <div className="grid two top">
        <form className="glass card stack" onSubmit={submit}>
          <input ref={input} className="input code-input ltr" dir="ltr" autoFocus autoComplete="off" spellCheck={false} placeholder="SRN-XXXX-XXXX"
            value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} />
          <div className="row">
            <button className="btn primary" style={{ flex: 1 }} disabled={busy || code.trim().length < 6}><Icon name="check" size={18} />{t('redeemAction')}</button>
            {window.BarcodeDetector && (
              <button type="button" className="btn" onClick={() => setScanning((on) => !on)}><Icon name={scanning ? 'close' : 'scan'} size={18} />{scanning ? t('stopScan') : t('scan')}</button>
            )}
          </div>
          {scanning && <video ref={video} className="scanner" muted playsInline />}
          {DEMO && samples.length > 0 && (
            <div className="row small">
              <span className="muted">{t('demoCodes')}:</span>
              {samples.map((sample) => (
                <button key={sample} type="button" className="badge orange ltr num clickable-badge" onClick={() => setCode(sample)}>{sample}</button>
              ))}
            </div>
          )}
          {result && (result.ok ? (
            <div className="result ok">
              <span className="big" aria-hidden><Icon name="check" size={24} /></span>
              <div className="stack" style={{ gap: 4 }}>
                <strong>{t('redeemed')}</strong>
                <span>{result.member.fullName} · <span className="ltr num">{result.member.memberNumber}</span></span>
                <span className="muted">{L(result.booking.venueName)} · {L(result.booking.offerTitle)} × {number(result.booking.quantity)}</span>
                <span className="num"><span className="price-old">{money(result.booking.originalTotalBaisa)}</span> <span className="price-new">{money(result.booking.paidTotalBaisa)}</span></span>
              </div>
            </div>
          ) : (
            <div className="result bad"><span className="big" aria-hidden><Icon name="close" size={22} /></span><strong>{result.message}</strong></div>
          ))}
        </form>
        <section className="glass card stack">
          <h2>{t('recentRedemptions')}</h2>
          <SearchField value={lookup} onChange={setLookup} placeholder={t('searchCodeOrName')} />
          {!recent ? <Loading /> : recent.items.length === 0 ? <Empty text={search ? t('noMatches') : undefined} /> : recent.items.map((booking) => (
            <div key={booking.id} className="row between code-row">
              <div>
                {booking.status === 'active'
                  ? <button type="button" className="link-btn ltr num" onClick={() => { setCode(booking.code); setResult(null); input.current?.focus(); }}>{booking.code}</button>
                  : <strong className="ltr num">{booking.code}</strong>}
                <div className="muted small">{booking.member?.fullName} · {L(booking.venueName)}</div>
              </div>
              <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                <StatusBadge status={booking.status} />
                <span className="muted small num">{dateTime(booking.usedAt ?? booking.purchasedAt)}</span>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
