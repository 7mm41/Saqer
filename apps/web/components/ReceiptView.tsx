'use client';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { formatDateTime, formatOMR, share } from '@katf/shared';
import { Button, Card, MoneyRow, SkeletonCard, Banner, useT } from '@katf/ui';
import { api, errorText } from '../lib/api';
import { useSite } from './Providers';

/** Printable receipt; "Save as PDF" from the print dialog gives the PDF on every device. */
export function ReceiptView({ code, token }: { code: string; token: string | null }) {
  const { m, locale } = useSite();
  const t = useT();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const v = await api<any>(`/api/track/${encodeURIComponent(code)}${token ? `?t=${encodeURIComponent(token)}` : ''}`);
        const r = await api<any>(`/api/bookings/${v.id}/receipt`, { headers: token ? { 'x-track-token': token } : {} });
        setData(r);
      } catch (e) {
        setErr(errorText(t, e));
      }
    })();
  }, [code, token, t]);
  if (err) return <div className="k-container k-narrow" style={{ paddingTop: 30 }}><Banner tone="danger" title={err} /></div>;
  if (!data) return <div className="k-container k-narrow" style={{ paddingTop: 30 }}><SkeletonCard lines={6} /></div>;
  const b = data.booking;
  const paid = data.payments.reduce((s: number, p: any) => s + p.amount - p.refunded, 0);
  const vatOn = data.vat.enabled && data.vat.pct > 0;
  return (
    <div className="k-container k-narrow k-stack" style={{ paddingTop: 24, gap: 14 }}>
      <div className="k-row k-between k-no-print">
        <h1 style={{ fontSize: '1.5rem' }}>{m.tracking.receipt}</h1>
        <Button variant="secondary" icon={<Printer size={18} aria-hidden />} onClick={() => window.print()}>
          PDF
        </Button>
      </div>
      <Card>
        <div className="k-stack" style={{ gap: 4 }}>
          <strong style={{ fontSize: '1.3rem' }}>{locale === 'en' ? data.company.appNameEn : data.company.appName}</strong>
          {data.company.name && <span>{data.company.name}</span>}
          {data.company.cr && <span className="k-small">CR <span className="k-num">{data.company.cr}</span></span>}
          {data.company.address && <span className="k-small k-muted">{data.company.address}</span>}
        </div>
        <hr className="k-divider" />
        <div className="k-money-row"><span className="k-muted">{m.track.code}</span><strong className="k-num">{b.code}</strong></div>
        <div className="k-money-row"><span className="k-muted">{m.book.summary}</span><span>{b.problem[locale]}</span></div>
        {data.payments.map((p: any, i: number) => (
          <div key={i} className="k-money-row k-small">
            <span className="k-muted">{p.paidAt ? formatDateTime(Date.parse(p.paidAt), locale) : ''}</span>
            <span className="k-money">{formatOMR(p.amount)}</span>
          </div>
        ))}
        <hr className="k-divider" />
        {b.quote?.items?.map((it: any, i: number) => <MoneyRow key={i} label={`${it.label}${it.qty > 1 ? ` × ${it.qty}` : ''}`} baisa={it.amount} />)}
        {!b.quote && <MoneyRow label={m.services.visitFee} baisa={b.money.visitFee} />}
        {b.money.refunded > 0 && <MoneyRow label={m.tracking.cancelPreview.replace('{refund}', '').replace('ر.ع', '').trim()} baisa={b.money.refunded} negative />}
        {vatOn && <MoneyRow label={`VAT ${data.vat.pct / 100}%`} baisa={share(paid, data.vat.pct)} />}
        <MoneyRow label={m.tracking.total} baisa={paid} total />
      </Card>
    </div>
  );
}
