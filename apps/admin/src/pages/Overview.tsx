import { Link } from 'react-router';
import { AlertTriangle, Banknote, FileWarning, Scale, UserPlus } from 'lucide-react';
import { Banner, Card, Money, Stat } from '@katf/ui';
import { api, Loaded, PageHead, useLoad } from '../components';
import { useAdmin } from '../App';
import { hoursFromNow } from '../lib/fmt';

export function Overview() {
  const { m, f, t, can } = useAdmin();
  const s = useLoad(() => api('/overview'));
  return (
    <>
      <PageHead title={m.overview.title} onRefresh={s.reload} />
      <Loaded state={s}>
        {(o) => {
          const e = o.experiment;
          const oldest = o.oldestApplication ? -(hoursFromNow(o.oldestApplication) ?? 0) : null;
          return (
            <>
              {(o.alerts.failedPayments > 0 || o.alerts.needsAdmin > 0) && (
                <Banner tone="danger" icon={<AlertTriangle size={18} aria-hidden />} title={`${m.overview.failedPayments}: ${o.alerts.failedPayments} · ${m.overview.needsAdmin}: ${o.alerts.needsAdmin}`} action={can(['support', 'finance']) ? <Link className="k-btn k-btn-sm k-btn-secondary" to="/bookings?needsAdmin=1">{m.nav.bookings}</Link> : undefined} />
              )}
              {o.outOfDateDocuments?.length > 0 && <Banner tone="warning" icon={<FileWarning size={18} aria-hidden />} title={m.overview.outOfDate} action={<Link className="k-btn k-btn-sm k-btn-secondary" to="/legal">{m.nav.legal}</Link>} />}

              <div className="k-grid" style={{ '--min': '200px' } as React.CSSProperties}>
                <Card tight>
                  <Stat label={m.overview.bookings} value={<span className="k-num">{o.today.bookings}</span>} />
                </Card>
                <Card tight>
                  <Stat label={m.overview.gmv} value={<Money baisa={o.today.gmv} />} />
                </Card>
                <Card tight>
                  <Stat label={m.overview.refunds} value={<Money baisa={o.today.refunds} />} />
                </Card>
                <Card tight>
                  <Stat label={m.overview.commission} value={<Money baisa={o.commissionToDate} />} />
                </Card>
              </div>

              <div className="k-grid" style={{ '--min': '240px' } as React.CSSProperties}>
                <Card title={m.overview.applications} icon={<UserPlus size={18} aria-hidden />} actions={can(['verifier']) ? <Link to="/applications" className="k-btn k-btn-sm k-btn-quiet">{m.common.open}</Link> : undefined}>
                  <div className="k-stat-value k-num">{o.applicationsWaiting}</div>
                  {oldest != null && <span className={oldest > 48 ? 'k-small' : 'k-small k-muted'} style={oldest > 48 ? { color: 'var(--danger)' } : undefined}>{f(m.overview.oldest, { n: oldest })}</span>}
                </Card>
                <Card title={m.overview.payoutsDue} icon={<Banknote size={18} aria-hidden />} actions={can(['finance']) ? <Link to="/payouts" className="k-btn k-btn-sm k-btn-quiet">{m.common.open}</Link> : undefined}>
                  <div className="k-stack" style={{ gap: 4 }}>
                    <span className="k-stat-value">
                      <Money baisa={o.payoutsDue.amount} />
                    </span>
                    <span className="k-small k-muted">{f(m.overview.payoutsDueBody, { n: o.payoutsDue.technicians })}</span>
                  </div>
                </Card>
                <Card title={m.overview.disputes} icon={<Scale size={18} aria-hidden />} actions={can(['support', 'finance']) ? <Link to="/disputes" className="k-btn k-btn-sm k-btn-quiet">{m.common.open}</Link> : undefined}>
                  <div className="k-stat-value k-num">{o.openDisputes.length}</div>
                  {o.openDisputes.slice(0, 3).map((d: any) => {
                    const h = hoursFromNow(d.slaDueAt) ?? 0;
                    return (
                      <span key={d.id} className="k-small" style={{ color: h < 0 ? 'var(--danger)' : undefined }}>
                        {h < 0 ? f(m.common.overdue, { n: -h }) : f(m.common.dueIn, { n: h })}
                      </span>
                    );
                  })}
                </Card>
                <Card title={m.overview.docsExpiring} icon={<FileWarning size={18} aria-hidden />}>
                  <div className="k-stat-value k-num">{o.documentsExpiring}</div>
                </Card>
              </div>

              <Card title={m.overview.experiment} strong>
                <p className="k-small k-muted" style={{ marginBlockEnd: 12 }}>
                  {m.overview.experimentBody}
                </p>
                <div className="a-bar" style={{ marginBlockEnd: 16 }}>
                  <span className="k-small">
                    {m.overview.paidServices}: <strong className="k-num">{e.paidServices}</strong>
                  </span>
                  <div className="a-bar-track" role="progressbar" aria-valuenow={e.paidServices} aria-valuemin={0} aria-valuemax={e.target} aria-label={m.overview.paidServices}>
                    <div className="a-bar-fill" style={{ inlineSize: `${Math.min(100, (e.paidServices / e.target) * 100)}%` }} />
                  </div>
                  <span className="k-small k-muted">{f(m.overview.target, { n: e.target })}</span>
                </div>
                <div className="k-grid" style={{ '--min': '180px' } as React.CSSProperties}>
                  <Stat label={m.overview.repeat} value={<span className="k-num">{`${e.techniciansWithRepeatCustomers} / ${e.techniciansWithJobs}`}</span>} />
                  <Stat label={m.overview.margin} value={<Money baisa={e.averagePlatformMargin} />} />
                  <Stat label={m.overview.payoutHours} value={<span className="k-num">{e.averageHoursToPayout ?? '—'}</span>} />
                  <Stat label={m.overview.disputeRate} value={<span className="k-num">{`${e.disputeRate}%`}</span>} />
                  <Stat label={m.overview.flaggedChats} value={<span className="k-num">{e.flaggedChats}</span>} />
                </div>
              </Card>

              {Object.keys(o.today.byStatus).length > 0 && (
                <Card title={m.overview.byStatus}>
                  <div className="k-chips">
                    {Object.entries(o.today.byStatus).map(([k, v]) => (
                      <span key={k} className="k-chip">
                        {t(`status.${k}`)} · <span className="k-num">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                </Card>
              )}
            </>
          );
        }}
      </Loaded>
    </>
  );
}
