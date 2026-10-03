import { notFound } from 'next/navigation';
import { Banner } from '@katf/ui';
import { getMessages } from '../../../lib/i18n';
import { apiGet } from '../../../lib/server-api';
import { PageHead } from '../../../components/Blocks';

export default async function LegalVersion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { m } = await getMessages();
  const d = await apiGet<{ title: string; version: string; body: string; isDraft: boolean }>(`/api/legal/version/${id}`, 300);
  if (!d) notFound();
  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 16 }}>
      <PageHead title={`${d.title} — ${m.legal.version} ${d.version}`} />
      {d.isDraft && <Banner tone="warning" title={m.legal.draft} />}
      <article className="k-card legal-body">{d.body}</article>
    </div>
  );
}
