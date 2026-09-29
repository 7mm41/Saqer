import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, DEMO, IS_DEMO_BUILD, get, post, session, setDemo, type User } from './api';
import logo from './assets/logo.png';
import { useI18n } from './i18n';
import { Icon } from './icons';
import { startLive, stopLive, useLiveConnected } from './live';
import { NAV_GROUPS, NAV_ITEMS, NavContext, type Intent, type Route } from './nav';
import { MembersPage } from './pages/Members';
import { MembershipsPage } from './pages/Memberships';
import { NotificationsPage } from './pages/Notifications';
import { OverviewPage } from './pages/Overview';
import { PlanPage } from './pages/Plan';
import { RedeemPage } from './pages/Redeem';
import { ThemesPage } from './pages/Themes';
import { VenuesPage } from './pages/Venues';
import { ConnectAppModal } from './connect';
import { CommandPalette } from './search';
import { Loading, initials, useConfirm, useErrorText } from './ui';
import { applyAppearance, storedAppearance, type Appearance } from './appearance';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const BASE = '/admin/';

// Pages live at /admin/<page>; the standalone demo file (opened from disk or
// shared as a single page) uses #<page> instead.
const USE_HASH = !location.pathname.startsWith(BASE);

function currentRoute(): Route {
  const slug = USE_HASH
    ? location.hash.slice(1)
    : location.pathname.slice(BASE.length).split('/')[0];
  return (NAV_ITEMS.find((item) => item.route === slug)?.route) ?? 'overview';
}

// The demo needs no sign-in.
if (DEMO && !session.token) session.set('demo');

