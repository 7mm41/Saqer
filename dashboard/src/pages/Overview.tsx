import { get, type Stats, type User } from '../api';
import { useI18n } from '../i18n';
import { Icon } from '../icons';
import { useLive } from '../live';
import { useNav } from '../nav';
import { Loading, PageHead, Stat, useLoad } from '../ui';

export function OverviewPage({ user }: { user: User }) {
  const { t, amount, currency, number, L, lang, date } = useI18n();
  const { navigate } = useNav();
  const { data: stats, reload } = useLoad(() => get<Stats>('admin/stats'), []);
  useLive(['members', 'memberships', 'bookings', 'notifications'], () => void reload());

  if (!stats) return <Loading />;
  const topMax = Math.max(1, ...stats.topVenues.map((venue) => venue.bookings));
  const first = stats.signups[0]?.date;
  const last = stats.signups[stats.signups.length - 1]?.date;

  return (
    <>
      <PageHead title={`${t('welcome')}${lang === 'ar' ? '،' : ','} ${user.fullName.split(' ')[0]}`} hint={t('overviewHint')} />

      {!stats.pushConfigured && (
        <div className="notice small"><Icon name="bell" size={18} /><span>{t('pushNotConfigured')}</span></div>
      )}

      <div className="grid stats">
        <Stat tinted icon="crown" label={t('activeMemberships')} value={number(stats.activeMemberships)} />
        <Stat icon="users" label={t('totalMembers')} value={number(stats.members)} />
        <Stat icon="banknote" label={t('revenue30')} value={amount(stats.revenue30dBaisa)} unit={currency} />
        <Stat icon="bank" label={t('revenueTotal')} value={amount(stats.revenueTotalBaisa)} unit={currency} />
        <Stat icon="ticket" label={t('bookings30')} value={number(stats.bookings30d)} />
        <Stat icon="check" label={t('redemptions30')} value={number(stats.redemptions30d)} />
        <Stat icon="gift" label={t('memberSavings')} value={amount(stats.memberSavingsBaisa)} unit={currency} />
        <Stat icon="clock" label={t('endingSoon')} value={number(stats.membershipsEndingIn30d)} />
      </div>

      <div className="grid two">
        <section className="glass card stack">
          <div className="row between">
            <h2>{t('signups30')}</h2>
            <span className="badge green num"><Icon name="trend" size={13} />+{number(stats.newMembers30d)}</span>
          </div>
          <SignupChart points={stats.signups.map((point) => point.count)} />
          {/* Time runs left to right, as in the chart. */}
          <div className="row between muted small num" dir="ltr"><bdi>{date(first)}</bdi><bdi>{date(last)}</bdi></div>
        </section>
        <section className="glass card stack">
          <div className="row between">
            <h2>{t('topVenues')}</h2>
            <button type="button" className="btn small ghost" onClick={() => navigate('venues')}>
              {t('venues')}<Icon name="arrow" size={16} className="flip-rtl" />
            </button>
          </div>
          {stats.topVenues.length === 0 && <p className="muted">{t('empty')}</p>}
          <div className="bar-list">
            {stats.topVenues.map((venue, index) => (
              <div key={venue.venueName.en} className="bar-row">
                <div className="row between small">
                  <span className="bar-name"><span className="rank num">{number(index + 1)}</span>{L(venue.venueName)}</span>
                  <strong className="num">{number(venue.bookings)}</strong>
                </div>
                <div className="track"><div className="bar" style={{ width: `${Math.max(4, (venue.bookings / topMax) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/** A smooth area chart in SVG (no chart library), with light guide lines. */
function SignupChart({ points }: { points: number[] }) {
  const { number } = useI18n();
  const width = 600;
  const height = 160;
  const max = Math.max(1, ...points);
  const step = width / Math.max(1, points.length - 1);
  const y = (value: number) => height - 8 - (value / max) * (height - 24);
  const coords = points.map((value, index) => [index * step, y(value)] as const);
  const line = coords.map(([x, cy], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${cy.toFixed(1)}`).join(' ');
  const guides = [max, Math.round(max / 2)];
  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="signups">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F77800" stopOpacity=".32" />
            <stop offset="1" stopColor="#F77800" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFB05C" /><stop offset="1" stopColor="#E45A00" />
          </linearGradient>
        </defs>
        {[...guides, 0].map((value) => (
          <line key={value} className="grid-line" x1="0" x2={width} y1={y(value)} y2={y(value)} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={`${line} L${width},${height} L0,${height} Z`} fill="url(#area)" />
        <path d={line} fill="none" stroke="url(#stroke)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-scale num" aria-hidden>
        {guides.map((value) => <span key={value} style={{ top: `${(y(value) / height) * 100}%` }}>{number(value)}</span>)}
      </div>
    </div>
  );
}
