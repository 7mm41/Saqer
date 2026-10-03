import { LinkButton } from '@katf/ui';
import { getMessages, fmt } from '../../lib/i18n';
import { getConfig } from '../../lib/server-api';
import { PageHead, Steps } from '../../components/Blocks';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.how.title, description: m.how.intro };
}

export default async function HowPage() {
  const { m } = await getMessages();
  const r = (await getConfig()).rendered;
  return (
    <div className="k-container k-stack" style={{ gap: 24 }}>
      <PageHead title={m.how.title} intro={m.how.intro} />
      <Steps m={m} />
      <section className="k-card k-stack">
        <h2>{m.how.moneyTitle}</h2>
        <ol className="k-stack" style={{ gap: 8, paddingInlineStart: 20, margin: 0 }}>
          {m.how.money.map((line, i) => (
            <li key={i}>{fmt(line, { fee: r.visit_fee ?? '', hours: r.auto_confirm_hours ?? '' })}</li>
          ))}
        </ol>
      </section>
      <div>
        <LinkButton href="/book" variant="primary" size="lg">
          {m.nav.book}
        </LinkButton>
      </div>
    </div>
  );
}
