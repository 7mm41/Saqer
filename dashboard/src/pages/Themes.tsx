import { useState, type FormEvent } from 'react';
import { THEME_ICONS, del, get, patch, post, type Localized, type Theme, type ThemeIcon } from '../api';
import appIcon from '../assets/icons/app.png';
import eidIcon from '../assets/icons/season-eid.png';
import nationalDayIcon from '../assets/icons/season-nationalday.png';
import ramadanIcon from '../assets/icons/season-ramadan.png';
import logo from '../assets/logo.png';
import { useI18n, type StringKey } from '../i18n';
import { Icon } from '../icons';
import { useLive } from '../live';
import {
  DateTimeField, Empty, Field, ImageUpload, Loading, LocalizedField, Modal, PageHead, Toggle, useConfirm, useErrorText, useLoad, useToast,
} from '../ui';

const ICONS: Record<ThemeIcon, { label: StringKey; preview: string; accent: string }> = {
  'AppIcon-NationalDay': { label: 'iconNationalDay', preview: nationalDayIcon, accent: '#C8102E' },
  'AppIcon-Ramadan': { label: 'iconRamadan', preview: ramadanIcon, accent: '#2B2470' },
  'AppIcon-Eid': { label: 'iconEid', preview: eidIcon, accent: '#0E7C66' },
};

type Draft = Omit<Theme, 'id'> & { id?: string };

const newTheme = (): Draft => ({
  name: '', logoUrl: null, bannerUrl: null, greeting: { en: '', ar: '' }, accentColor: '#C8102E',
  iconName: 'AppIcon-NationalDay', startsAt: null, endsAt: null, isEnabled: true,
});

export function ThemesPage() {
  const { t, L, date } = useI18n();
  const { data, reload } = useLoad(() => get<{ themes: Theme[]; activeThemeId: string | null }>('admin/themes'), []);
  useLive(['themes'], () => void reload());
  const [editing, setEditing] = useState<Draft | null>(null);

  const state = (theme: Theme) => {
    if (!theme.isEnabled) return ['off', ''] as const;
    if (theme.id === data?.activeThemeId) return ['liveNow', 'green'] as const;
    if (theme.startsAt && Date.parse(theme.startsAt) > Date.now()) return ['upcoming', 'orange'] as const;
    if (theme.endsAt && Date.parse(theme.endsAt) <= Date.now()) return ['ended', ''] as const;
    return ['upcoming', ''] as const;
  };

  return (
    <>
      <PageHead title={t('themes')} hint={t('themesHint')}>
        <button className="btn primary" onClick={() => setEditing(newTheme())}><Icon name="plus" size={18} />{t('newTheme')}</button>
      </PageHead>
      {!data ? <Loading /> : data.themes.length === 0 ? <div className="glass"><Empty /></div> : (
        <div className="grid cards">
          {data.themes.map((theme) => {
            const [label, tone] = state(theme);
            return (
              <button key={theme.id} type="button" className="glass card stack theme-card"
                onClick={() => setEditing({ ...theme })}>
                <div className="theme-preview" style={{ background: `linear-gradient(135deg, ${theme.accentColor ?? '#FF7900'}, #1B1420)` }}>
                  <img src={theme.logoUrl ?? logo} alt="" />
                  <strong>{L(theme.greeting) || theme.name}</strong>
                </div>
                <div className="row between">
                  <h3>{theme.name}</h3>
                  <span className={`badge ${tone}`}>{t(label)}</span>
                </div>
                <span className="muted small num with-icon"><Icon name="calendar" size={15} />{theme.startsAt ? date(theme.startsAt) : '…'} – {theme.endsAt ? date(theme.endsAt) : '…'}</span>
                {theme.iconName && <span className="row small"><img className="mini-icon" src={ICONS[theme.iconName].preview} alt="" />{t(ICONS[theme.iconName].label)}</span>}
              </button>
            );
          })}
        </div>
      )}
      {editing && <ThemeEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => void reload()} />}
    </>
  );
}

