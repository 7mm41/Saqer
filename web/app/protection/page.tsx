import { ShieldCheck, RotateCcw, Wrench, Flag } from 'lucide-react';
import { getMessages, fmt } from '../../lib/i18n';
import { getConfig } from '../../lib/server-api';
import { PageHead, PolicyTable } from '../../components/Blocks';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.protection.title };
}

export default async function ProtectionPage() {
  const { m } = await getMessages();
  const r = (await getConfig()).rendered;
  const blocks = [
    [ShieldCheck, m.protection.held],
    [RotateCcw, m.protection.refund],
    [Wrench, m.protection.warranty],
    [Flag, m.protection.report],
  ] as const;
  const vars = { hours: r.auto_confirm_hours ?? '', days: r.warranty_days ?? '' };
  return (
    <div className="k-container k-stack" style={{ gap: 24 }}>
      <PageHead title={m.protection.title} />
      <div className="k-grid" style={{ '--min': '240px' } as React.CSSProperties}>
        {blocks.map(([Icon, b], i) => (
          <article key={i} className="k-card k-stack" style={{ gap: 8 }}>
            <span className="k-feature-icon" aria-hidden>
              <Icon size={22} />
            </span>
            <h3>{fmt(b.title, vars)}</h3>
            <p className="k-muted">{fmt(b.body, i === 3 ? { hours: r.dispute_sla_hours ?? '' } : vars)}</p>
          </article>
        ))}
      </div>
      <section className="k-stack" style={{ gap: 12 }}>
        <h2>{m.protection.tableTitle}</h2>
        <PolicyTable m={m} r={r} />
        <a href="/cancellation" className="k-strong">
          {m.protection.fullPolicy}
        </a>
      </section>
    </div>
  );
}