function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(storedAppearance);
  useEffect(() => applyAppearance(appearance), [appearance]);
  const isDark = appearance === 'dark'
    || (appearance === null && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
  return { isDark, toggle: () => setAppearance(isDark ? 'light' : 'dark') };
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
        if (DEMO) void import('./demo/server').then(({ startDemoActivity }) => startDemoActivity());
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
  const confirmAction = useConfirm();
  const { isDark, toggle: toggleAppearance } = useAppearance();
  const isStaff = user.role === 'staff';
  const [route, setRoute] = useState<Route>(() => (isStaff ? 'redeem' : currentRoute()));
  const [intent, setIntent] = useState<Intent>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  const navigate = useCallback((next: Route, nextIntent: Intent = null) => {
    setRoute(next);
    setIntent(nextIntent);
    setMenuOpen(false);
    try {
      if (USE_HASH) history.pushState(null, '', next === 'overview' ? location.pathname : `#${next}`);
      else history.pushState(null, '', next === 'overview' ? BASE : `${BASE}${next}`);
    } catch {
      // Some embedded viewers forbid history changes; navigation still works.
    }
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(isStaff ? 'redeem' : currentRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isStaff]);

  // Ctrl/⌘ K or "/" opens search; Esc closes the menu.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The drawer covers the page on narrow screens: keep the page from scrolling behind it.
  useEffect(() => {
    document.body.classList.toggle('no-scroll', menuOpen);
  }, [menuOpen]);

  const resetDemoData = async () => {
    if (await confirmAction(t('resetDemoConfirm'), { action: t('resetDemo') })) {
      const { resetDemo } = await import('./demo/server');
      resetDemo();
    }
  };

  const signOut = async () => {
    await post('auth/logout').catch(() => {});
    session.set(null);
  };

  const page: Route = isStaff ? 'redeem' : route;
  const current = NAV_ITEMS.find((item) => item.route === page)!;
  const groups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => !isStaff || item.staff) }))
    .filter((group) => group.items.length > 0);
  let index = 0;

  return (
    <NavContext.Provider value={{ route: page, navigate, intent, clearIntent: () => setIntent(null) }}>
      <div className={`app${menuOpen ? ' menu-open' : ''}`}>
        <aside className="sidebar" id="sidebar" aria-label={t('tagline')}>
          <div className="brand">
            <img src={logo} alt="" />
            <div>
              <strong>{lang === 'ar' ? 'سرينا' : 'Sarena'}</strong>
              <span>{t('tagline')}</span>
            </div>
            <button type="button" className="icon-btn drawer-close" aria-label={t('closeMenu')} onClick={() => setMenuOpen(false)}>
              <Icon name="close" size={18} />
            </button>
          </div>

          <nav className="nav">
            {groups.map((group) => (
              <div key={group.label} className="nav-group">
                <span className="nav-label">{t(group.label)}</span>
                {group.items.map((item) => (
                  <button key={item.route} type="button" style={{ '--i': index++ } as React.CSSProperties}
                    className={`nav-item${page === item.route ? ' active' : ''}`}
                    aria-current={page === item.route ? 'page' : undefined} onClick={() => navigate(item.route)}>
                    <Icon name={item.icon} size={19} />
                    <span>{t(item.label)}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="side-foot">
            {DEMO && (
              <div className="demo-card">
                <span className="badge orange"><Icon name="flask" size={14} /> {t('demoBadge')}</span>
                <p className="muted small">{t('demoHint')}</p>
                <button type="button" className="btn small" onClick={() => void resetDemoData()}>
                  <Icon name="refresh" size={15} /> {t('resetDemo')}
                </button>
                {!IS_DEMO_BUILD && <button type="button" className="btn small ghost" onClick={() => setDemo(false)}>{t('exitDemo')}</button>}
              </div>
            )}
            {!isStaff && (
              <button type="button" className="nav-item connect-item" onClick={() => { setMenuOpen(false); setConnectOpen(true); }}>
                <Icon name="phone" />{t('connectApp')}
              </button>
            )}
            <div className="user-row">
              <span className="avatar">{initials(user.fullName)}</span>
              <div className="user-text">
                <strong>{user.fullName}</strong>
                <span className="muted small ltr">{user.email}</span>
              </div>
            </div>
            <div className="foot-actions">
              <button type="button" className="icon-btn" title={t('language')} aria-label={t('language')} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
                <Icon name="globe" size={18} />
              </button>
              <button type="button" className="icon-btn" title={t('appearance')} aria-label={t('appearance')} onClick={toggleAppearance}>
                <Icon name={isDark ? 'sun' : 'moon'} size={18} />
              </button>
              <button type="button" className="icon-btn" title={t('signOut')} aria-label={t('signOut')} onClick={() => void signOut()}>
                <Icon name="logout" size={18} />
              </button>
            </div>
          </div>
        </aside>
        <div className="drawer-backdrop" aria-hidden="true" onClick={() => setMenuOpen(false)} />

        <div className="content">
          <header className="topbar">
            <button type="button" className="icon-btn menu-btn" aria-label={t('openMenu')} aria-controls="sidebar"
              aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
              <Icon name="menu" size={20} />
            </button>
            <div className="topbar-title">
              <Icon name={current.icon} size={18} />
              <strong>{t(current.label)}</strong>
            </div>
            <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)} aria-label={t('search')}>
              <Icon name="search" size={18} />
              <span>{t('searchAll')}</span>
              <kbd className="ltr">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
            <span className={`live-pill${connected ? ' on' : ''}`}>
              <span className="live-dot" />
              <span className="live-text">{DEMO ? t('demoLive') : connected ? t('live') : t('offline')}</span>
            </span>
          </header>

          <main className="main" key={page}>
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
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} isStaff={isStaff} />
      {connectOpen && <ConnectAppModal onClose={() => setConnectOpen(false)} />}
    </NavContext.Provider>
  );
}

function Login() {
  const { t, lang, setLang } = useI18n();
  const errorText = useErrorText();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (DEMO) {
    return (
      <div className="login">
        <div className="glass panel">
          <img className="logo" src={logo} alt="" />
          <div style={{ textAlign: 'center' }}>
            <h1>{t('appName')}</h1>
            <span className="badge orange" style={{ marginTop: 10 }}><Icon name="flask" size={14} /> {t('demoBadge')}</span>
            <p className="muted" style={{ marginTop: 10 }}>{t('demoHint')}</p>
          </div>
          <button className="btn primary" type="button" onClick={() => session.set('demo')}>{t('enterDemo')}</button>
          {!IS_DEMO_BUILD && <button className="btn ghost small" type="button" onClick={() => setDemo(false)}>{t('exitDemo')}</button>}
          <button className="btn ghost small" type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Icon name="globe" size={16} /> {t('language')}</button>
        </div>
      </div>
    );
  }

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
        <img className="logo" src={logo} alt="" />
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
        <button className="btn small" type="button" onClick={() => setDemo(true)}><Icon name="flask" size={16} /> {t('tryDemo')}</button>
        <button className="btn ghost small" type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Icon name="globe" size={16} /> {t('language')}</button>
      </form>
    </div>
  );
}
