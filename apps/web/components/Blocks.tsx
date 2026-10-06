import { ShieldCheck, BadgeCheck, Receipt, Wrench, CalendarCheck, ThumbsUp, CircleDollarSign, Snowflake } from 'lucide-react';
import type { Messages } from '../lib/i18n';
import { fmt } from '../lib/i18n';

export const TRUST_ICONS = [BadgeCheck, Receipt, ShieldCheck];
export const STEP_ICONS = [CircleDollarSign, Wrench, ThumbsUp, CalendarCheck];

export function Steps({ m }: { m: Messages }) {
  return (
    <ol className="k-steps" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {m.steps.map((s, i) => {
        const Icon = STEP_ICONS[i]!;
        return (
          <li key={i} className="k-card k-stack" style={{ gap: 10 }}>
            <div className="k-row">
              <span className="k-step-num k-num">{i + 1}</span>
              <span className="k-feature-icon" aria-hidden>
                <Icon size={22} />
              </span>
            </div>
            <h3>{s.title}</h3>
            <p className="k-muted">{s.body}</p>
          </li>
        );
      })}
    </ol>
  );
}

export function TrustBlocks({ m }: { m: Messages }) {
  return (
    <div className="k-grid" style={{ '--min': '240px' } as React.CSSProperties}>
      {m.home.trust.map((b, i) => {
        const Icon = TRUST_ICONS[i]!;
        return (
          <article key={i} className="k-card k-stack" style={{ gap: 10 }}>
            <span className="k-feature-icon" aria-hidden>
              <Icon size={24} />
            </span>
            <h3>{b.title}</h3>
            <p className="k-muted">{b.body}</p>
          </article>
        );
      })}
    </div>
  );
}

export function PageHead({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="k-stack" style={{ gap: 8, paddingBlock: '28px 8px' }}>
      <h1>{title}</h1>
      {intro && <p className="k-muted" style={{ maxWidth: '65ch' }}>{intro}</p>}
    </div>
  );
}

export function PolicyTable({ m, r }: { m: Messages; r: Record<string, string> }) {
  const vars = {
    free: r.free_cancel_minutes ?? '',
    late: r.late_cancel_fee_pct ?? '',
    otw: r.on_the_way_cancel_fee_pct ?? '',
    grace: r.arrival_grace_minutes ?? '',
    share: r.visit_only_platform_share_pct ?? '',
    wait: r.customer_wait_minutes ?? '',
    payout: r.payout_delay_hours ?? '',
  };
  return (
    <div className="k-table-wrap">
      <table className="k-table policy-table">
        <thead>
          <tr>
            <th scope="col">{m.protection.tableCase}</th>
            <th scope="col">{m.protection.tableCustomer}</th>
            <th scope="col">{m.protection.tableTech}</th>
          </tr>
        </thead>
        <tbody>
          {m.protection.rows.map((row, i) => (
            <tr key={i}>
              {row.map((c, j) => (
                <td key={j}>{fmt(c, vars)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { Snowflake };
