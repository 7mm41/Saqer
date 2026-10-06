import { useEffect, useState } from 'react';
import { Copy, Share2, MessageCircle } from 'lucide-react';
import { formatPercent } from '@katf/shared';
import { Banner, Button, Card, SkeletonCard, Stat, useT, useToast } from '@katf/ui';
import { api } from '../lib/api';
import { useApp } from '../App';

export function LinkScreen() {
  const { m, f } = useApp();
  const t = useT();
  const toast = useToast();
  const [l, setL] = useState<any>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    void api('/api/tech/link').then(setL, () => setErr(true));
  }, []);
  if (err) return <Banner title={m.link.notApproved} />;
  if (!l) return <SkeletonCard />;
  const text = f(m.link.shareText, { url: l.url });
  return (
    <div className="k-stack" style={{ gap: 14 }}>
      <h1 style={{ fontSize: '1.5rem' }}>{m.link.title}</h1>
      <Card float strong>
        <div className="k-stack k-center" style={{ alignItems: 'center', gap: 12 }}>
          <div style={{ width: 220, background: '#fff', padding: 12, borderRadius: 20 }} dangerouslySetInnerHTML={{ __html: l.qrSvg }} />
          <span className="k-ltr k-num k-small" style={{ wordBreak: 'break-all' }}>{l.url}</span>
          <Banner tone="success" title={f(m.link.body, { pct: formatPercent(l.ownCommissionBps) })} />
        </div>
      </Card>
      <div className="k-grid" style={{ '--min': '150px' } as React.CSSProperties}>
        <a className="k-btn k-btn-primary" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
          <MessageCircle size={18} aria-hidden /> {m.link.whatsapp}
        </a>
        <Button variant="secondary" icon={<Share2 size={18} aria-hidden />} onClick={() => (navigator.share ? navigator.share({ text, url: l.url }).catch(() => {}) : undefined)}>
          {m.link.share}
        </Button>
        <Button variant="secondary" icon={<Copy size={18} aria-hidden />} onClick={async () => (await navigator.clipboard?.writeText(l.url), toast(t('actions.copied'), 'success'))}>
          {m.link.copy}
        </Button>
      </div>
      <div className="k-grid" style={{ '--min': '150px' } as React.CSSProperties}>
        <Card tight><Stat label={m.link.own} value={<span className="k-num">{l.ownCustomers}</span>} /></Card>
        <Card tight><Stat label={m.link.repeat} value={<span className="k-num">{l.repeatCustomers}</span>} /></Card>
      </div>
    </div>
  );
}
