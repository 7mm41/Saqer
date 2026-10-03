'use client';
import { useEffect, useState } from 'react';
import { Button, Card, TextField, Banner, LinkButton, StatusPill, useT } from '@katf/ui';
import { formatWindow } from '@katf/shared';
import { api } from '../lib/api';
import { useSite } from './Providers';
import { OtpLogin } from './OtpLogin';

/** Booking code + phone OTP → the tracking page. Signed-in customers see their bookings directly. */
export function TrackLookup() {
  const { m, locale } = useSite();
  const t = useT();
  const [code, setCode] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const loadList = () =>
    api<any[]>('/api/bookings').then(
      (r) => {
        setSignedIn(true);
        setList(r);
      },
      () => setSignedIn(false),
    );
  useEffect(() => {
    void loadList();
  }, []);
  const open = () => {
    const c = code.trim().toUpperCase();
    const found = list?.find((b) => b.code === c);
    if (found) window.location.href = `/b/${found.code}?t=${found.token}`;
    else setErr(m.track.notFound);
  };
  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 16, paddingTop: 24 }}>
      <h1>{m.track.title}</h1>
      <Card>
        <div className="k-stack">
          <TextField label={m.track.code} hint={m.track.codeHint} value={code} onChange={(e) => setCode(e.target.value)} className="k-ltr" autoCapitalize="characters" maxLength={16} />
          {signedIn === false && <OtpLogin locale={locale} phoneLabel={m.book.phone} intro={m.track.phoneStep} onDone={loadList} />}
          {signedIn && (
            <Button variant="primary" disabled={code.trim().length < 6} onClick={open}>
              {m.track.find}
            </Button>
          )}
          {err && <Banner tone="danger" title={err} />}
        </div>
      </Card>
      {list && list.length > 0 && (
        <Card title={m.account.bookings}>
          <div className="k-list">
            {list.slice(0, 10).map((b) => (
              <a key={b.id} className="k-list-row" href={`/b/${b.code}?t=${b.token}`}>
                <span className="k-num k-strong">{b.code}</span>
                <span className="k-grow k-small k-muted">{formatWindow(Date.parse(b.window.start), Date.parse(b.window.end), locale)}</span>
                <StatusPill status={b.status} label={t(`status.${b.status}`)} />
              </a>
            ))}
          </div>
        </Card>
      )}
      {signedIn && list?.length === 0 && <LinkButton href="/book" variant="primary">{m.nav.book}</LinkButton>}
    </div>
  );
}
