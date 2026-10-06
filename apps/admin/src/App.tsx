import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router';
import {
  BarChart3,
  Banknote,
  CalendarCheck,
  CreditCard,
  FileText,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  MapPinned,
  Menu,
  MessageSquare,
  Moon,
  Route as RouteIcon,
  Scale,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Sun,
  UserCog,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { Banner, I18nProvider, Logo, Spinner, ToastProvider, useT, useTheme } from '@katf/ui';
import { commonAr, commonEn, interpolate } from '@katf/shared/i18n';
import { ar, en, type AdminMessages } from './messages';
import { api, BASE_PATH, onSessionLost, post } from './lib/api';
import { SignIn } from './pages/SignIn';
import { insideApp, leaveDemo } from './lib/demo';

export type Role = 'owner' | 'verifier' | 'support' | 'finance';
export interface Me {
  id: string;
  name: string | null;
  role: Role;
  lastSignInAt: string | null;
  lastSignInDevice: string | null;
  legalGate: boolean;
  demoMode: boolean;
}

interface Ctx {
  me: Me;
  m: AdminMessages;
  t: ReturnType<typeof useT>;
  locale: 'ar' | 'en';
  f: (s: string, v: Record<string, string | number>) => string;
  can: (roles: Role[] | 'any') => boolean;
  counts: Record<string, number>;
  refreshCounts: () => void;
}
const AdminCtx = createContext<Ctx | null>(null);
export const useAdmin = () => {
  const v = useContext(AdminCtx);
  if (!v) throw new Error('AdminCtx');
  return v;
};

type Page = { key: keyof AdminMessages['nav']; group: 'work' | 'money' | 'setup' | 'control'; icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; roles: Role[] | 'any'; el: ReturnType<typeof lazy> };
const P = (load: () => Promise<Record<string, unknown>>, name: string) => lazy(async () => ({ default: (await load())[name] as ComponentType }));
export const PAGES: Page[] = [
  { key: 'overview', group: 'work', icon: LayoutDashboard, roles: 'any', el: P(() => import('./pages/Overview'), 'Overview') },
  { key: 'applications', group: 'work', icon: UserPlus, roles: ['verifier'], el: P(() => import('./pages/Technicians'), 'Applications') },
  { key: 'technicians', group: 'work', icon: Wrench, roles: ['verifier', 'support', 'finance'], el: P(() => import('./pages/Technicians'), 'Technicians') },
  { key: 'customers', group: 'work', icon: Users, roles: ['support'], el: P(() => import('./pages/Customers'), 'Customers') },
  { key: 'bookings', group: 'work', icon: CalendarCheck, roles: ['support', 'finance'], el: P(() => import('./pages/Bookings'), 'Bookings') },
  { key: 'dispatch', group: 'work', icon: RouteIcon, roles: ['support'], el: P(() => import('./pages/Bookings'), 'Dispatch') },
  { key: 'disputes', group: 'work', icon: Scale, roles: ['support', 'finance'], el: P(() => import('./pages/Disputes'), 'Disputes') },
  { key: 'support', group: 'work', icon: LifeBuoy, roles: ['support'], el: P(() => import('./pages/Support'), 'Support') },
  { key: 'reviews', group: 'work', icon: Star, roles: ['support'], el: P(() => import('./pages/Support'), 'Reviews') },
  { key: 'payments', group: 'money', icon: CreditCard, roles: ['finance'], el: P(() => import('./pages/Money'), 'Payments') },
  { key: 'payouts', group: 'money', icon: Banknote, roles: ['finance'], el: P(() => import('./pages/Money'), 'Payouts') },
  { key: 'reports', group: 'money', icon: BarChart3, roles: ['finance'], el: P(() => import('./pages/Money'), 'Reports') },
  { key: 'catalog', group: 'setup', icon: ListChecks, roles: 'any', el: P(() => import('./pages/Setup'), 'Catalog') },
  { key: 'areas', group: 'setup', icon: MapPinned, roles: 'any', el: P(() => import('./pages/Setup'), 'Areas') },
  { key: 'legal', group: 'setup', icon: FileText, roles: 'any', el: P(() => import('./pages/Legal'), 'Legal') },
  { key: 'messaging', group: 'setup', icon: MessageSquare, roles: ['support'], el: P(() => import('./pages/Legal'), 'Messaging') },
  { key: 'settings', group: 'control', icon: SlidersHorizontal, roles: 'any', el: P(() => import('./pages/Settings'), 'Settings') },
  { key: 'staff', group: 'control', icon: UserCog, roles: [], el: P(() => import('./pages/Settings'), 'Staff') },
  { key: 'security', group: 'control', icon: ShieldCheck, roles: 'any', el: P(() => import('./pages/Settings'), 'Security') },
];
const COUNT_KEY: Partial<Record<Page['key'], string>> = { applications: 'applications', disputes: 'disputes', bookings: 'needsAdmin', payouts: 'payouts' };

function Shell({ children }: { children: ReactNode }) {
  const { me, m, locale, can, counts } = useAdmin();
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const switchLang = useContext(LangCtx);
  const groups = (['work', 'money', 'setup', 'control'] as const).map((g) => ({ g, pages: PAGES.filter((p) => p.group === g && can(p.roles)) })).filter((x) => x.pages.length);
  return (
    <>
      {__KATF_OFFLINE_DEMO__ ? (
        <div className="k-demo-banner" role="status">
          {m.app.demoOffline}
          {insideApp() && (
            <button type="button" className="k-demo-exit" onClick={leaveDemo}>
              {m.app.demoExit}
            </button>
          )}
        </div>
      ) : (
        me.demoMode && <div className="k-demo-banner">{m.app.demo}</div>
      )}
      <a href="#main" className="k-skip">
        {m.app.skip}
      </a>
      <div className="a-layout">
        <nav className="a-side" data-open={open} aria-label={m.app.menu}>
          <div className="k-row" style={{ paddingInline: 8, marginBlockEnd: 6 }}>
            <Logo name={locale === 'ar' ? 'كتف' : 'Katf'} size={34} />
            <span className="k-pill k-pill-muted">{m.app.title}</span>
          </div>
          {groups.map(({ g, pages }) => (
            <div key={g} className="k-stack" style={{ gap: 2 }}>
              <div className="a-side-group">{m.nav.groups[g]}</div>
              {pages.map((p) => {
                const Icon = p.icon;
                const n = COUNT_KEY[p.key] ? counts[COUNT_KEY[p.key]!] : 0;
                return (
                  <NavLink key={p.key} to={`/${p.key}`} className="a-nav">
                    <Icon size={18} aria-hidden />
                    {m.nav[p.key] as string}
                    {n ? <span className="a-count k-num">{n}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        {open && <div className="k-scrim" onClick={() => setOpen(false)} aria-hidden style={{ zIndex: 55 }} />}
        <div className="a-main">
          <header className="a-top">
            <button type="button" className="k-icon-btn a-menu-btn" aria-label={m.app.menu} aria-expanded={open} onClick={() => setOpen(!open)}>
              <Menu size={20} aria-hidden />
            </button>
            <div className="k-stack k-grow" style={{ gap: 0 }}>
              <strong>{me.name}</strong>
              <span className="k-xs k-muted">{m.roles[me.role]}</span>
            </div>
            {!me.legalGate && (
              <span className="k-pill k-pill-warning" title={m.app.gateClosed}>
                <ShieldAlert size={14} aria-hidden /> {m.app.gateShort}
              </span>
            )}
            <button type="button" className="k-icon-btn" aria-label={m.app.lang} onClick={switchLang}>
              <Languages size={20} aria-hidden />
            </button>
            <button type="button" className="k-icon-btn" aria-label={m.app.theme} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
            </button>
            <button
              type="button"
              className="k-icon-btn"
              aria-label={m.app.signOut}
              onClick={async () => {
                if (__KATF_OFFLINE_DEMO__) return insideApp() ? leaveDemo() : undefined;
                await post('/auth/sign-out').catch(() => {});
                window.location.assign(BASE_PATH);
              }}
            >
              <LogOut size={20} aria-hidden />
            </button>
          </header>
          {!me.legalGate && <Banner tone="warning" title={m.app.gateClosed} />}
          <main id="main" className="k-stack" style={{ gap: 16 }}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

const LangCtx = createContext<() => void>(() => {});

function Gate({ me, locale, onLost }: { me: Me; locale: 'ar' | 'en'; onLost: () => void }) {
  const t = useT();
  const m = locale === 'en' ? (en as AdminMessages) : ar;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const refreshCounts = useCallback(() => {
    void api('/overview')
      .then((o) => setCounts({ applications: o.applicationsWaiting, disputes: o.openDisputes.length, needsAdmin: o.alerts.needsAdmin, payouts: o.payoutsDue.technicians }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    onSessionLost.fn = onLost;
    refreshCounts();
    const i = setInterval(refreshCounts, 60_000);
    return () => clearInterval(i);
  }, [onLost, refreshCounts]);
  const can = useCallback((roles: Role[] | 'any') => roles === 'any' || me.role === 'owner' || roles.includes(me.role), [me.role]);
  const value = useMemo<Ctx>(() => ({ me, m, t, locale, f: interpolate as Ctx['f'], can, counts, refreshCounts }), [me, m, t, locale, can, counts, refreshCounts]);
  return (
    <AdminCtx.Provider value={value}>
      <BrowserRouter basename={BASE_PATH.replace(/\/$/, '')}>
        <Shell>
          <Suspense fallback={<Spinner />}>
            <Routes>
              {PAGES.filter((p) => can(p.roles)).map((p) => {
                const El = p.el;
                return <Route key={p.key} path={`/${p.key}/*`} element={<El />} />;
              })}
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Routes>
          </Suspense>
        </Shell>
      </BrowserRouter>
    </AdminCtx.Provider>
  );
}

export default function App() {
  const [locale, setLocale] = useState<'ar' | 'en'>(() => {
    try {
      return (localStorage.getItem('katf.admin.lang') as 'ar' | 'en') ?? 'ar';
    } catch {
      return 'ar';
    }
  });
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [lost, setLost] = useState(false);
  const load = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'));
    } catch {
      setMe(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem('katf.admin.lang', locale);
    } catch {
      /* ignore */
    }
  }, [locale]);
  const onLost = useCallback(() => {
    setLost(true);
    setMe(null);
  }, []);
  const m = locale === 'en' ? (en as AdminMessages) : ar;
  return (
    <I18nProvider locale={locale} dict={(locale === 'en' ? commonEn : commonAr) as never} fallback={commonAr as never}>
      <ToastProvider>
        <LangCtx.Provider value={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
          {me === undefined ? (
            <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
              <Spinner />
            </div>
          ) : me === null ? (
            <SignIn
              m={m}
              notice={lost ? m.signIn.sessionLost : null}
              onLang={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
              onDone={async () => {
                setLost(false);
                await load();
              }}
            />
          ) : (
            <Gate me={me} locale={locale} onLost={onLost} />
          )}
        </LangCtx.Provider>
      </ToastProvider>
    </I18nProvider>
  );
}
