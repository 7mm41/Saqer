import { useEffect, useState, type FormEvent } from 'react';
import { get, patch, post, type Audience, type Localized, type Notification, type NotificationSettings, type Page, type Venue } from '../api';
import appIcon from '../assets/icons/app.png';
import { useI18n, type StringKey } from '../i18n';
import { Icon } from '../icons';
import { useLive } from '../live';
import {
  DateTimeField, Empty, Field, Loading, LocalizedField, PageHead, Pager, SearchField, Segmented, StatusBadge, Toggle, useDebounced,
  useErrorText, useLoad, useToast,
} from '../ui';

type History = Page<Notification> & { pushConfigured: boolean; devices: number };

export function NotificationsPage() {
  const { t, dateTime, L, number } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<'' | 'automatic' | 'written'>('');
  const search = useDebounced(query.trim());
  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (search) params.set('q', search);
  if (origin) params.set('origin', origin);
  const { data: history, reload } = useLoad(() => get<History>(`admin/notifications?${params}`), [params.toString()]);
  useLive(['notifications'], () => void reload());

  const cancel = async (id: string) => {
    try { await post(`admin/notifications/${id}/cancel`); void reload(); } catch (error) { toast(errorText(error), true); }
  };

  return (
    <>
      <PageHead title={t('notifications')} hint={t('notificationsHint')}>
        {history && <span className="badge num"><Icon name="phone" size={13} />{t('sentTo', { n: number(history.devices) })}</span>}
      </PageHead>
      {history && !history.pushConfigured && (
        <div className="notice small"><Icon name="bell" size={18} /><span>{t('pushNotConfigured')}</span></div>
      )}
      <div className="grid two">
        <Composer onSent={() => void reload()} />
        <AutomaticRules />
      </div>
      <section className="glass card stack">
        <h2>{t('historyTitle')}</h2>
        <div className="toolbar">
          <SearchField value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder={t('searchNotification')} />
          <Segmented value={origin} onChange={(value) => { setOrigin(value); setPage(1); }} options={[
            { value: '', label: t('all') }, { value: 'automatic', label: t('automaticOnly') }, { value: 'written', label: t('writtenOnly') },
          ]} />
          {history && <span className="muted small num toolbar-count">{t('results', { n: number(history.total) })}</span>}
        </div>
        {!history ? <Loading /> : history.items.length === 0 ? <Empty text={search ? t('noMatches') : undefined} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>{t('title')}</th><th>{t('audience')}</th><th>{t('status')}</th><th>{t('sendAt')}</th><th aria-label={t('recipients')}><Icon name="phone" size={15} /></th><th /></tr></thead>
            <tbody>{history.items.map((n) => (
              <tr key={n.id}>
                <td>
                  <div className="notif-title">
                    <span className={`badge${n.kind === 'broadcast' ? '' : ' orange'}`}>{t(`kind_${n.kind}` as StringKey)}</span>
                    <strong>{L(n.title)}</strong>
                  </div>
                  <div className="muted small clamp">{L(n.body)}</div>
                </td>
                <td className="muted small">{t(audienceKey(n.audience))}</td>
                <td><StatusBadge status={n.status} /></td>
                <td className="small num">{dateTime(n.sentAt ?? n.scheduledFor)}</td>
                <td className="num">{n.status === 'sent' ? number(n.recipients) : '—'}</td>
                <td>{n.status === 'scheduled' && <button className="btn small ghost" onClick={() => void cancel(n.id)}>{t('cancel')}</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {history && <Pager page={history.page} pageSize={history.pageSize} total={history.total} onPage={setPage} />}
      </section>
    </>
  );
}

const audienceKey = (audience: Audience): StringKey => ({
  all: 'audienceAll', members: 'audienceMembers', non_members: 'audienceNonMembers', user: 'audienceUser',
} as const)[audience];

function Composer({ onSent }: { onSent: () => void }) {
  const { t, L, lang, number } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const [title, setTitle] = useState<Localized>({ en: '', ar: '' });
  const [body, setBody] = useState<Localized>({ en: '', ar: '' });
  const [audience, setAudience] = useState<Exclude<Audience, 'user'>>('all');
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);
  const [venueId, setVenueId] = useState('');
  const [reach, setReach] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: venues } = useLoad(() => get<{ venues: Venue[] }>('admin/venues'), []);

  useEffect(() => {
    let cancelled = false;
    get<{ devices: number }>(`admin/notifications/audience?audience=${audience}`)
      .then((result) => { if (!cancelled) setReach(result.devices); }).catch(() => {});
    return () => { cancelled = true; };
  }, [audience]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await post('admin/notifications', { title, body, audience, scheduledFor, venueId: venueId || null });
      setTitle({ en: '', ar: '' });
      setBody({ en: '', ar: '' });
      setScheduledFor(null);
      toast(t('saved'));
      onSent();
    } catch (error) {
      toast(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="glass card stack" onSubmit={(event) => void send(event)}>
      <h2 className="with-icon"><Icon name="send" size={20} />{t('compose')}</h2>
      <LocalizedField label={t('title')} value={title} onChange={setTitle} />
      <LocalizedField label={t('message')} multiline value={body} onChange={setBody} />
      <Field label={t('audience')} hint={reach === null ? undefined : t('reach', { n: number(reach) })}>
        <Segmented value={audience} onChange={setAudience} options={[
          { value: 'all', label: t('audienceAll') }, { value: 'members', label: t('audienceMembers') },
          { value: 'non_members', label: t('audienceNonMembers') },
        ]} />
      </Field>
      <div className="pair">
        <DateTimeField label={t('sendAt')} value={scheduledFor} onChange={setScheduledFor} />
        <Field label={t('linkVenue')}>
          <select className="select" value={venueId} onChange={(event) => setVenueId(event.target.value)}>
            <option value="">{t('none')}</option>
            {venues?.venues.map((venue) => <option key={venue.id} value={venue.id}>{L(venue.name)}</option>)}
          </select>
        </Field>
      </div>
      {/* What it looks like on the lock screen. */}
      <div className="phone-preview">
        <img src={appIcon} alt="" />
        <div>
          <strong>{(lang === 'ar' ? title.ar || title.en : title.en || title.ar) || t('title')}</strong>
          <div className="small">{(lang === 'ar' ? body.ar || body.en : body.en || body.ar) || t('message')}</div>
        </div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={busy}><Icon name={scheduledFor ? 'calendar' : 'send'} size={18} />{scheduledFor ? t('schedule') : t('send')}</button>
      </div>
    </form>
  );
}

function AutomaticRules() {
  const { t } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const { data, setData } = useLoad(() => get<{ settings: NotificationSettings }>('admin/settings/notifications'), []);
  const [busy, setBusy] = useState(false);
  if (!data) return <div className="glass card"><Loading /></div>;
  const settings = data.settings;
  const set = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) =>
    setData({ settings: { ...settings, [key]: value } });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await patch<{ settings: NotificationSettings }>('admin/settings/notifications', settings);
      setData(result);
      toast(t('saved'));
    } catch (error) {
      toast(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };

  const numberField = (key: 'newEventDelayMinutes' | 'morningHour' | 'reminderHoursBefore' | 'finalReminderMinutes', label: StringKey) => (
    <Field label={t(label)}>
      <input className="input num ltr" type="number" value={settings[key]} onChange={(event) => set(key, Number(event.target.value))} />
    </Field>
  );

  return (
    <form className="glass card stack" onSubmit={(event) => void save(event)}>
      <h2 className="with-icon"><Icon name="settings" size={20} />{t('automatic')}</h2>
      <Toggle label={t('ruleNewEvents')} checked={settings.newEvents} onChange={(value) => set('newEvents', value)} />
      <Toggle label={t('ruleEventDay')} checked={settings.eventDay} onChange={(value) => set('eventDay', value)} />
      <Toggle label={t('rulePromos')} checked={settings.planPromos} onChange={(value) => set('planPromos', value)} />
      <Toggle label={t('ruleExpiry')} checked={settings.membershipExpiry} onChange={(value) => set('membershipExpiry', value)} />
      <div className="pair">
        {numberField('newEventDelayMinutes', 'newEventDelay')}
        {numberField('morningHour', 'morningHour')}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <h3 className="with-icon"><Icon name="clock" size={18} />{t('reminders')}</h3>
        <p className="muted small">{t('remindersHint')}</p>
      </div>
      <div className="pair">
        {numberField('reminderHoursBefore', 'hoursBefore')}
        {numberField('finalReminderMinutes', 'finalMinutes')}
      </div>
      <div className="row"><button className="btn primary" disabled={busy}>{t('save')}</button></div>
    </form>
  );
}
