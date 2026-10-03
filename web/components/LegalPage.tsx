import { notFound } from 'next/navigation';
import { formatDateShort } from '@katf/shared';
import { Banner } from '@katf/ui';
import { getMessages } from '../lib/i18n';
import { apiGet } from '../lib/server-api';
import { PageHead } from './Blocks';

interface Doc {
  id: string;
  title: string;
  version: string;
  body: string;
  isDraft: boolean;
  publishedAt: string;
  language: string;
  versions: { id: string; version: string; language: string; publishedAt: string | null; status: string; isDraft: boolean }[];
}

export async function LegalPage({ type }: { type: string }) {
  const { m, locale } = await getMessages();
  const doc = await apiGet<Doc>(`/api/legal/${type}?lang=${locale}`, 60);
  if (!doc) notFound();
  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 16 }}>
      <PageHead title={doc.title} />
      <div className="k-row k-small k-muted">
        <span>
          {m.legal.version} <span className="k-num">{doc.version}</span>
        </span>
        <span>·</span>
        <span>
          {m.legal.date} {formatDateShort(Date.parse(doc.publishedAt), locale)}
        </span>
      </div>
      {doc.isDraft && <Banner tone="warning" title={m.legal.draft} />}
      {locale === 'en' && doc.language === 'ar' && <Banner title={m.legal.arabicGoverns} />}
      <article className="k-card legal-body" lang={doc.language} dir={doc.language === 'ar' ? 'rtl' : 'ltr'}>
        {doc.body}
      </article>
      {doc.versions.length > 1 && (
        <section className="k-card k-stack" style={{ gap: 6 }}>
          <h2>{m.legal.earlier}</h2>
          {doc.versions.map((v) => (
            <a key={v.id} href={`/legal/${v.id}`} className="k-row k-small">
              <span className="k-num">{v.version}</span> · <span>{v.publishedAt ? formatDateShort(Date.parse(v.publishedAt), locale) : ''}</span>
              {v.status === 'published' && <span className="k-pill k-pill-success">{m.legal.current}</span>}
            </a>
          ))}
        </section>
      )}
    </div>
  );
}
