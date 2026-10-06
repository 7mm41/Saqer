import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { formatWindow } from '@katf/shared';
import { Card, EmptyState, Money, SkeletonCard, StatusPill, Tabs, useT } from '@katf/ui';
import { api } from '../lib/api';
import { useApp } from '../App';

export function Jobs() {
  const { m, locale } = useApp();
  const t = useT();
  const [tab, setTab] = useState<'today' | 'upcoming' | 'past'>('today');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    setRows(null);
    const h = setTimeout(() => void api<any[]>(`/api/tech/jobs?tab=${tab}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then(setRows, () => setRows([])), q ? 300 : 0);
    return () => clearTimeout(h);
  }, [tab, q]);
  return (
    <div className="k-stack" style={{ gap: 14 }}>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'today', label: m.jobs.today }, { value: 'upcoming', label: m.jobs.upcoming }, { value: 'past', label: m.jobs.past }]} />
      <label className="k-row" style={{ gap: 8 }}>
        <Search size={18} aria-hidden />
        <input className="k-input k-grow" placeholder={m.jobs.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={m.jobs.search} />
      </label>
      {!rows ? (
        <SkeletonCard />
      ) : rows.length === 0 ? (
        <Card><EmptyState title={m.jobs.empty} /></Card>
      ) : (
        <Card>
          <div className="k-list">
            {rows.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="k-list-row">
                <span className="k-stack k-grow" style={{ gap: 0 }}>
                  <span className="k-row" style={{ gap: 8 }}>
                    <strong>{locale === 'en' ? j.problemEn : j.problem}</strong>
                    <span className="k-xs k-muted k-num">{j.code}</span>
                  </span>
                  <span className="k-small k-muted">{formatWindow(Date.parse(j.window.start), Date.parse(j.window.end), locale)} · {j.area.neighbourhood[locale]}</span>
                  {tab === 'past' && j.net != null && <span className="k-small">{m.job.net}: <Money baisa={j.net} /></span>}
                </span>
                <StatusPill status={j.status} label={t(`status.${j.status}`)} />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
