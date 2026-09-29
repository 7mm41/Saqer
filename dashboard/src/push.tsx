import { useState } from 'react';
import { ApiError, get, post, type PushEnvironment, type PushStatus, type PushTest } from './api';
import { useI18n, type StringKey } from './i18n';
import { Icon } from './icons';
import { useLive } from './live';
import { useErrorText, useLoad } from './ui';

/** Apple's reasons (and ours) that have their own explanation. */
const REASONS = [
  'BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic', 'TopicDisallowed', 'InvalidProviderToken', 'ExpiredProviderToken',
  'MissingTopic', 'BadTopic', 'KeyUnreadable', 'NotConfigured', 'Timeout', 'NetworkError', 'ServerError',
] as const;

/** What an APNs reason code means, and what to do about it. */
export function usePushReason() {
  const { t } = useI18n();
  return (reason: string | null | undefined) => {
    if (!reason) return t('reason_other', { reason: '—' });
    const known = (REASONS as readonly string[]).includes(reason) ? reason : null;
    if (known === 'BadTopic') return t('reason_MissingTopic');
    if (known === 'NetworkError') return t('reason_Timeout');
    return known ? t(`reason_${known}` as StringKey) : t('reason_other', { reason });
  };
}

/** Is push connected, how many phones can receive it, and a test notification to your own phone. */
export function PushStatusCard() {
  const { t, number, dateTime } = useI18n();
  const errorText = useErrorText();
  const explain = usePushReason();
  const { data: status, reload } = useLoad(() => get<PushStatus>('admin/push/status'), []);
  useLive(['notifications'], () => void reload());
  const [test, setTest] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const environment = (value: PushEnvironment | null) =>
    value === 'production' ? t('envProduction') : value === 'sandbox' ? t('envSandbox') : t('envUnknown');

  const sendTest = async () => {
    setBusy(true);
    setTest(null);
    try {
      const result = await post<PushTest>('admin/push/test', {});
      setTest({
        ok: result.delivered > 0,
        lines: result.devices.map((device) => device.ok
          ? t('pushTestOk', { env: environment(device.environment) })
          : t('pushTestFail', { reason: explain(device.reason) })),
      });
      void reload();
    } catch (error) {
      setTest({ ok: false, lines: [error instanceof ApiError && error.code === 'no_devices' ? t('pushNoDevice') : errorText(error)] });
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;
  const connected = status.configured && !status.problem;
  const recent = status.recentFailures.slice(0, 3);

  return (
    <section className="glass card stack push-status">
      <div className="row between">
        <h2 className="with-icon"><Icon name="bell" size={20} />{t('pushTitle')}</h2>
        <span className={`badge ${connected ? 'green' : 'red'}`}>
          <Icon name={connected ? 'check' : 'close'} size={13} />{connected ? t('pushOn') : t('pushOff')}
        </span>
      </div>
      <p className="muted small num">
        {t('pushPhones', { n: number(status.devices.total), mine: number(status.devices.mine) })}
        {status.devices.total > 0 && (
          <> · {t('envSandbox')}: {number(status.devices.sandbox)} · {t('envProduction')}: {number(status.devices.production)}</>
        )}
      </p>
      {status.missing.length > 0 && (
        <div className="notice small"><Icon name="settings" size={18} />
          <span>{t('pushMissing')} <code className="ltr">{status.missing.join(' · ')}</code></span>
        </div>
      )}
      {status.problem && (
        <div className="notice small bad"><Icon name="close" size={18} /><span className="ltr" dir="ltr">{status.problem}</span></div>
      )}
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={() => void sendTest()}>
          <Icon name="send" size={17} />{busy ? t('loading') : t('pushTest')}
        </button>
        <span className="muted small">{t('pushTestHint')}</span>
      </div>
      {test && (
        <div className={`result ${test.ok ? 'ok' : 'bad'}`}>
          <span className="big" aria-hidden><Icon name={test.ok ? 'check' : 'close'} size={22} /></span>
          <div className="stack" style={{ gap: 4 }}>{test.lines.map((line, index) => <span key={index}>{line}</span>)}</div>
        </div>
      )}
      {recent.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <h3>{t('pushRecent')}</h3>
          {recent.map((failure) => (
            <div key={failure.at + failure.reason} className="small push-failure">
              <span className="muted num">{dateTime(failure.at)}</span>
              <span>{explain(failure.reason)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
