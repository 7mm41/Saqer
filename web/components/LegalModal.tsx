'use client';
import { useEffect, useState } from 'react';
import { Modal, Banner, Spinner, Button } from '@katf/ui';
import { api } from '../lib/api';

export interface LegalDoc {
  id: string;
  title: string;
  body: string;
  version: string;
  isDraft: boolean;
}

export function useLegalDoc(type: string | null, lang: 'ar' | 'en') {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  useEffect(() => {
    if (!type) return;
    let on = true;
    api<LegalDoc>(`/api/legal/${type}?lang=${lang}`).then((d) => on && setDoc(d), () => {});
    return () => {
      on = false;
    };
  }, [type, lang]);
  return doc;
}

export function LegalModal({ type, lang, open, onClose, onReadToEnd, draftLabel, closeLabel }: { type: string; lang: 'ar' | 'en'; open: boolean; onClose: () => void; onReadToEnd?: () => void; draftLabel: string; closeLabel: string }) {
  const doc = useLegalDoc(open ? type : null, lang);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={doc?.title ?? '…'}
      onReachEnd={doc ? onReadToEnd : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {closeLabel}
        </Button>
      }
    >
      {!doc ? (
        <Spinner />
      ) : (
        <div className="k-stack">
          {doc.isDraft && <Banner tone="warning" title={draftLabel} />}
          <div className="k-legal-text">{doc.body}</div>
        </div>
      )}
    </Modal>
  );
}
