import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, upload, type Category, type Localized } from './api';
import { useI18n, type StringKey } from './i18n';
import { Icon, type IconName } from './icons';

// ---------------------------------------------------------------- categories

/** Same colours as the app's category cards (icons: CATEGORY_ICONS in icons.tsx). */
export const CATEGORY_META: Record<Category, { colors: [string, string]; label: Localized }> = {
  cinema: { colors: ['#FF5A5F', '#C2185B'], label: { en: 'Cinema', ar: 'السينما' } },
  jetSki: { colors: ['#3DD6F5', '#1565C0'], label: { en: 'Jet Ski', ar: 'جيت سكي' } },
  shootingClub: { colors: ['#9CCC65', '#2E7D32'], label: { en: 'Oman Shooting Club', ar: 'نادي عمان للرماية' } },
  automobileClub: { colors: ['#FFB05C', '#E45A00'], label: { en: 'Oman Automobile Association', ar: 'الجمعية العمانية للسيارات' } },
  ibriArena: { colors: ['#FFD54F', '#F57F17'], label: { en: 'Ibri Arena', ar: 'ساحة عبري' } },
  videoGames: { colors: ['#B388FF', '#5E35B1'], label: { en: 'Video Game Arcades', ar: 'صالات الألعاب' } },
  festivals: { colors: ['#FF80AB', '#FF2F7D'], label: { en: 'Oman Festivals', ar: 'مهرجانات عُمان' } },
};

export const categoryGradient = (category: Category) =>
  `linear-gradient(135deg, ${CATEGORY_META[category].colors[0]}, ${CATEGORY_META[category].colors[1]})`;

// ---------------------------------------------------------------- toasts