function ThemeEditor({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: () => void }) {
  const { t, L } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [theme, setTheme] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const confirmAction = useConfirm();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setTheme((current) => ({ ...current, [key]: value }));
  const greeting: Localized = theme.greeting ?? { en: '', ar: '' };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { id, ...body } = theme;
    const payload = { ...body, greeting: greeting.en || greeting.ar ? { en: greeting.en || greeting.ar, ar: greeting.ar || greeting.en } : null };
    try {
      if (id) await patch(`admin/themes/${id}`, payload); else await post('admin/themes', payload);
      toast(t('saved'));
      onSaved();
      onClose();
    } catch (error) {
      toast(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!theme.id || !(await confirmAction(t('confirmDelete'), { action: t('delete') }))) return;
    try { await del(`admin/themes/${theme.id}`); onSaved(); onClose(); } catch (error) { toast(errorText(error), true); }
  };

  return (
    <Modal title={theme.id ? theme.name : t('newTheme')} onClose={onClose}>
      <form className="stack" onSubmit={(event) => void save(event)}>
        <div className="theme-preview" style={{ background: `linear-gradient(135deg, ${theme.accentColor ?? '#FF7900'}, #1B1420)` }}>
          <img src={theme.logoUrl ?? logo} alt="" />
          <strong style={{ fontSize: 18 }}>{L(greeting) || theme.name}</strong>
        </div>
        <div className="pair">
          <Field label={t('themeName')}><input className="input" required value={theme.name} placeholder="National Day 2026" onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label={t('accent')}>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="color" value={theme.accentColor ?? '#FF7900'} onChange={(e) => set('accentColor', e.target.value.toUpperCase())} style={{ width: 54, height: 44, border: 0, background: 'none' }} />
              <input className="input ltr" value={theme.accentColor ?? ''} onChange={(e) => set('accentColor', e.target.value || null)} />
            </div>
          </Field>
        </div>
        <LocalizedField label={t('greeting')} required={false} value={greeting} onChange={(value) => set('greeting', value)} />
        <div className="pair">
          <ImageUpload label={t('logo')} value={theme.logoUrl} onChange={(url) => set('logoUrl', url)} hint="PNG" />
          <ImageUpload label={t('banner')} value={theme.bannerUrl} onChange={(url) => set('bannerUrl', url)} />
        </div>
        <div className="field">
          <span>{t('homeIcon')}</span>
          <div className="icon-choice">
            <button type="button" className={theme.iconName === null ? 'on' : ''} onClick={() => set('iconName', null)}>
              <img src={appIcon} alt="" />{t('noIcon')}
            </button>
            {THEME_ICONS.map((icon) => (
              <button key={icon} type="button" className={theme.iconName === icon ? 'on' : ''}
                onClick={() => { set('iconName', icon); if (!initial.id) set('accentColor', ICONS[icon].accent); }}>
                <img src={ICONS[icon].preview} alt="" />{t(ICONS[icon].label)}
              </button>
            ))}
          </div>
          <small>{t('homeIconHint')}</small>
        </div>
        <div className="pair">
          <DateTimeField label={t('from')} value={theme.startsAt} onChange={(value) => set('startsAt', value)} />
          <DateTimeField label={t('to')} value={theme.endsAt} onChange={(value) => set('endsAt', value)} />
        </div>
        <Toggle label={t('enabled')} checked={theme.isEnabled} onChange={(value) => set('isEnabled', value)} />
        <div className="row between">
          <div className="row">
            <button className="btn primary" disabled={busy}>{busy ? t('loading') : t('save')}</button>
            <button type="button" className="btn" onClick={onClose}>{t('close')}</button>
          </div>
          {theme.id && <button type="button" className="btn danger small" onClick={() => void remove()}>{t('delete')}</button>}
        </div>
      </form>
    </Modal>
  );
}
