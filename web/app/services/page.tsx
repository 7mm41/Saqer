import { formatOMR } from '@katf/shared';
import { LinkButton } from '@katf/ui';
import { getMessages, fmt } from '../../lib/i18n';
import { apiGet, getConfig } from '../../lib/server-api';
import { PageHead } from '../../components/Blocks';

interface Service {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  durationMin: number | null;
  priceGuideMin: number | null;
  priceGuideMax: number | null;
}

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.services.title, description: m.services.intro };
}

export default async function ServicesPage() {
  const { m, locale } = await getMessages();
  const r = (await getConfig()).rendered;
  const items = (await apiGet<Service[]>('/api/catalog', 300)) ?? [];
  const cur = locale === 'ar' ? 'ر.ع' : 'OMR';
  return (
    <div className="k-container k-stack" style={{ gap: 20 }}>
      <PageHead title={m.services.title} intro={m.services.intro} />
      <section className="k-card k-float k-row k-between">
        <div className="k-stack" style={{ gap: 4 }}>
          <h2>{m.services.visitFee}</h2>
          <p className="k-muted">{m.services.visitFeeBody}</p>
        </div>
        <span className="k-stat-value">
          <span className="k-money">{r.visit_fee}</span> <span className="k-small">{cur}</span>
        </span>
      </section>
      <div className="k-grid" style={{ '--min': '260px' } as React.CSSProperties}>
        {items.map((s) => (
          <article key={s.id} className="k-card k-stack" style={{ gap: 8 }}>
            <h3>{locale === 'en' ? s.nameEn : s.nameAr}</h3>
            {(locale === 'en' ? s.descriptionEn : s.descriptionAr) && <p className="k-muted k-small">{locale === 'en' ? s.descriptionEn : s.descriptionAr}</p>}
            <div className="k-money-row">
              <span className="k-muted">{m.services.guide}</span>
              <strong className="k-money">
                {s.priceGuideMin != null && s.priceGuideMax != null ? `${formatOMR(s.priceGuideMin)} – ${formatOMR(s.priceGuideMax)} ${cur}` : m.services.noGuide}
              </strong>
            </div>
            {s.durationMin && (
              <div className="k-money-row">
                <span className="k-muted">{m.services.duration}</span>
                <span className="k-num">{fmt(m.services.minutes, { n: s.durationMin })}</span>
              </div>
            )}
          </article>
        ))}
      </div>
      <div>
        <LinkButton href="/book" variant="primary" size="lg">
          {m.nav.book}
        </LinkButton>
      </div>
    </div>
  );
}