type Toast = { id: number; text: string; error?: boolean };
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((all) => [...all, { id, text, error }]);
    setTimeout(() => setToasts((all) => all.filter((toast) => toast.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => <div key={toast.id} className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Turns an API error into a readable message. */
export function useErrorText() {
  const { t } = useI18n();
  return (error: unknown) => {
    if (error instanceof ApiError) return error.status === 0 ? t('networkError') : error.message;
    return String(error);
  };
}

// ---------------------------------------------------------------- confirmation

type ConfirmOptions = { action?: string; danger?: boolean };
type ConfirmRequest = ConfirmOptions & { message: string; resolve: (ok: boolean) => void };
const ConfirmContext = createContext<(message: string, options?: ConfirmOptions) => Promise<boolean>>(async () => false);

/** In-page confirmation (the browser's confirm() is blocked in embedded viewers and looks out of place). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const ask = useCallback((message: string, options?: ConfirmOptions) =>
    new Promise<boolean>((resolve) => setRequest({ message, resolve, ...options })), []);
  const close = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request && (
        <Modal narrow title={request.message} onClose={() => close(false)}>
          <div className="row">
            <button type="button" autoFocus className={`btn ${request.danger === false ? 'primary' : 'danger'}`} onClick={() => close(true)}>
              {request.action ?? t('yes')}
            </button>
            <button type="button" className="btn" onClick={() => close(false)}>{t('cancel')}</button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

// ---------------------------------------------------------------- data loading

/** Loads data, exposes `reload`, and keeps the previous data while refreshing. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const latest = useRef(load);
  latest.current = load;
  const counter = useRef(0);
  const reload = useCallback(async () => {
    const id = ++counter.current;
    try {
      const value = await latest.current();
      if (id === counter.current) { setData(value); setError(null); }
    } catch (err) {
      if (id === counter.current) setError(err);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps);
  return { data, error, reload, setData };
}

// ---------------------------------------------------------------- pieces

export const Spinner = () => <div className="spinner" aria-label="…" />;

export function Loading() {
  return <div className="center"><Spinner /></div>;
}

export function Empty({ text }: { text?: string }) {
  const { t } = useI18n();
  return <div className="empty">{text ?? t('empty')}</div>;
}

export function PageHead({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {hint && <p className="muted">{hint}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/** A figure with its label; `unit` (e.g. the currency) is set smaller beside the value. */
export function Stat({ label, value, unit, icon, tinted }: {
  label: string; value: ReactNode; unit?: string; icon?: IconName; tinted?: boolean;
}) {
  return (
    <div className={`glass stat${tinted ? ' tinted' : ''}`}>
      <span className="label">{icon && <span className="stat-icon"><Icon name={icon} size={18} /></span>}{label}</span>
      <span className="value num">{value}{unit && <span className="cur">{unit}</span>}</span>
    </div>
  );
}

/** A search box with its icon and a clear button. */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const { t } = useI18n();
  return (
    <div className="search-field">
      <Icon name="search" size={18} />
      <input className="input" type="search" value={value} placeholder={placeholder} aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)} />
      {value && (
        <button type="button" className="search-clear" aria-label={t('clear')} onClick={() => onChange('')}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

/** Keeps a search box responsive while delaying the request it drives. */
export function useDebounced<T>(value: T, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button key={option.value} type="button" role="tab" aria-selected={option.value === value}
          className={option.value === value ? 'on' : ''} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** English and Arabic side by side (the app shows the member's language). */
export function LocalizedField({ label, value, onChange, multiline, required = true }: {
  label: string; value: Localized; onChange: (value: Localized) => void; multiline?: boolean; required?: boolean;
}) {
  const { t } = useI18n();
  const Input = multiline ? 'textarea' : 'input';
  return (
    <div className="field">
      <span>{label}</span>
      <div className="pair">
        <Input className={multiline ? 'textarea' : 'input'} dir="rtl" lang="ar" placeholder={t('arabic')} required={required}
          value={value.ar} onChange={(event) => onChange({ ...value, ar: event.target.value })} />
        <Input className={multiline ? 'textarea' : 'input'} dir="ltr" lang="en" placeholder={t('english')} required={required}
          value={value.en} onChange={(event) => onChange({ ...value, en: event.target.value })} />
      </div>
    </div>
  );
}

/** A bilingual list edited as lines (line N in Arabic pairs with line N in English). */
export function LocalizedLinesField({ label, value, onChange }: {
  label: string; value: Localized[]; onChange: (value: Localized[]) => void;
}) {
  const { t } = useI18n();
  const [ar, setAr] = useState(value.map((item) => item.ar).join('\n'));
  const [en, setEn] = useState(value.map((item) => item.en).join('\n'));
  const commit = (nextAr: string, nextEn: string) => {
    const arLines = nextAr.split('\n').map((line) => line.trim());
    const enLines = nextEn.split('\n').map((line) => line.trim());
    const count = Math.max(arLines.length, enLines.length);
    const items: Localized[] = [];
    for (let i = 0; i < count; i++) {
      const a = arLines[i] ?? '';
      const e = enLines[i] ?? '';
      if (a || e) items.push({ ar: a || e, en: e || a });
    }
    onChange(items);
  };
  return (
    <div className="field">
      <span>{label}</span>
      <div className="pair">
        <textarea className="textarea" dir="rtl" placeholder={t('arabic')} value={ar}
          onChange={(event) => { setAr(event.target.value); commit(event.target.value, en); }} />
        <textarea className="textarea" dir="ltr" placeholder={t('english')} value={en}
          onChange={(event) => { setEn(event.target.value); commit(ar, event.target.value); }} />
      </div>
    </div>
  );
}

/** `datetime-local` bound to an ISO string (or null). */
export function DateTimeField({ label, value, onChange, hint }: {
  label: string; value: string | null; onChange: (value: string | null) => void; hint?: string;
}) {
  const { t } = useI18n();
  const local = value ? toLocalInput(value) : '';
  return (
    <Field label={label} hint={hint}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input ltr" type="datetime-local" value={local}
          onChange={(event) => onChange(event.target.value ? new Date(event.target.value).toISOString() : null)} />
        {value && <button type="button" className="icon-btn" aria-label={t('clear')} onClick={() => onChange(null)}><Icon name="close" size={16} /></button>}
      </div>
    </Field>
  );
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Uploads an image to /uploads and returns its public URL. */
export function ImageUpload({ label, value, onChange, hint }: {
  label: string; value: string | null; onChange: (url: string | null) => void; hint?: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await upload(file));
    } catch (error) {
      toast(errorText(error), true);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="field">
      <span>{label}</span>
      <div className="uploader">
        <div className="preview">{value ? <img src={value} alt="" /> : <Icon name="image" size={24} />}</div>
        <div className="row">
          <button type="button" className="btn small" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? t('uploading') : t('uploadPhoto')}
          </button>
          {value && <button type="button" className="btn small ghost" onClick={() => onChange(null)}>{t('removePhoto')}</button>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void choose(event.target.files?.[0])} />
      </div>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Modal({ title, onClose, children, narrow }: { title: string; onClose: () => void; children: ReactNode; narrow?: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  // On <body>, so an animated or blurred page around it can never clip or offset it.
  return createPortal(
    <div className={`modal-backdrop${narrow ? ' narrow' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`glass modal${narrow ? ' narrow' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        {/* The title and ✕ stay at the top while the rest scrolls. */}
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label={t('close')} onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, [StringKey, string]> = {
    active: ['active', 'green'], expired: ['expired', 'red'], cancelled: ['cancelled', ''], suspended: ['suspended', 'red'],
    used: ['used', ''], scheduled: ['status_scheduled', 'orange'], sending: ['status_sending', 'orange'],
    sent: ['status_sent', 'green'], failed: ['status_failed', 'red'],
  };
  const [key, tone] = map[status] ?? ['none', ''];
  return <span className={`badge ${tone}`}>{t(key)}</span>;
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const { t, number } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <span className="muted small num">{number(page)} / {number(pages)}</span>
      <button className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('previous')}</button>
      <button className="btn small" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('next')}</button>
    </div>
  );
}

/** Normalises Arabic and Latin text for matching: "احمد" finds "أحمد", case is ignored. */
export const fold = (value: string) => value.toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[\u064B-\u0652]/g, '');

/** "Salim Al Hinai" → "SH", "سالم الهنائي" → "س‌ه" (the family name without "Al"/"ال"; ZWNJ keeps Arabic letters apart). */
export function initials(name: string) {
  const parts = name.split(' ').filter((part) => part && !/^al$/i.test(part))
    .map((part) => (part.startsWith('ال') && part.length > 3 ? part.slice(2) : part));
  return parts.slice(0, 2).map((part) => part[0]).join('\u200C').toUpperCase() || 'S';
}
