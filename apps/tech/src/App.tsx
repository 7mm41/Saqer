import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router';
import { Home, ClipboardList, Wallet, UserRound, Bell, Moon, Sun, Languages } from 'lucide-react';
import { I18nProvider, ToastProvider, Logo, Spinner, useTheme } from '@katf/ui';
import { commonAr, commonEn, interpolate } from '@katf/shared/i18n';
import { ar, en, type TechMessages } from './messages';
import { api } from './lib/api';
import { biometricUnlock, isNative, secureGet } from './lib/native';
import { demoActive, exitDemo } from './lib/demo';
import { Welcome } from './screens/Welcome';
import { Register } from './screens/Register';
import { Status } from './screens/Status';
import { HomeScreen } from './screens/Home';
import { Jobs } from './screens/Jobs';
import { JobDetail } from './screens/JobDetail';
import { Earnings, Statement } from './screens/Earnings';
import { LinkScreen } from './screens/Link';
import { Account, EditProfile, Schedule, Reviews, Documents } from './screens/Account';
import { Terms } from './screens/Terms';
import { Notifications } from './screens/Notifications';

export interface Me {
  id: string;
  role: string;
  name: string | null;
  locale: 'ar' | 'en';
  technicianStatus: string | null;
}

interface AppCtx {
  me: Me | null;
  m: TechMessages;
  locale: 'ar' | 'en';
  setLocale: (l: 'ar' | 'en') => void;
  config: { settings: Record<string, unknown>; rendered: Record<string, string>; vapidPublicKey: string | null; demoMode: boolean; publicOrigin?: string; banks?: unknown };
  reload: () => Promise<void>;
  f: (s: string, v: Record<string, string | number>) => string;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppCtx');
  return v;
};

const LIVE = ['approved_probation', 'active', 'paused', 'suspended'];

function Shell({ children }: { children: ReactNode }) {
  const { m, locale, setLocale, config } = useApp();
  const [theme, setTheme] = useTheme();
  const loc = useLocation();
  const hideTabs = loc.pathname.startsWith('/jobs/') || loc.pathname.startsWith('/statement');
  const name = String((locale === 'en' ? config.settings.app_name_en : config.settings.app_name) ?? 'كتف');
  return (
    <>
      {__KATF_OFFLINE_DEMO__ && demoActive() ? (
        <div className="k-demo-banner" role="status">
          {m.app.demoOffline}{' '}
          <button type="button" className="k-demo-exit" onClick={exitDemo}>
            {m.app.demoExit}
          </button>
        </div>
      ) : (
        config.demoMode && <div className="k-demo-banner">{m.app.demo}</div>
      )}
      <a href="#main" className="k-skip">
        {m.app.skip}
      </a>
      <header className="k-header">
        <div className="k-header-inner">
          <Logo name={name} size={32} />
          <span className="k-grow" />
          <NavLink to="/notifications" className="k-icon-btn" aria-label={m.notifications.title}>
            <Bell size={20} aria-hidden />
          </NavLink>
          <button type="button" className="k-icon-btn" aria-label={m.app.lang} lang={locale === 'ar' ? 'en' : 'ar'} onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
            <Languages size={20} aria-hidden />
          </button>
          <button type="button" className="k-icon-btn" aria-label={m.app.theme} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
          </button>
        </div>
      </header>
      <main id="main" className={hideTabs ? 'k-container' : 'k-container k-has-tabbar'} style={{ paddingTop: 16, paddingBottom: hideTabs ? 120 : undefined }}>
        {children}
      </main>
      {!hideTabs && (
        <nav className="k-tabbar" aria-label="tabs">
          {(
            [
              ['/home', Home, m.tabs.home],
              ['/jobs', ClipboardList, m.tabs.jobs],
              ['/earnings', Wallet, m.tabs.earnings],
              ['/account', UserRound, m.tabs.account],
            ] as const
          ).map(([to, Icon, label]) => (
            <NavLink key={to} to={to} className="k-tab" aria-current={loc.pathname.startsWith(to) ? 'page' : undefined}>
              <Icon size={22} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}

function Gate() {
  const { me } = useApp();
  if (!me) return <Welcome />;
  const st = me.technicianStatus ?? 'draft';
  return (
    <Routes>
      <Route path="/register/*" element={<Register />} />
      <Route path="/status" element={<Status />} />
      {LIVE.includes(st) ? (
        <>
          <Route path="/terms" element={<Terms />} />
          <Route path="/home" element={<Shell><HomeScreen /></Shell>} />
          <Route path="/jobs" element={<Shell><Jobs /></Shell>} />
          <Route path="/jobs/:id" element={<Shell><JobDetail /></Shell>} />
          <Route path="/earnings" element={<Shell><Earnings /></Shell>} />
          <Route path="/statement/:month" element={<Shell><Statement /></Shell>} />
          <Route path="/link" element={<Shell><LinkScreen /></Shell>} />
          <Route path="/account" element={<Shell><Account /></Shell>} />
          <Route path="/account/profile" element={<Shell><EditProfile /></Shell>} />
          <Route path="/account/schedule" element={<Shell><Schedule /></Shell>} />
          <Route path="/account/reviews" element={<Shell><Reviews /></Shell>} />
          <Route path="/account/documents" element={<Shell><Documents /></Shell>} />
          <Route path="/notifications" element={<Shell><Notifications /></Shell>} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </>
      ) : (
        <Route path="*" element={<Navigate to={['draft', 'needs_info'].includes(st) ? '/register' : '/status'} replace />} />
      )}
    </Routes>
  );
}

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [locale, setLocaleState] = useState<'ar' | 'en'>(() => {
    try {
      return (localStorage.getItem('katf.lang') as 'ar' | 'en') ?? 'ar';
    } catch {
      return 'ar';
    }
  });
  const [config, setConfig] = useState<AppCtx['config']>({ settings: {}, rendered: {}, vapidPublicKey: null, demoMode: false });
  const [locked, setLocked] = useState(false);

  const reload = useCallback(async () => {
    try {
      const u = await api<Me>('/api/me');
      setMe(u.role === 'technician' ? u : null);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void api<AppCtx['config']>('/api/config').then(setConfig, () => {});
    void (async () => {
      if ((await secureGet('biometric')) === 'on') {
        setLocked(true);
        const ok = await biometricUnlock((locale === 'en' ? en : ar).welcome.biometric);
        setLocked(!ok);
      }
      await reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const setLocale = useCallback((l: 'ar' | 'en') => {
    setLocaleState(l);
    try {
      localStorage.setItem('katf.lang', l);
    } catch {
      /* ignore */
    }
    void api('/api/account', { method: 'PATCH', json: { locale: l } }).catch(() => {});
  }, []);

  const value = useMemo<AppCtx>(() => ({ me: me ?? null, m: locale === 'en' ? (en as TechMessages) : ar, locale, setLocale, config, reload, f: interpolate as AppCtx['f'] }), [me, locale, setLocale, config, reload]);

  if (me === undefined || locked)
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <Spinner />
      </div>
    );
  return (
    <Ctx.Provider value={value}>
      <I18nProvider locale={locale} dict={(locale === 'en' ? commonEn : commonAr) as never} fallback={commonAr as never}>
        <ToastProvider>
          <BrowserRouter basename={isNative() ? '/' : '/tech'}>
            <Gate />
          </BrowserRouter>
        </ToastProvider>
      </I18nProvider>
    </Ctx.Provider>
  );
}
