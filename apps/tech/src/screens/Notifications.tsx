import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '@katf/shared';
import { Button, Card, EmptyState, SkeletonCard } from '@katf/ui';
import { api } from '../lib/api';
import { useApp } from '../App';

export function Notifications() {
  const { m, locale } = useApp();
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => api<any[]>('/api/notifications').then(setRows);
  useEffect(() => {
    void load();
  }, []);
  if (!rows) return <SkeletonCard />;
  return (
    <div className="k-stack" style={{ gap: 12 }}>
      <div className="k-row k-between">
        <h1 style={{ fontSize: '1.5rem' }}>{m.notifications.title}</h1>
        {rows.some((r) => !r.read) && (
          <Button size="sm" variant="quiet" onClick={async () => (await api('/api/notifications/read', { method: 'POST', json: { ids: 'all' } }), load())}>
            {m.notifications.markAll}
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <Card><EmptyState title={m.notifications.empty} /></Card>
      ) : (
        <Card>
          <div className="k-list">
            {rows.map((n) => {
              const body = (
                <>
                  {!n.read && <span className="k-dot" aria-hidden />}
                  <span className="k-grow">{n.text}</span>
                  <span className="k-xs k-muted">{formatDateTime(Date.parse(n.at), locale)}</span>
                </>
              );
              // links point at the PWA (https://<domain>/tech/jobs/…); route inside the app instead, which
              // also works in the iPhone app where the router has no /tech prefix
              const to = n.link ? n.link.replace(/^https?:\/\/[^/]+/, '').replace(/^\/tech(?=\/|$)/, '') || '/' : null;
              return to ? (
                <Link key={n.id} className="k-list-row" to={to} style={{ fontWeight: n.read ? 400 : 600 }}>
                  {body}
                </Link>
              ) : (
                <div key={n.id} className="k-list-row" style={{ fontWeight: n.read ? 400 : 600 }}>
                  {body}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
