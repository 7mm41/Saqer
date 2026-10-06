'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, CalendarPlus, Share2 } from 'lucide-react';
import { formatWindow } from '@katf/shared';
import { Banner, Button, Card, LinkButton, Spinner } from '@katf/ui';
import { api } from '../lib/api';
import { fmt } from '../lib/fmt';
import { useSite } from './Providers';

function ics(code: string, start: number, end: number, title: string, url: string) {
  const d = (x: number) => new Date(x).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Katf//Booking//AR', 'BEGIN:VEVENT', `UID:${code}@katf`, `DTSTAMP:${d(Date.now())}`, `DTSTART:${d(start)}`, `DTEND:${d(end)}`, `SUMMARY:${title} ${code}`, `URL:${url}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

export function ReturnView({ paymentId, result }: { paymentId: string | null; result: string | null }) {
  const { m, locale } = useSite();
  const [state, setState] = useState<'checking' | 'paid' | 'failed'>('checking');
  const [last, setLast] = useState<{ id: string; code: string; token: string; slot: { start: number; end: number } | null } | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('katf-last-booking');
      if (raw) setLast(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    if (!paymentId || result !== 'success') return setState('failed');
    let tries = 0;
    const tick = async () => {
      tries++;
      const r = await api<{ status: string }>(`/api/payments/${paymentId}/sync`, { method: 'POST' }).catch(() => ({ status: 'pending' }));
      if (r.status === 'paid') setState('paid');
      else if (r.status === 'failed' || tries > 10) setState(r.status === 'failed' ? 'failed' : 'checking');
      else setTimeout(tick, 1500);
    };
    void tick();
  }, [paymentId, result]);

  const trackUrl = last ? `/b/${last.code}?t=${last.token}` : '/track';
  if (state === 'checking') return <div className="k-container k-narrow" style={{ paddingTop: 40 }}><Card><Spinner label={m.book.checking} /></Card></div>;
  if (state === 'failed')
    return (
      <div className="k-container k-narrow k-stack" style={{ paddingTop: 40 }}>
        <Banner tone="danger" title={m.book.payFailed} />
        {last && (
          <LinkButton href={trackUrl} variant="primary">
            {m.book.retryPay}
          </LinkButton>
        )}
      </div>
    );
  return (
    <div className="k-container k-narrow k-stack" style={{ paddingTop: 32, gap: 16 }}>
      <Card float strong>
        <div className="k-stack k-center" style={{ alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={56} color="var(--success)" aria-hidden />
          <h1 style={{ fontSize: '1.7rem' }}>{m.book.confirmedTitle}</h1>
          {last && <p>{fmt(m.book.confirmedBody, { code: last.code })}</p>}
          {last?.slot && <p className="k-muted">{formatWindow(last.slot.start, last.slot.end, locale)}</p>}
        </div>
      </Card>
      <div className="k-grid" style={{ '--min': '180px' } as React.CSSProperties}>
        <LinkButton href={trackUrl} variant="primary" block>
          {m.book.trackLink}
        </LinkButton>
        {last?.slot && (
          <Button
            variant="secondary"
            block
            icon={<CalendarPlus size={18} aria-hidden />}
            onClick={() => {
              const blob = new Blob([ics(last.code, last.slot!.start, last.slot!.end, m.nav.book, window.location.origin + trackUrl)], { type: 'text/calendar' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${last.code}.ics`;
              a.click();
            }}
          >
            {m.book.addCalendar}
          </Button>
        )}
        {last && (
          <Button
            variant="secondary"
            block
            icon={<Share2 size={18} aria-hidden />}
            onClick={() => {
              const url = window.location.origin + trackUrl;
              if (navigator.share) void navigator.share({ title: last.code, url }).catch(() => {});
              else void navigator.clipboard?.writeText(url);
            }}
          >
            {m.book.share}
          </Button>
        )}
      </div>
    </div>
  );
}
