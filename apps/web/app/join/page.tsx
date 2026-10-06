import { CheckCircle2, FileText, Wallet, Banknote } from 'lucide-react';
import { formatOMR, share } from '@katf/shared';
import { LinkButton, Banner } from '@katf/ui';
import { getMessages, fmt } from '../../lib/i18n';
import { getConfig } from '../../lib/server-api';
import { PageHead } from '../../components/Blocks';

const TECH_URL = process.env.TECH_PUBLIC_URL ?? '/tech/';

export async function generateMetadata() {
  const { m } = await getMessages();
  return { title: m.join.title, description: m.join.intro };
}

export default async function JoinPage() {
  const { m } = await getMessages();
  const config = await getConfig();
  const s = config.settings;
  const r = config.rendered;
  const job = 20000;
  const net = job - share(job, Number(s.commission_pct));
  const ownNet = job - share(job, Number(s.own_customer_commission_pct));
  return (
    <div className="k-container k-stack" style={{ gap: 24 }}>
      <PageHead title={m.join.title} intro={m.join.intro} />
      {!s.legal_gate_cleared && <Banner tone="info" title={m.join.closed} />}
      <div className="k-grid" style={{ '--min': '280px' } as React.CSSProperties}>
        <section className="k-card k-stack">
          <h2 className="k-row">
            <CheckCircle2 aria-hidden /> {m.join.who}
          </h2>
          <ul className="k-stack" style={{ gap: 6, margin: 0, paddingInlineStart: 20 }}>
            {m.join.whoList.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
        <section className="k-card k-stack">
          <h2 className="k-row">
            <FileText aria-hidden /> {m.join.docs}
          </h2>
          <ul className="k-stack" style={{ gap: 6, margin: 0, paddingInlineStart: 20 }}>
            {m.join.docsList.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      </div>
      <section className="k-card k-float k-stack">
        <h2 className="k-row">
          <Wallet aria-hidden /> {m.join.earn}
        </h2>
        <p>{fmt(m.join.earnBody, { pct: r.commission_pct ?? '', net: formatOMR(net), own: r.own_customer_commission_pct ?? '', ownNet: formatOMR(ownNet) })}</p>
        <p className="k-muted">{fmt(m.join.visit, { share: r.visit_only_platform_share_pct ?? '' })}</p>
        <p className="k-row" style={{ gap: 8 }}>
          <Banknote size={18} aria-hidden /> {fmt(m.join.payout, { hours: r.payout_delay_hours ?? '' })}
        </p>
      </section>
      <div>
        <LinkButton href={`${TECH_URL}register`} variant="primary" size="lg">
          {m.join.start}
        </LinkButton>
      </div>
    </div>
  );
}
