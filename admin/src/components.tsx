import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Eye, RefreshCw } from 'lucide-react';
import { Banner, Button, ConfirmWithReason, Modal, SkeletonCard, StatusPill, TextField, useToast } from '@katf/ui';
import { api, errorText, post } from './lib/api';
import { useAdmin } from './App';

/** Loads data for a page; `reload` refetches after an action. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function Loaded<T>({ state, children }: { state: { data: T | null; error: unknown; loading: boolean; reload: () => void }; children: (d: T) => ReactNode }) {
  const { m, t } = useAdmin();
  if (state.error && !state.data)
    return (
      <Banner tone="danger" title={m.common.loadFailed} action={<Button size="sm" onClick={() => state.reload()}>{m.common.refresh}</Button>}>
        {errorText(t, state.error)}
      </Banner>
    );
  if (!state.data) return <SkeletonCard lines={5} />;
  return <>{children(state.data)}</>;
}

export function PageHead({ title, sub, actions, onRefresh }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; onRefresh?: () => void }) {
  const { m } = useAdmin();
  return (
    <div className="a-page-head">
      <div className="k-stack" style={{ gap: 4 }}>
        <h1>{title}</h1>
        {sub && <p className="k-muted k-small">{sub}</p>}
      </div>
      <div className="a-actions">
        {actions}
        {onRefresh && (
          <Button size="sm" variant="quiet" icon={<RefreshCw size={16} aria-hidden />} onClick={onRefresh}>
            {m.common.refresh}
          </Button>
        )}
      </div>
    </div>
  );
}

/** A button that asks for a reason (and a second confirmation for money) before calling the API. */
export function Act({
  label,
  title,
  body,
  run,
  onDone,
  money,
  danger,
  variant = 'secondary',
  size = 'sm',
  icon,
  disabled,
  children,
}: {
  label: string;
  title?: string;
  body?: ReactNode;
  run: (reason: string) => Promise<unknown>;
  onDone?: () => void;
  money?: boolean;
  danger?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const { m } = useAdmin();
  return (
    <>
      <Button variant={danger ? 'danger' : variant} size={size} icon={icon} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <ConfirmWithReason
        open={open}
        onClose={() => setOpen(false)}
        title={title ?? label}
        body={
          <>
            {body}
            {money && <Banner tone="warning" title={m.common.moneyConfirm} />}
          </>
        }
        confirmLabel={label}
        money={money}
        danger={danger}
        onConfirm={async (reason) => {
          await run(reason);
          toast(m.common.done, 'success');
          onDone?.();
        }}
      >
        {children}
      </ConfirmWithReason>
    </>
  );
}

/** Break-glass reveal of one protected field; the API logs it with the reason. */
export function Reveal({ path, field, label }: { path: string; field: string; label: string }) {
  const { m } = useAdmin();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<unknown>(undefined);
  return (
    <>
      {value === undefined ? (
        <Button size="sm" variant="quiet" icon={<Eye size={16} aria-hidden />} onClick={() => setOpen(true)}>
          {m.common.reveal}
        </Button>
      ) : (
        <span className="k-num">{typeof value === 'string' ? value : value == null ? '—' : <code className="a-pre">{JSON.stringify(value, null, 2)}</code>}</span>
      )}
      <ConfirmWithReason
        open={open}
        onClose={() => setOpen(false)}
        title={`${m.common.revealTitle}: ${label}`}
        body={<p className="k-small k-muted">{m.common.revealBody}</p>}
        confirmLabel={m.common.reveal}
        onConfirm={async (reason) => {
          const r = await post<{ value: unknown }>(path, { field, reason });
          setValue(r.value ?? null);
        }}
      />
    </>
  );
}

export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="a-kv">
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pager({ page, total, size = 50, onPage }: { page: number; total: number; size?: number; onPage: (p: number) => void }) {
  const { m, f } = useAdmin();
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="k-row k-between k-small">
      <span className="k-muted">{f(m.common.total, { n: total })}</span>
      <div className="k-row" style={{ gap: 6 }}>
        <Button size="sm" variant="quiet" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {m.common.prev}
        </Button>
        <span>{f(m.common.page, { n: `${page}/${pages}` })}</span>
        <Button size="sm" variant="quiet" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {m.common.next}
        </Button>
      </div>
    </div>
  );
}

const TONES: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'muted'> = {
  active: 'success', approved_probation: 'info', paid: 'success', done: 'success', approved: 'success', decided: 'success', closed: 'muted', answered: 'info',
  submitted: 'accent', in_review: 'info', needs_info: 'warning', pending: 'warning', open: 'warning', under_review: 'info', appealed: 'warning', held: 'warning', scheduled: 'info', in_batch: 'info',
  paused: 'warning', suspended: 'danger', banned: 'danger', rejected: 'danger', failed: 'danger', blocked: 'danger', expired: 'muted', deleted: 'muted', draft: 'muted',
};
export function Pill({ status, label }: { status: string; label?: string }) {
  return <StatusPill status={status} label={label ?? status} tone={TONES[status]} />;
}

export function Photos({ urls }: { urls: (string | null | undefined)[] }) {
  const list = urls.filter(Boolean) as string[];
  if (!list.length) return <span className="k-muted">—</span>;
  return (
    <div className="k-photos">
      {list.map((u) => (
        <a key={u} className="k-photo" href={u} target="_blank" rel="noreferrer noopener">
          <img src={u} alt="" loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/** A small form inside a modal, for actions that need values plus a reason. `money` adds a second review step. */
export function FormModal({ open, onClose, title, children, onSubmit, submitLabel, danger, money }: { open: boolean; onClose: () => void; title: string; children: ReactNode; onSubmit: () => Promise<void>; submitLabel: string; danger?: boolean; money?: boolean | string }) {
  const { m, t } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  useEffect(() => {
    if (open) {
      setErr(null);
      setReview(false);
    }
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              if (money && !review) return setReview(true);
              setBusy(true);
              setErr(null);
              try {
                await onSubmit();
                onClose();
              } catch (e) {
                setErr(errorText(t, e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {money && !review ? t('actions.continue') : submitLabel}
          </Button>
          <Button variant="quiet" onClick={money && review ? () => setReview(false) : onClose}>
            {m.common.cancel}
          </Button>
        </>
      }
    >
      <div className="k-stack">
        {money && <Banner tone="warning" title={review ? `${m.common.confirm}: ${submitLabel}` : typeof money === 'string' ? money : m.common.moneyConfirm} />}
        <fieldset disabled={review} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }} className="k-stack">
          {children}
        </fieldset>
        {err && (
          <span className="k-error" role="alert">
            {err}
          </span>
        )}
      </div>
    </Modal>
  );
}

export function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useAdmin();
  return <TextField label={t('admin.reason')} value={value} onChange={(e) => onChange(e.target.value)} maxLength={1000} required />;
}

export { api, post };
