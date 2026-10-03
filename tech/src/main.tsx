import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@katf/ui/fonts';
import '@katf/ui/styles.css';
import App from './App';
import { isNative } from './lib/native';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: cache the app shell so the app opens without a network; the iPhone app ships its files in the bundle.
if (!isNative() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
  });
}
