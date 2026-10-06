import { LinkButton, EmptyState } from '@katf/ui';
import { getMessages } from '../lib/i18n';

export default async function NotFound() {
  const { m } = await getMessages();
  return (
    <div className="k-container k-narrow" style={{ paddingTop: 40 }}>
      <div className="k-card">
        <EmptyState title={m.notFound.title} body={m.notFound.body} action={<LinkButton href="/" variant="primary">{m.notFound.home}</LinkButton>} />
      </div>
    </div>
  );
}
