import type { Messages } from '../lib/i18n';
import type { PublicConfig } from '../lib/server-api';

export function Footer({ m, config, locale }: { m: Messages; config: PublicConfig; locale: 'ar' | 'en' }) {
  const s = config.settings;
  const name = String(locale === 'en' ? s.app_name_en : s.app_name);
  return (
    <footer className="k-footer">
      <div className="k-container k-grid" style={{ '--min': '200px' } as React.CSSProperties}>
        <div className="k-stack" style={{ gap: 6 }}>
          <strong style={{ color: 'var(--ink)', fontFamily: 'var(--font-head)', fontSize: '1.2rem' }}>{name}</strong>
          {s.company_name ? <span>{String(s.company_name)}</span> : null}
          {s.cr_number ? (
            <span>
              {m.footer.company}: <span className="k-num">{String(s.cr_number)}</span>
            </span>
          ) : null}
          {s.contact_email ? <span className="k-ltr">{String(s.contact_email)}</span> : null}
          {s.whatsapp_number ? (
            <span>
              WhatsApp: <span className="k-num">{String(s.whatsapp_number)}</span>
            </span>
          ) : null}
        </div>
        <nav aria-label={m.footer.legal} className="k-stack" style={{ gap: 6 }}>
          <strong style={{ color: 'var(--ink)' }}>{m.footer.legal}</strong>
          <a href="/terms">{m.footer.terms}</a>
          <a href="/privacy">{m.footer.privacy}</a>
          <a href="/cancellation">{m.footer.cancellation}</a>
          <a href="/technician-agreement">{m.footer.agreement}</a>
          <a href="/conduct">{m.footer.conduct}</a>
        </nav>
        <nav aria-label={m.nav.menu} className="k-stack" style={{ gap: 6 }}>
          <a href="/faq">{m.nav.faq}</a>
          <a href="/about">{m.nav.about}</a>
          <a href="/contact">{m.nav.contact}</a>
          <a href="/join">{m.nav.join}</a>
          <a href="/account">{m.nav.account}</a>
        </nav>
      </div>
      <div className="k-container k-xs" style={{ marginTop: 20 }}>
        © <span className="k-num">{new Date().getFullYear()}</span> {name} — {m.footer.rights}
      </div>
    </footer>
  );
}
