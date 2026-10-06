'use client';
import { useState } from 'react';
import { Menu, Moon, Sun, X, Languages } from 'lucide-react';
import { LinkButton, Logo, useTheme } from '@katf/ui';
import { useSite } from './Providers';

export function Header() {
  const { m, locale, config } = useSite();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const name = String((locale === 'en' ? config.settings.app_name_en : config.settings.app_name) ?? 'كتف');
  const links: [string, string][] = [
    ['/how-it-works', m.nav.how],
    ['/services', m.nav.services],
    ['/protection', m.nav.protection],
    ['/areas', m.nav.areas],
    ['/join', m.nav.join],
    ['/track', m.nav.track],
  ];
  return (
    <header className="k-header">
      <div className="k-header-inner">
        <a href="/" aria-label={name} style={{ textDecoration: 'none' }}>
          <Logo name={name} />
        </a>
        <nav aria-label={m.nav.menu} className="k-grow site-nav">
          {links.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <a
          className="k-icon-btn"
          href={`/lang?to=${locale === 'ar' ? 'en' : 'ar'}`}
          aria-label={m.nav.lang}
          title={m.nav.lang}
          onClick={(e) => {
            // keep the current page (and its query, e.g. a tracking token) after switching
            e.preventDefault();
            window.location.href = `/lang?to=${locale === 'ar' ? 'en' : 'ar'}&next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          }}
        >
          <Languages size={20} aria-hidden />
        </a>
        <button type="button" className="k-icon-btn hide-sm" aria-label={m.nav.theme} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
        </button>
        <LinkButton href="/book" variant="primary" size="sm" className="hide-sm">
          {m.nav.book}
        </LinkButton>
        <button type="button" className="k-icon-btn show-sm" aria-expanded={open} aria-label={m.nav.menu} onClick={() => setOpen(!open)}>
          {open ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
        </button>
      </div>
      {open && (
        <nav aria-label={m.nav.menu} className="mobile-nav">
          {links.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
          <a href="/account">{m.nav.account}</a>
          <button type="button" className="k-btn k-btn-quiet" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />} {m.nav.theme}
          </button>
          <LinkButton href="/book" variant="primary" block>
            {m.nav.book}
          </LinkButton>
        </nav>
      )}
    </header>
  );
}
