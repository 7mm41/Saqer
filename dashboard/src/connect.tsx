import { DEMO } from './api';
import { useI18n } from './i18n';
import { Icon } from './icons';
import { Modal, useToast } from './ui';

/** Copies text, falling back to a hidden field where the clipboard API is blocked. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  }
}

/**
 * "Connect the app": a `sarena://connect?server=…` link that points the iPhone
 * app at the server this control panel is served from.
 */
export function ConnectAppModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const server = window.location.origin;
  const link = `sarena://connect?server=${encodeURIComponent(server)}`;
  const isTunnel = window.location.hostname.endsWith('trycloudflare.com');

  return (
    <Modal narrow title={t('connectAppTitle')} onClose={onClose}>
      {DEMO || !server.startsWith('http') ? (
        <div className="notice small"><Icon name="flask" size={18} /><span>{t('connectDemo')}</span></div>
      ) : (
        <div className="stack">
          <p className="muted">{t('connectAppHint')}</p>
          <div className="field">
            <span>{t('serverAddress')}</span>
            <div className="copy-row">
              <code className="ltr">{server}</code>
              <button type="button" className="btn small" onClick={async () => toast((await copyText(server)) ? t('copied') : server)}>
                <Icon name="copy" size={15} />{t('copy')}
              </button>
            </div>
          </div>
          <a className="btn primary" href={link}><Icon name="phone" size={18} />{t('openInApp')}</a>
          {isTunnel && <div className="notice small"><Icon name="clock" size={18} /><span>{t('connectTunnel')}</span></div>}
          <p className="muted small">{t('connectXcode')} <code className="ltr">Info.plist › SarenaAPIBaseURL</code></p>
        </div>
      )}
    </Modal>
  );
}
