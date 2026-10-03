import type { Metadata, Viewport } from 'next';
import '@katf/ui/fonts';
import './globals.css';
import { getMessages } from '../lib/i18n';
import { getConfig } from '../lib/server-api';
import { Providers } from '../components/Providers';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';

const SITE = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';

export async function generateMetadata(): Promise<Metadata> {
  const { m, locale } = await getMessages();
  const name = locale === 'en' ? 'Katf' : 'كتف';
  return {
    metadataBase: new URL(SITE),
    title: { default: `${name} — ${m.home.promise}`, template: `%s · ${name}` },
    description: m.home.sub,
    openGraph: { type: 'website', siteName: name, title: name, description: m.home.sub, locale: locale === 'en' ? 'en_GB' : 'ar_OM' },
    twitter: { card: 'summary_large_image', title: name, description: m.home.sub },
    icons: { icon: '/icon.svg' },
    alternates: { canonical: '/' },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#EDF2F5' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1B21' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, m } = await getMessages();
  const config = await getConfig();
  return (
    <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <body>
        {config.demoMode && <div className="k-demo-banner">{locale === 'ar' ? 'بيانات تجريبية — ليست حقيقية' : 'Demo data — not real'}</div>}
        <Providers locale={locale} m={m} config={config}>
          <a href="#main" className="k-sr">
            {locale === 'ar' ? 'انتقل إلى المحتوى' : 'Skip to content'}
          </a>
          <Header />
          <main id="main">{children}</main>
          <Footer m={m} config={config} locale={locale} />
        </Providers>
      </body>
    </html>
  );
}
