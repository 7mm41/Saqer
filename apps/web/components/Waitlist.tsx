'use client';
import { useState } from 'react';
import { Button, PhoneField, Select, Banner, useT } from '@katf/ui';
import { api, errorText } from '../lib/api';
import { useSite } from './Providers';

export function Waitlist({ areas, defaultWilayat }: { areas: { wilayat: string; nameAr: string; nameEn: string; active: boolean }[]; defaultWilayat?: string }) {
  const { m, locale } = useSite();
  const t = useT();
  const [phone, setPhone] = useState('');
  const [wilayat, setWilayat] = useState(defaultWilayat ?? areas.find((a) => !a.active)?.wilayat ?? '');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done) return <Banner tone="success" title={m.areas.thanks} />;
  return (
    <form
      className="k-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await api('/api/waitlist', { method: 'POST', json: { phone, wilayat } });
          setDone(true);
        } catch (x) {
          setErr(errorText(t, x));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Select label={m.areas.wilayat} value={wilayat} onChange={(e) => setWilayat(e.target.value)} options={areas.filter((a) => !a.active).map((a) => ({ value: a.wilayat, label: locale === 'en' ? a.nameEn : a.nameAr }))} />
      <PhoneField label={m.areas.phone} value={phone} onChange={setPhone} error={err} />
      <Button variant="primary" type="submit" loading={busy} disabled={phone.length !== 8 || !wilayat}>
        {m.areas.submit}
      </Button>
    </form>
  );
}
