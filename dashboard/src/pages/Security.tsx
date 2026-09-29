import { useState } from 'react';
import { get, post, type SignInHistory } from '../api';
import { useI18n } from '../i18n';
import { Icon } from '../icons';
import { Empty, Loading, PageHead, useConfirm, useErrorText, useLoad, useToast } from '../ui';

/** "iPhone · Safari", "Mac · Chrome", "Sarena app · iPhone" from a browser's or the app's user agent. */
export function describeDevice(agent: string | null | undefined): string | null {
  if (!agent) return null;
  const system = /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) ? 'iPad' : /Android/.test(agent) ? 'Android'
    : /Mac OS X|Macintosh/.test(agent) ? 'Mac' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux'
    : /Darwin/.test(agent) ? 'iPhone' : null;
  if (/^Sarena\//.test(agent) || /CFNetwork/.test(agent)) return ['Sarena app', system].filter(Boolean).join(' · ');
  const browser = /Edg\//.test(agent) ? 'Edge' : /CriOS|Chrome\//.test(agent) ? 'Chrome' : /FxiOS|Firefox\//.test(agent) ? 'Firefox'
    : /Safari\//.test(agent) ? 'Safari' : null;
  const text = [system, browser].filter(Boolean).join(' · ');
  return text || agent.slice(0, 60);
}

/** The owner's sign-ins and the wrong passwords given for the account. */
export function SecurityPage() {
  const { t, dateTime, number } = useI18n();
  const toast = useToast();
  const errorText = useErrorText();
  const confirmAction = useConfirm();
  const { data, reload } = useLoad(() => get<SignInHistory>('admin/security/sign-ins'), []);
  const [busy, setBusy] = useState(false);

  const signOutOthers = async () => {
    if (!(await confirmAction(t('signOutOthersConfirm'), { action: t('signOutOthers') }))) return;
    setBusy(true);
    try {
      const { ended } = await post<{ ended: number }>('admin/security/sign-out-others');
      toast(t('signedOutOthers', { n: number(ended) }));
      await reload();
    } catch (error) {
      toast(errorText(error), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title={t('security')} hint={t('securityHint')}>
        <button className="btn" disabled={busy} onClick={() => void signOutOthers()}><Icon name="logout" size={17} />{t('signOutOthers')}</button>
      </PageHead>
      {!data ? <Loading /> : (
        <div className="stack">
          <section className="glass card stack">
            <h2 className="with-icon"><Icon name="clock" size={20} />{t('lastPanelSignIn')}</h2>
            {data.lastPanelSignIn ? (
              <p className="num">
                <strong>{dateTime(data.lastPanelSignIn.at)}</strong>
                <span className="muted"> · {describeDevice(data.lastPanelSignIn.device) ?? t('unknownDevice')}</span>
                {data.lastPanelSignIn.ip && <span className="muted ltr"> · {data.lastPanelSignIn.ip}</span>}
              </p>
            ) : <p className="muted">{t('firstSignIn')}</p>}
            {data.failuresSinceLastSignIn > 0 && (
              <div className="notice small bad"><Icon name="alert" size={18} />
                <span>{t('failedAttemptsWarning', { n: number(data.failuresSinceLastSignIn) })}</span>
              </div>
            )}
          </section>

          <section className="glass card stack">
            {data.items.length === 0 ? <Empty /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('when')}</th><th>{t('status')}</th><th>{t('where')}</th><th>{t('device')}</th><th>{t('address')}</th></tr></thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id} className={item.kind === 'wrong_password' ? 'row-warn' : undefined}>
                        <td className="num">{dateTime(item.at)}</td>
                        <td>
                          {item.kind === 'wrong_password'
                            ? <span className="badge red"><Icon name="alert" size={12} />{t('kindWrongPassword')}</span>
                            : item.current ? <span className="badge green"><Icon name="check" size={12} />{t('thisDevice')}</span>
                              : item.active ? <span className="badge orange">{t('signedInNow')}</span>
                                : <span className="badge">{t('endedSession')}</span>}
                        </td>
                        <td>{item.panel ? t('fromPanel') : t('fromApp')}</td>
                        <td className="muted">{describeDevice(item.device) ?? t('unknownDevice')}</td>
                        <td className="muted ltr num">{item.ip ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
