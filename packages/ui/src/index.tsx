'use client';
/**
 * Katf components — built once and used by the website, the technician app and the admin panel (§14).
 */
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { BadgeCheck, Camera, Check, ChevronDown, ChevronUp, Inbox, RotateCcw, Star, X } from 'lucide-react';
import { formatOMR, normaliseDigits } from '@katf/shared';
import { makeT, type Dict, type T } from '@katf/shared/i18n';


const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- i18n

interface I18nValue {
  locale: 'ar' | 'en';
  t: T;
  dir: 'rtl' | 'ltr';
}
const I18n = createContext<I18nValue>({ locale: 'ar', t: (k) => k, dir: 'rtl' });

export function I18nProvider({ locale, dict, fallback, children }: { locale: 'ar' | 'en'; dict: Dict; fallback?: Dict; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(dict, fallback), dir: locale === 'ar' ? ('rtl' as const) : ('ltr' as const) }), [locale, dict, fallback]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}
export const useI18n = () => useContext(I18n);
export const useT = () => useContext(I18n).t;

// ---------------------------------------------------------------- buttons

type BtnVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', block, loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cx('k-btn', `k-btn-${variant}`, size !== 'md' && `k-btn-${size}`, block && 'k-btn-block', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="k-spinner" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({ href, variant = 'secondary', size = 'md', block, icon, children, className, ...rest }: { href: string; variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; block?: boolean; icon?: ReactNode; children: ReactNode; className?: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href} className={cx('k-btn', `k-btn-${variant}`, size !== 'md' && `k-btn-${size}`, block && 'k-btn-block', className)} {...rest}>
      {icon}
      {children}
    </a>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" className="k-row" style={{ gap: 8 }}>
      <span className="k-spinner" aria-hidden />
      {label && <span className="k-muted">{label}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- fields

interface FieldShell {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  id?: string;
}

function FieldWrap({ label, hint, error, id, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="k-field">
      {label && (
        <label className="k-label" htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {hint && !error && (
        <span className="k-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="k-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export const TextField = forwardRef<HTMLInputElement, FieldShell & InputHTMLAttributes<HTMLInputElement>>(function TextField({ label, hint, error, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} id={fid}>
      <input
        ref={ref}
        id={fid}
        className={cx('k-input', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
        {...rest}
      />
    </FieldWrap>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement> & { counter?: boolean }>(function TextArea({ label, hint, error, id, className, counter, maxLength, value, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  const len = typeof value === 'string' ? value.length : 0;
  return (
    <FieldWrap label={label} hint={counter && maxLength ? `${len} / ${maxLength}` : hint} error={error} id={fid}>
      <textarea ref={ref} id={fid} className={cx('k-textarea', className)} maxLength={maxLength} value={value} aria-invalid={error ? true : undefined} aria-describedby={error ? `${fid}-error` : undefined} {...rest} />
    </FieldWrap>
  );
});

export function Select({ label, hint, error, id, options, placeholder, className, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string; disabled?: boolean }[]; placeholder?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} id={fid}>
      <select id={fid} className={cx('k-select', className)} aria-invalid={error ? true : undefined} {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}

/** +968 and 8 digits (§6 step 1). Arabic-Indic digits are converted as you type. */
export function PhoneField({ label, hint, error, value, onChange, id, autoFocus }: FieldShell & { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap label={label} hint={hint} error={error} id={fid}>
      <div className="k-phone">
        <span className="k-phone-prefix" aria-hidden>
          +968
        </span>
        <input
          id={fid}
          className="k-input"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={8}
          autoFocus={autoFocus}
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(normaliseDigits(e.target.value).replace(/\D/g, '').slice(0, 8))}
          placeholder="9XXXXXXX"
        />
      </div>
    </FieldWrap>
  );
}

/** Six boxes, auto-advance, paste and SMS autofill (one-time-code). */
export function OtpField({ length = 6, value, onChange, onComplete, error, label }: { length?: number; value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; error?: string | null; label?: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const set = (v: string) => {
    const clean = normaliseDigits(v).replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    refs.current[Math.min(clean.length, length - 1)]?.focus();
  };
  return (
    <div className="k-field">
      {label && <span className="k-label">{label}</span>}
      <div className="k-otp" role="group" aria-label={label}>
        {Array.from({ length }).map((_, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`${i + 1}`}
            maxLength={length}
            value={value[i] ?? ''}
            autoFocus={i === 0}
            onChange={(e) => {
              const v = normaliseDigits(e.target.value).replace(/\D/g, '');
              if (v.length > 1) return set(v);
              set((value.slice(0, i) + v + value.slice(i + 1)).slice(0, length));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !value[i] && i > 0) {
                set(value.slice(0, i - 1));
                refs.current[i - 1]?.focus();
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              set(e.clipboardData.getData('text'));
            }}
          />
        ))}
      </div>
      {error && (
        <span className="k-error k-center" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Checkbox({ checked, onChange, children, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean; id?: string }) {
  const auto = useId();
  return (
    <label className="k-check" htmlFor={id ?? auto} aria-disabled={disabled || undefined}>
      <input id={id ?? auto} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function RadioCards<V extends string>({ name, value, onChange, options, min, legend }: { name: string; value: V | null; onChange: (v: V) => void; options: { value: V; label: ReactNode; icon?: ReactNode; hint?: ReactNode }[]; min?: number; legend?: string }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      {legend && <legend className="k-label" style={{ marginBottom: 8 }}>{legend}</legend>}
      <div className="k-radio-cards" style={min ? ({ '--min': `${min}px` } as React.CSSProperties) : undefined}>
        {options.map((o) => (
          <label key={o.value} className="k-radio-card">
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.icon}
            <span className="k-stack" style={{ gap: 0 }}>
              <span className="k-strong">{o.label}</span>
              {o.hint && <span className="k-small k-muted">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ChipGroup<V extends string>({ values, onChange, options, legend, max }: { values: V[]; onChange: (v: V[]) => void; options: { value: V; label: string }[]; legend?: string; max?: number }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      {legend && <legend className="k-label" style={{ marginBottom: 8 }}>{legend}</legend>}
      <div className="k-chips">
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <button
              type="button"
              key={o.value}
              className="k-chip"
              aria-pressed={on}
              onClick={() => onChange(on ? values.filter((x) => x !== o.value) : max && values.length >= max ? values : [...values, o.value])}
            >
              {on && <Check size={16} aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------- display

const STATUS_TONE: Record<string, string> = {
  pending_payment: 'warning',
  requested: 'warning',
  accepted: 'info',
  on_the_way: 'info',
  arrived: 'info',
  diagnosing: 'info',
  quote_sent: 'accent',
  repair_payment_pending: 'accent',
  in_progress: 'info',
  completed_pending_confirmation: 'accent',
  confirmed: 'success',
  settled: 'success',
  paid_out: 'success',
  disputed: 'danger',
  customer_absent: 'muted',
  closed_visit_only: 'muted',
  cancelled_by_customer: 'muted',
  cancelled_by_technician: 'danger',
  expired: 'muted',
  expired_unpaid: 'muted',
  refunded_full: 'muted',
  refunded_partial: 'muted',
  repair_failed_closed: 'danger',
};

/** One colour per status, always with text (never colour alone). */
export function StatusPill({ status, label, tone }: { status?: string; label: ReactNode; tone?: 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'muted' }) {
  const t = tone ?? (status ? STATUS_TONE[status] : undefined) ?? 'info';
  return <span className={cx('k-pill', t !== 'info' && `k-pill-${t}`)}>{label}</span>;
}

export function Card({ title, icon, actions, children, className, tight, float, strong, as: As = 'section', ...rest }: { title?: ReactNode; icon?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; tight?: boolean; float?: boolean; strong?: boolean; as?: 'section' | 'div' | 'article' } & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <As className={cx('k-card', tight && 'k-tight', float && 'k-float', strong && 'k-strong', className)} {...rest}>
      {(title || actions) && (
        <div className="k-card-title">
          {icon}
          {title && <h3 className="k-grow">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </As>
  );
}

export function Banner({ tone = 'info', icon, title, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: ReactNode; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx('k-banner', tone !== 'info' && `k-banner-${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      {icon}
      <div className="k-grow k-stack" style={{ gap: 2 }}>
        {title && <strong>{title}</strong>}
        {children && <div className="k-small">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="k-empty">
      {icon ?? <Inbox size={40} aria-hidden />}
      <strong style={{ color: 'var(--ink)' }}>{title}</strong>
      {body && <p className="k-small">{body}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 18, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="k-skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="k-card k-stack" aria-busy="true" aria-label="loading">
      <Skeleton h={22} w="50%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} w={`${90 - i * 12}%`} />
      ))}
    </div>
  );
}

/** OMR with 3 decimals, tabular numbers, isolated direction. */
export function Money({ baisa, currency = true, strong }: { baisa: number | null | undefined; currency?: boolean; strong?: boolean }) {
  const { t } = useI18n();
  if (baisa == null) return <span className="k-muted">—</span>;
  return (
    <span className={cx(strong && 'k-strong')} style={{ whiteSpace: 'nowrap' }}>
      <span className="k-money">{formatOMR(baisa)}</span>
      {currency && <span className="k-small"> {t('currency')}</span>}
    </span>
  );
}

export function MoneyRow({ label, baisa, total, negative }: { label: ReactNode; baisa: number | null | undefined; total?: boolean; negative?: boolean }) {
  return (
    <div className={cx('k-money-row', total && 'k-total')}>
      <span>{label}</span>
      <span>
        {negative && baisa ? '− ' : ''}
        <Money baisa={baisa} />
      </span>
    </div>
  );
}

export function VerifiedBadge({ label }: { label: string }) {
  return (
    <span className="k-badge-verified">
      <BadgeCheck size={18} aria-hidden /> {label}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="k-stat">
      <span className="k-small k-muted">{label}</span>
      <span className="k-stat-value">{value}</span>
      {hint && <span className="k-xs k-muted">{hint}</span>}
    </div>
  );
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Countdown({ until, onDone, long }: { until: number; onDone?: () => void; long?: boolean }) {
  const now = useNow(1000);
  const left = Math.max(0, until - now);
  const done = useRef(false);
  useEffect(() => {
    if (left === 0 && !done.current) {
      done.current = true;
      onDone?.();
    }
  }, [left, onDone]);
  const s = Math.floor(left / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const text = h > 0 || long ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  return (
    <span className="k-countdown" role="timer" aria-live="off">
      {text}
    </span>
  );
}

// ---------------------------------------------------------------- progress

export function Progress({ step, total, label }: { step: number; total: number; label?: string }) {
  return (
    <div className="k-stack" style={{ gap: 6 }}>
      <div className="k-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={label}>
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} data-done={i < step} />
        ))}
      </div>
      {label && <span className="k-xs k-muted">{label}</span>}
    </div>
  );
}

export function Timeline({ items }: { items: { label: ReactNode; state: 'done' | 'current' | 'todo'; meta?: ReactNode }[] }) {
  return (
    <ol className="k-timeline">
      {items.map((it, i) => (
        <li key={i} data-state={it.state} aria-current={it.state === 'current' ? 'step' : undefined}>
          <span className="k-node">{it.state === 'done' ? <Check size={16} aria-hidden /> : null}</span>
          <div className="k-stack" style={{ gap: 0, paddingTop: 2 }}>
            <span className={it.state === 'current' ? 'k-strong' : undefined}>{it.label}</span>
            {it.meta && <span className="k-xs k-muted">{it.meta}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Tabs<V extends string>({ value, onChange, tabs, label }: { value: V; onChange: (v: V) => void; tabs: { value: V; label: ReactNode }[]; label?: string }) {
  return (
    <div className="k-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- overlays

/** Native dialog. With `requireScrollEnd`, `onReachEnd` fires once the reader scrolls to the bottom. */
export function Modal({ open, onClose, title, children, footer, onReachEnd, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; onReachEnd?: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const check = useCallback(() => {
    const el = body.current;
    if (el && onReachEnd && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) onReachEnd();
  }, [onReachEnd]);
  useEffect(() => {
    if (open) setTimeout(check, 50);
  }, [open, check]);
  return (
    <dialog ref={ref} className="k-modal" style={wide ? { width: 'min(980px, calc(100vw - 24px))' } : undefined} onClose={onClose} onCancel={onClose} aria-labelledby={titleId}>
      <div className="k-modal-head">
        <h3 id={titleId} className="k-grow">
          {title}
        </h3>
        <button type="button" className="k-icon-btn" onClick={onClose} aria-label={t('actions.close')}>
          <X size={20} aria-hidden />
        </button>
      </div>
      <div className="k-modal-body" ref={body} onScroll={check}>
        {children}
      </div>
      {footer && <div className="k-modal-foot">{footer}</div>}
    </dialog>
  );
}

export function BottomSheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="k-scrim" onClick={onClose} aria-hidden />
      <div className="k-sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="k-sheet-grip" aria-hidden />
        {children}
      </div>
    </>
  );
}

interface ToastItem {
  id: number;
  text: string;
  tone?: 'success' | 'danger' | 'info';
}
const ToastCtx = createContext<(text: string, tone?: ToastItem['tone']) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone?: ToastItem['tone']) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="k-toasts" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className="k-toast" data-tone={i.tone}>
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Admin: every state change asks for a reason; money actions add a second confirmation. */
export function ConfirmWithReason({ open, onClose, title, body, confirmLabel, onConfirm, money, danger, children }: { open: boolean; onClose: () => void; title: ReactNode; body?: ReactNode; confirmLabel: string; onConfirm: (reason: string) => Promise<void> | void; money?: boolean; danger?: boolean; children?: ReactNode }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setStep(1);
      setErr(null);
    }
  }, [open]);
  const go = async () => {
    if (reason.trim().length < 2) return setErr(t('errors.reason_required'));
    if (money && step === 1) return setStep(2);
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      const { code, details } = e as { code?: string; details?: Record<string, string | number> };
      const msg = code ? t(`errors.${code}`, details) : '';
      setErr(msg && msg !== `errors.${code}` ? msg : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={go}>
            {money && step === 1 ? t('actions.continue') : confirmLabel}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </>
      }
    >
      <div className="k-stack">
        {body}
        {children}
        {step === 2 ? (
          <Banner tone="warning" title={confirmLabel}>
            {reason}
          </Banner>
        ) : (
          <TextArea label={t('admin.reason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} error={err} autoFocus />
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- photos

export interface UploadedPhoto {
  id: string;
  url: string;
  kind?: string;
}

/**
 * Camera-first uploader with preview, retake, progress and retry. `upload` returns the stored file id.
 * Videos are allowed when `acceptVideo` is set (booking problem media).
 */
export function PhotoUploader({ value, onChange, upload, max = 5, min = 0, label, hint, acceptVideo, capture = true }: { value: UploadedPhoto[]; onChange: (v: UploadedPhoto[]) => void; upload: (file: File, onProgress: (p: number) => void) => Promise<string>; max?: number; min?: number; label?: string; hint?: string; acceptVideo?: boolean; capture?: boolean }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ key: number; url: string; progress: number; error?: boolean; file: File }[]>([]);
  const start = async (file: File, key: number) => {
    try {
      const id = await upload(file, (p) => setPending((x) => x.map((i) => (i.key === key ? { ...i, progress: p } : i))));
      setPending((x) => x.filter((i) => i.key !== key));
      // several uploads can finish before the parent re-renders: append to the latest list, not a stale one
      const next = [...valueRef.current, { id, url: URL.createObjectURL(file), kind: file.type.startsWith('video') ? ('video' as const) : ('image' as const) }];
      valueRef.current = next;
      onChangeRef.current(next);
    } catch {
      setPending((x) => x.map((i) => (i.key === key ? { ...i, error: true } : i)));
    }
  };
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;
  const pick = (files: FileList | null) => {
    if (!files) return;
    const room = max - value.length - pending.length;
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      const key = Date.now() + Math.random();
      setPending((x) => [...x, { key, url: URL.createObjectURL(f), progress: 0, file: f }]);
      void start(f, key);
    }
  };
  return (
    <div className="k-field">
      {label && (
        <span className="k-label">
          {label} <span className="k-muted k-small k-num">({value.length}/{max})</span>
        </span>
      )}
      <div className="k-photos">
        {value.map((p) => (
          <div className="k-photo" key={p.id}>
            {p.kind === 'video' ? <video src={p.url} muted playsInline /> : <img src={p.url} alt="" />}
            <button type="button" className="k-photo-remove" aria-label={t('actions.delete')} onClick={() => onChange(value.filter((x) => x.id !== p.id))}>
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
        {pending.map((p) => (
          <div className="k-photo" key={p.key}>
            <img src={p.url} alt="" style={{ opacity: 0.5 }} />
            {p.error ? (
              <button type="button" className="k-photo-remove" style={{ insetInlineEnd: 'auto', insetInlineStart: 4 }} aria-label={t('actions.retry')} onClick={() => (setPending((x) => x.map((i) => (i.key === p.key ? { ...i, error: false, progress: 0 } : i))), void start(p.file, p.key))}>
                <RotateCcw size={16} aria-hidden />
              </button>
            ) : (
              <span className="k-photo-progress" style={{ width: `${Math.round(p.progress * 100)}%` }} />
            )}
          </div>
        ))}
        {value.length + pending.length < max && (
          <button type="button" className="k-photo-add" onClick={() => input.current?.click()}>
            <Camera size={24} aria-hidden />
            {t('actions.upload')}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={acceptVideo ? 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime' : 'image/jpeg,image/png,image/webp'}
        capture={capture ? 'environment' : undefined}
        multiple={max > 1}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      {hint && <span className="k-hint">{hint}</span>}
      {min > 0 && value.length < min && <span className="k-hint">{t('ui.photosMin', { n: min })}</span>}
    </div>
  );
}

/** Drawn signature on a canvas; returns a PNG blob. */
export function SignaturePad({ onChange, label }: { onChange: (blob: Blob | null) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const { t } = useI18n();
  useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const g = c.getContext('2d')!;
    g.scale(ratio, ratio);
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#10303A';
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const done = () => {
    drawing.current = false;
    if (dirty.current) ref.current!.toBlob((b) => onChange(b), 'image/png');
  };
  return (
    <div className="k-field">
      <span className="k-label">{label}</span>
      <canvas
        ref={ref}
        className="k-signature"
        aria-label={label}
        onPointerDown={(e) => {
          drawing.current = true;
          const g = ref.current!.getContext('2d')!;
          const p = pos(e);
          g.beginPath();
          g.moveTo(p.x, p.y);
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const g = ref.current!.getContext('2d')!;
          const p = pos(e);
          g.lineTo(p.x, p.y);
          g.stroke();
          dirty.current = true;
        }}
        onPointerUp={done}
        onPointerLeave={() => drawing.current && done()}
      />
      <Button
        variant="quiet"
        size="sm"
        type="button"
        onClick={() => {
          const c = ref.current!;
          c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
          dirty.current = false;
          onChange(null);
        }}
      >
        {t('ui.clearSignature')}
      </Button>
    </div>
  );
}

export function Rating({ value, onChange, size = 28, label }: { value: number; onChange?: (v: number) => void; size?: number; label?: string }) {
  return (
    <div className="k-rating" role={onChange ? 'radiogroup' : 'img'} aria-label={label ?? `${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          <button key={n} type="button" aria-pressed={n <= value} aria-label={`${n}`} onClick={() => onChange(n)}>
            <Star size={size} fill={n <= value ? 'currentColor' : 'none'} aria-hidden />
          </button>
        ) : (
          <Star key={n} size={size * 0.6} color={n <= value ? '#e0a32e' : 'var(--line)'} fill={n <= Math.round(value) ? '#e0a32e' : 'none'} aria-hidden />
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------- data table (admin)

export interface Column<R> {
  key: string;
  label: ReactNode;
  render?: (row: R) => ReactNode;
  sort?: (a: R, b: R) => number;
  csv?: (row: R) => string | number;
}

export function DataTable<R>({ rows, columns, onRow, empty, csvName, rowKey }: { rows: R[]; columns: Column<R>[]; onRow?: (r: R) => void; empty?: ReactNode; csvName?: string; rowKey: (r: R) => string }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const { t } = useI18n();
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    return [...rows].sort((a, b) => col.sort!(a, b) * sort.dir);
  }, [rows, sort, columns]);
  const exportCsv = () => {
    const head = columns.map((c) => (typeof c.label === 'string' ? c.label : c.key));
    const lines = [head, ...sorted.map((r) => columns.map((c) => (c.csv ? c.csv(r) : String((r as Record<string, unknown>)[c.key] ?? ''))))].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${csvName ?? 'export'}.csv`;
    a.click();
  };
  return (
    <div className="k-stack" style={{ gap: 8 }}>
      {csvName && (
        <div className="k-row" style={{ justifyContent: 'flex-end' }}>
          <Button size="sm" variant="quiet" onClick={exportCsv}>
            {t('actions.export')} CSV
          </Button>
        </div>
      )}
      <div className="k-table-wrap">
        <table className="k-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  {c.sort ? (
                    <button type="button" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 1 ? -1 : 1 }))}>
                      {c.label}
                      {sort?.key === c.key ? sort.dir === 1 ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden /> : null}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={rowKey(r)}
                data-clickable={onRow ? true : undefined}
                tabIndex={onRow ? 0 : undefined}
                onClick={onRow ? () => onRow(r) : undefined}
                onKeyDown={onRow ? (e) => e.key === 'Enter' && onRow(r) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <EmptyState title={empty ?? t('states.empty')} />}
      </div>
    </div>
  );
}

/** Theme toggle kept per viewer (system by default). */
export function useTheme() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('katf-theme') as 'light' | 'dark' | null;
      if (saved) setTheme(saved);
    } catch {
      /* storage may be unavailable */
    }
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem('katf-theme');
      else localStorage.setItem('katf-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return [theme, setTheme] as const;
}

export function Logo({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <span className="k-brand">
      <span className="k-brand-mark" style={{ width: size, height: size }} aria-hidden>
        <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 22c3-6 7-9 10-9s7 3 10 9" />
          <path d="M11 15c1-4 3-7 5-7s4 3 5 7" />
          <circle cx="16" cy="24" r="2" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {name}
    </span>
  );
}
