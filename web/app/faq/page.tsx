import { getMessages, fmt } from '../../lib/i18n';
import { getConfig } from '../../lib/server-api';
import { PageHead } from '../../components/Blocks';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.faq.title };
}

export default async function FaqPage() {
  const { m } = await getMessages();
  const r = (await getConfig()).rendered;
  const vars = { fee: r.visit_fee ?? '', minutes: r.free_cancel_minutes ?? '', days: r.warranty_days ?? '' };
  const items = m.faq.items.map((f) => ({ q: f.q, a: fmt(f.a, vars) }));
  const jsonLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })) };
  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 12 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHead title={m.faq.title} />
      {items.map((f, i) => (
        <details key={i} className="k-card" open={i === 0}>
          <summary className="k-strong" style={{ cursor: 'pointer' }}>
            {f.q}
          </summary>
          <p className="k-muted" style={{ marginTop: 8 }}>
            {f.a}
          </p>
        </details>
      ))}
    </div>
  );
}
