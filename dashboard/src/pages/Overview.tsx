import { get, type Stats, type User } from '../api';
import { useI18n } from '../i18n';
import { useLive } from '../live';
import { Loading, PageHead, Stat, useLoad } from '../ui';

export function OverviewPage({ user }: { user: User }) {
  const { t, money, number, L, lang } = useI18n();
  const { data: stats, reload } = useLoad(() => get<Stats>('admin/stats'), []);
  useLive(['members', 'memberships', 'bookings', 'notifications'], () => void reload());

  if (!stats) return <Loading />;
  const topMax = Math.max(1, ...stats.topVenues.map((venue) => venue.bookings));

  return (
    <>
      <PageHead title={`${t('welcome')}${lang === 'ar' ? '،' : ','} ${user.fullName.split(' ')[0]}`} hint={t('overviewHint')} />

      {!stats.pushConfigured && (
        <div className="glass card small" style={{ borderColor: 'rgba(255,121,0,.45)' }}>🔔 {t('pushNotConfigured')}</div>
      )}

      <div className="grid stats">
        <Stat tinted icon="👑" label={t('activeMemberships')} value={number(stats.activeMemberships)} />
        <Stat icon="👥" label={t('totalMembers')} value={`${number(stats.members)}`} />
        <Stat icon="💰" label={t('revenue30')} value={money(stats.revenue30dBaisa)} />
        <Stat icon="🏦" label={t('revenueTotal')} value={money(stats.revenueTotalBaisa)} />
        <Stat icon="🎟️" label={t('bookings30')} value={number(stats.bookings30d)} />
        <Stat icon="✅" label={t('redemptions30')} value={number(stats.redemptions30d)} />
        <Stat icon="✨" label={t('memberSavings')} value={money(stats.memberSavingsBaisa)} />
        <Stat icon="⏳" label={t('endingSoon')} value={number(stats.membershipsEndingIn30d)} />
        <Stat icon="📱" label={t('pushDevices')} value={number(stats.pushDevices)} />
      </div>

      <div className="grid two">
        <section className="glass card stack">
          <div className="row between">
            <h2>{t('signups30')}</h2>
            <span className="badge orange num">+{number(stats.newMembers30d)}</span>
          </div>
          <SignupChart points={stats.signups.map((point) => point.count)} />
        </section>
        <section className="glass card stack">
          <h2>{t('topVenues')}</h2>
          {stats.topVenues.length === 0 && <p className="muted">{t('empty')}</p>}
          <div className="bar-list">
            {stats.topVenues.map((venue) => (
              <div key={venue.venueName.en} className="stack" style={{ gap: 6 }}>
                <div className="row between small"><strong>{L(venue.venueName)}</strong><span className="num muted">{number(venue.bookings)}</span></div>
                <div className="bar" style={{ width: `${Math.max(6, (venue.bookings / topMax) * 100)}%` }} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/** A smooth area chart in SVG (no chart library). */
function SignupChart({ points }: { points: number[] }) {
  const width = 600;
  const height = 150;
  const max = Math.max(1, ...points);
  const step = width / Math.max(1, points.length - 1);
  const coords = points.map((value, index) => [index * step, height - 12 - (value / max) * (height - 30)] as const);
  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="signups">
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF7900" stopOpacity=".45" />
          <stop offset="1" stopColor="#FF7900" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFB05C" /><stop offset="1" stopColor="#E45A00" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill="url(#area)" />
      <path d={line} fill="none" stroke="url(#stroke)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
