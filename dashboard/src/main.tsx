import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DEMO } from './api';
import { applyAppearance, storedAppearance } from './appearance';
import { I18nProvider } from './i18n';
import { ConfirmProvider, ToastProvider } from './ui';
import './styles.css';

// Before the first paint, so the sign-in page already has the chosen look.
applyAppearance(storedAppearance());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);

// Installable (Add to Home Screen / Install app) and opens instantly.
if ('serviceWorker' in navigator && import.meta.env.PROD && !DEMO) {
  window.addEventListener('load', () => {
    // Relative to <base href>: the panel's secret address.
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  });
}
