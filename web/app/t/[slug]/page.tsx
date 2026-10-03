import { notFound } from 'next/navigation';
import { MapPin, Wrench, Clock } from 'lucide-react';
import { label, TECH_SERVICES, EXPERIENCE_BANDS, AC_TYPES, formatDateShort } from '@katf/shared';
import { LinkButton, VerifiedBadge, Rating, Banner } from '@katf/ui';
import { getMessages, fmt } from '../../../lib/i18n';
import { apiGet, getAreas } from '../../../lib/server-api';

interface PublicTech {
  slug: string;
  name: string;
  photoUrl: string | null;
  rating: number | null;
  ratingCount: number;
  jobs: number;
  experienceBand: string | null;
  services: string[];
  acTypes: string[];
  areas: { wilayat: string; neighbourhoods: string[] }[];
  bio: string | null;
  workPhotos: string[];
  bookable: boolean;
  vacationUntil: string | null;
  reviews: { rating: number; comment: string | null; tags: string[]; reply: string | null; createdAt: string }[];
}

async function load(slug: string) {
  return apiGet<PublicTech>(`/api/technicians/${encodeURIComponent(slug)}`, 30);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await load(slug);
  const { m } = await getMessages();
  if (!t) return { title: m.notFound.title };
  return { title: `${t.name} — ${m.tech.verified}`, description: t.bio ?? undefined, openGraph: { images: t.photoUrl ? [t.photoUrl] : [] } };
}

export default async function TechPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { m, locale } = await getMessages();
  const t = await load(slug);
  if (!t) notFound();
  const areas = await getAreas();
  const L = locale;
  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 18, paddingTop: 20 }}>
      <section className="k-card k-float k-stack" style={{ gap: 14 }}>
        <div className="k-row" style={{ gap: 16, alignItems: 'flex-start' }}>
          {t.photoUrl ? <img className="k-avatar k-avatar-lg" src={t.photoUrl} alt="" /> : <div className="k-avatar k-avatar-lg" aria-hidden />}
          <div className="k-stack k-grow" style={{ gap: 4 }}>
            <h1 style={{ fontSize: '1.6rem' }}>{t.name}</h1>
            <VerifiedBadge label={m.tech.verified} />
            <div className="k-row k-small">
              {t.rating ? (
                <>
                  <Rating value={t.rating} size={22} /> <span className="k-num">{t.rating.toFixed(1)}</span> <span className="k-muted">({t.ratingCount})</span>
                </>
              ) : (
                <span className="k-muted">{m.tech.noRatings}</span>
              )}
              <span className="k-muted">· {fmt(m.tech.jobs, { n: t.jobs })}</span>
            </div>
          </div>
        </div>
        {t.bio && <p>{t.bio}</p>}
        {t.bookable ? (
          <LinkButton href={`/book?t=${encodeURIComponent(t.slug)}`} variant="primary" size="lg" block>
            {fmt(m.tech.book, { name: t.name })}
          </LinkButton>
        ) : (
          <div className="k-stack">
            <Banner tone="warning" title={t.vacationUntil ? fmt(m.tech.vacation, { date: formatDateShort(Date.parse(t.vacationUntil), L) }) : m.tech.unavailable} />
            <LinkButton href="/book" variant="secondary" block>
              {m.tech.other}
            </LinkButton>
          </div>
        )}
      </section>
      <section className="k-card k-stack" style={{ gap: 10 }}>
        {t.experienceBand && (
          <p className="k-row">
            <Clock size={18} aria-hidden /> <span className="k-muted">{m.tech.experience}:</span> {label(EXPERIENCE_BANDS, t.experienceBand, L)}
          </p>
        )}
        <div className="k-stack" style={{ gap: 6 }}>
          <span className="k-row k-muted">
            <Wrench size={18} aria-hidden /> {m.tech.services}
          </span>
          <div className="k-chips">
            {t.services.map((s) => (
              <span key={s} className="k-chip" style={{ cursor: 'default' }}>
                {label(TECH_SERVICES, s, L)}
              </span>
            ))}
            {t.acTypes.map((s) => (
              <span key={s} className="k-chip" style={{ cursor: 'default' }}>
                {label(AC_TYPES, s, L)}
              </span>
            ))}
          </div>
        </div>
        <div className="k-stack" style={{ gap: 6 }}>
          <span className="k-row k-muted">
            <MapPin size={18} aria-hidden /> {m.tech.areas}
          </span>
          <div className="k-chips">
            {t.areas.map((a) => {
              const area = areas.find((x) => x.wilayat === a.wilayat);
              return (
                <span key={a.wilayat} className="k-chip" style={{ cursor: 'default' }}>
                  {area ? (L === 'en' ? area.nameEn : area.nameAr) : a.wilayat}
                </span>
              );
            })}
          </div>
        </div>
      </section>
      {t.workPhotos.length > 0 && (
        <section className="k-card k-stack">
          <h2>{m.tech.work}</h2>
          <div className="k-photos">
            {t.workPhotos.map((u, i) => (
              <div className="k-photo" key={i}>
                <img src={u} alt="" loading="lazy" />
              </div>
            ))}
          </div>
        </section>
      )}
      {t.reviews.length > 0 && (
        <section className="k-card k-stack">
          <h2>{m.tech.reviews}</h2>
          {t.reviews.map((r, i) => (
            <div key={i} className="k-stack" style={{ gap: 4, borderBottom: '1px solid var(--hairline)', paddingBottom: 10 }}>
              <Rating value={r.rating} size={22} />
              {r.comment && <p>{r.comment}</p>}
              {r.reply && <p className="k-small k-muted">↳ {r.reply}</p>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
