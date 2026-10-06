import { getMessages } from '../../lib/i18n';
import { getConfig } from '../../lib/server-api';
import { PageHead } from '../../components/Blocks';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.about.title };
}

export default async function AboutPage() {
  const { m } = await getMessages();
  const s = (await getConfig()).settings;
  const v = (x: unknown) => (x ? String(x) : m.about.pending);
  return (
    <div className="k-container k-narrow k-stack" style={{ gap: 20 }}>
      <PageHead title={m.about.title} intro={m.about.body} />
      <section className="k-card k-stack" style={{ gap: 8 }}>
        <h2>{m.about.company}</h2>
        <div className="k-money-row">
          <span className="k-muted">{m.about.name}</span>
          <span>{v(s.company_name)}</span>
        </div>
        <div className="k-money-row">
          <span className="k-muted">{m.about.cr}</span>
          <span className="k-num">{v(s.cr_number)}</span>
        </div>
        <div className="k-money-row">
          <span className="k-muted">{m.about.address}</span>
          <span>{v(s.company_address)}</span>
        </div>
      </section>
    </div>
  );
}
