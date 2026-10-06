import { MapPin } from 'lucide-react';
import { getMessages } from '../../lib/i18n';
import { getAreas } from '../../lib/server-api';
import { PageHead } from '../../components/Blocks';
import { Waitlist } from '../../components/Waitlist';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.areas.title };
}

export default async function AreasPage() {
  const { m, locale } = await getMessages();
  const areas = await getAreas();
  return (
    <div className="k-container k-stack" style={{ gap: 24 }}>
      <PageHead title={m.areas.title} />
      <div className="k-grid" style={{ '--min': '280px' } as React.CSSProperties}>
        {areas.filter((a) => a.active).map((a) => (
          <section key={a.wilayat} className="k-card k-stack" style={{ gap: 10 }}>
            <div className="k-row">
              <span className="k-feature-icon" aria-hidden>
                <MapPin size={22} />
              </span>
              <h2 className="k-grow">{locale === 'en' ? a.nameEn : a.nameAr}</h2>
              <span className="k-pill k-pill-success">{m.areas.active}</span>
            </div>
            <div className="k-chips">
              {a.neighbourhoods.map((n) => (
                <span key={n.id} className="k-chip" style={{ cursor: 'default' }}>
                  {locale === 'en' ? n.en : n.ar}
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section className="k-card k-stack">
        <h2>{m.areas.waitlistTitle}</h2>
        <p className="k-muted">{m.areas.waitlistBody}</p>
        <div className="k-chips">
          {areas.filter((a) => !a.active).map((a) => (
            <span key={a.wilayat} className="k-pill k-pill-muted">
              {locale === 'en' ? a.nameEn : a.nameAr} · {m.areas.soon}
            </span>
          ))}
        </div>
        <Waitlist areas={areas} />
      </section>
    </div>
  );
}
