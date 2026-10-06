'use client';
import { useState } from 'react';
import { Button, TextField, TextArea, Banner, useT } from '@katf/ui';
import { api, errorText } from '../lib/api';
import { useSite } from './Providers';

export function ContactForm() {
  const { m } = useSite();
  const t = useT();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (done) return <Banner tone="success" title={m.contact.sent} />;
  return (
    <form
      className="k-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api('/api/contact', { method: 'POST', json: { name, message } });
          setDone(true);
        } catch (x) {
          setErr(errorText(t, x));
        } finally {
          setBusy(false);
        }
      }}
    >
      <TextField label={m.contact.name} value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoComplete="name" />
      <TextArea label={m.contact.message} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={5} maxLength={2000} counter error={err} />
      <Button variant="primary" type="submit" loading={busy} disabled={!name || message.length < 5}>
        {m.contact.send}
      </Button>
    </form>
  );
}
