import { ArrowLeft, ArrowRight, MapPin, Snowflake, ShieldCheck, Clock, Star } from 'lucide-react';
import { LinkButton } from '@katf/ui';
import { getMessages, fmt } from '../lib/i18n';
import { getAreas, getConfig, apiGet } from '../lib/server-api';
import { Steps, TrustBlocks } from '../components/Blocks';

export default async function Home() {
  const { m, locale } = await getMessages();
  const config = await getConfig();
  const areas = await getAreas();
  const catalog = (await apiGet<{ id: string; nameAr: string; nameEn: string; priceGuideMin: number | null; priceGuideMax: number | null }[]>('/api/catalog', 300)) ?? [];
  const r = config.rendered;
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: String(locale === 'en' ? config.settings.app_name_en : config.settings.app_name),
    description: m.home.sub,
    areaServed: areas.filter((a) => a.active).map((a) => (locale === 'en' ? a.nameEn : a.nameAr)),
    url: process.env.PUBLIC_ORIGIN ?? undefined,
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="k-container k-hero">
        <div className="hero-grid">
          <div className="k-stack" style={{ gap: 18 }}>
            <span className="k-pill k-pill-accent">
              <MapPin size={14} aria-hidden /> {areas.filter((a) => a.active).map((a) => (locale === 'en' ? a.nameEn : a.nameAr)).join(' · ')}
            </span>
            <h1>{m.home.promise}</h1>
            <p className="k-muted" style={{ fontSize: '1.1rem', maxWidth: '55ch' }}>
              {m.home.sub}
            </p>
            <div className="k-row">
              <LinkButton href="/book" variant="primary" size="lg" icon={<Snowflake size={20} aria-hidden />}>
                {m.home.cta}
              </LinkButton>
              <LinkButton href="/how-it-works" variant="secondary" size="lg">
                {m.home.secondary}
              </LinkButton>
            </div>
          </div>
          <div className="hero-visual" aria-hidden>
            <div className="k-card k-float k-strong k-stack" style={{ gap: 10 }}>
              <div className="k-row k-between">
                <strong>{m.home.feeTitle}</strong>
                <span className="k-pill k-pill-success">{m.home.trust[2]!.title}</span>
              </div>
              <div className="k-stat-value">
                <span className="k-money">{r.visit_fee}</span> <span className="k-small">{locale === 'ar' ? 'ر.ع' : 'OMR'}</span>
              </div>
              <p className="k-small k-muted">{fmt(m.home.feeBody, { fee: r.visit_fee ?? '' })}</p>
            </div>
            <div className="k-card k-tight k-float float-a k-row">
              <span className="k-feature-icon">
                <ShieldCheck size={22} />
              </span>
              <span className="k-small k-strong">{m.home.trust[0]!.title}</span>
            </div>
            <div className="k-card k-tight k-float float-b k-row">
              <span className="k-feature-icon">
                <Clock size={22} />
              </span>
              <span className="k-small k-strong">{m.status.on_the_way}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="k-container k-section" aria-labelledby="trust">
        <h2 id="trust" className="k-sr">
          {m.home.trust.map((x) => x.title).join(' · ')}
        </h2>
        <TrustBlocks m={m} />
      </section>

      <section className="k-container k-section k-stack" aria-labelledby="how" style={{ gap: 20 }}>
        <h2 id="how">{m.home.howTitle}</h2>
        <Steps m={m} />
      </section>

      <section className="k-container k-section" aria-labelledby="fees">
        <div className="k-grid" style={{ '--min': '300px' } as React.CSSProperties}>
          <div className="k-card k-stack">
            <h2 id="fees">{m.home.feeTitle}</h2>
            <p>{fmt(m.home.feeBody, { fee: r.visit_fee ?? '' })}</p>
            <a href="/services" className="k-row" style={{ gap: 6, fontWeight: 600 }}>
              {m.home.priceGuide} <Arrow size={16} aria-hidden />
            </a>
          </div>
          <div className="k-card k-stack">
            <h2>{m.home.areasTitle}</h2>
            <div className="k-chips">
              {areas.map((a) => (
                <span key={a.wilayat} className={`k-pill ${a.active ? 'k-pill-success' : 'k-pill-muted'}`}>
                  {locale === 'en' ? a.nameEn : a.nameAr} {a.active ? '' : `· ${m.areas.soon}`}
                </span>
              ))}
            </div>
            <a href="/areas" className="k-row" style={{ gap: 6, fontWeight: 600 }}>
              {m.home.areasSoon} <Arrow size={16} aria-hidden />
            </a>
          </div>
        </div>
      </section>

      {catalog.some((c) => c.priceGuideMin != null) && (
        <section className="k-container k-section k-stack" aria-labelledby="guide">
          <h2 id="guide">{m.home.priceGuide}</h2>
          <a href="/services">{m.nav.services}</a>
        </section>
      )}

      <section className="k-container k-section k-stack" aria-labelledby="faq" style={{ gap: 14 }}>
        <h2 id="faq">{m.home.faqTitle}</h2>
        <div className="k-grid" style={{ '--min': '300px' } as React.CSSProperties}>
          {m.faq.items.slice(0, 4).map((f, i) => (
            <details key={i} className="k-card">
              <summary className="k-strong" style={{ cursor: 'pointer' }}>
                {f.q}
              </summary>
              <p className="k-muted" style={{ marginTop: 8 }}>
                {fmt(f.a, { fee: r.visit_fee ?? '', minutes: r.free_cancel_minutes ?? '', days: r.warranty_days ?? '' })}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="k-container k-section">
        <div className="k-card k-float k-row k-between" style={{ padding: 28 }}>
          <div className="k-stack" style={{ gap: 6, maxWidth: '60ch' }}>
            <h2>{m.home.joinTitle}</h2>
            <p className="k-muted">{fmt(m.home.joinBody, { hours: r.payout_delay_hours ?? '', own: r.own_customer_commission_pct ?? '' })}</p>
          </div>
          <LinkButton href="/join" variant="secondary" size="lg" icon={<Star size={18} aria-hidden />}>
            {m.home.joinCta}
          </LinkButton>
        </div>
      </section>
    </>
  );
}
