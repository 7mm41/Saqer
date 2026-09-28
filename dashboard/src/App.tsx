import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, get, post, session, type User } from './api';
import { useI18n, type StringKey } from './i18n';
import { startLive, stopLive, useLiveConnected } from './live';
import { MembersPage } from './pages/Members';
import { MembershipsPage } from './pages/Memberships';
import { NotificationsPage } from './pages/Notifications';
import { OverviewPage } from './pages/Overview';
import { PlanPage } from './pages/Plan';
import { RedeemPage } from './pages/Redeem';
import { ThemesPage } from './pages/Themes';
import { VenuesPage } from './pages/Venues';
import { Loading, useErrorText } from './ui';

type Route = 'overview' | 'members' | 'memberships' | 'venues' | 'plan' | 'themes' | 'notifications' | 'redeem';

const NAV: { route: Route; icon: string; label: StringKey; staff?: boolean }[] = [
  { route: 'overview', icon: '✦', label: 'overview' },
  { route: 'venues', icon: '🎟️', label: 'venues' },
  { route: 'members', icon: '👥', label: 'members' },
  { route: 'memberships', icon: '👑', label: 'memberships' },
  { route: 'plan', icon: '🏷️', label: 'plan' },
  { route: 'themes', icon: '🎨', label: 'themes' },
  { route: 'notifications', icon: '🔔', label: 'notifications' },
  { route: 'redeem', icon: '📷', label: 'redeem', staff: true },
];

const BASE = '/admin/';

function currentRoute(): Route {
  const slug = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length).split('/')[0] : '';
  return (NAV.find((item) => item.route === slug)?.route) ?? 'overview';
}

export function App() {
  const [token, setToken] = useState(session.token);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => session.subscribe(() => setToken(session.token)), []);

  useEffect(() => {
    if (!token) { setUser(null); stopLive(); return; }
    let cancelled = false;
    get<{ user: User }>('me')
      .then(({ user }) => {
        if (cancelled) return;
        if (user.role === 'member') { session.set(null); return; }
        setUser(user);
        startLive();
      })
      .catch(() => { if (!cancelled) session.set(null); });
    return () => { cancelled = true; };
  }, [token]);

  if (!token) return <Login />;
  if (!user) return <Loading />;
  return <Shell user={user} />;
}

function Shell({ user }: { user: User }) {
  const { t, lang, setLang } = useI18n();
  const connected = useLiveConnected();
  const isStaff = user.role === 'staff';
  const [route, setRoute] = useState<Route>(() => (isStaff ? 'redeem' : currentRoute()));

  const navigate = useCallback((next: Route) => {
    setRoute(next);
    history.pushState(null, '', next === 'overview' ? BASE : `${BASE}${next}`);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(isStaff ? 'redeem' : currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isStaff]);

  const signOut = async () => {
    await post('auth/logout').catch(() => {});
    session.set(null);
  };

  const items = NAV.filter((item) => !isStaff || item.staff);
  const page = isStaff ? 'redeem' : route;

  return (
    <div className="shell">
      <nav className="glass sidebar" aria-label={t('tagline')}>
        <div className="brand">
          <img src="/admin/logo.png" alt="" />
          <div>
            <strong>{lang === 'ar' ? 'سرينا' : 'Sarena'}</strong>
            <span className="muted small">{t('tagline')}</span>
          </div>
        </div>
        {items.map((item) => (
          <button key={item.route} type="button" className={`nav-item${page === item.route ? ' active' : ''}`}
            aria-current={page === item.route ? 'page' : undefined} onClick={() => navigate(item.route)}>
            <span className="ico" aria-hidden>{item.icon}</span>
            {t(item.label)}
          </button>
        ))}
        <div className="spacer" />
        <div className="side-foot stack" style={{ gap: 8 }}>
          <span className="row small muted" style={{ gap: 8, padding: '0 8px' }}>
            <span className={`live-dot${connected ? ' on' : ''}`} />
            {connected ? t('live') : t('offline')}
          </span>
          <span className="small muted" style={{ padding: '0 8px' }}>{user.fullName} · {user.email}</span>
          <button type="button" className="nav-item" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
            <span className="ico" aria-hidden>🌐</span>{t('language')}
          </button>
          <button type="button" className="nav-item" onClick={() => void signOut()}>
            <span className="ico" aria-hidden>⎋</span>{t('signOut')}
          </button>
        </div>
        {/* Compact controls for phones (the footer above is hidden there). */}
        <button type="button" className="nav-item mobile-only" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>🌐</button>
        <button type="button" className="nav-item mobile-only" onClick={() => void signOut()}>⎋</button>
      </nav>
      <main className="main">
        {page === 'overview' && <OverviewPage user={user} />}
        {page === 'members' && <MembersPage />}
        {page === 'memberships' && <MembershipsPage />}
        {page === 'venues' && <VenuesPage />}
        {page === 'plan' && <PlanPage />}
        {page === 'themes' && <ThemesPage />}
        {page === 'notifications' && <NotificationsPage />}
        {page === 'redeem' && <RedeemPage />}
      </main>
    </div>
  );
}

function Login() {
  const { t, lang, setLang } = useI18n();
  const errorText = useErrorText();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await post<{ token: string; user: User }>('auth/login', { email, password });
      if (result.user.role === 'member') {
        session.set(result.token);
        await post('auth/logout').catch(() => {});
        session.set(null);
        setError(t('membersOnlyApp'));
        return;
      }
      session.set(result.token);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'invalid_credentials' ? t('wrongLogin') : errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="glass panel" onSubmit={(event) => void submit(event)}>
        <img className="logo" src="/admin/logo.png" alt="" />
        <div style={{ textAlign: 'center' }}>
          <h1>{t('appName')}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t('signInHint')}</p>
        </div>
        <label className="field">
          <span>{t('email')}</span>
          <input className="input" dir="ltr" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('password')}</span>
          <input className="input" dir="ltr" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? t('loading') : t('signIn')}</button>
        <button className="btn ghost small" type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>🌐 {t('language')}</button>
      </form>
    </div>
  );
}
