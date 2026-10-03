import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@katf/ui/fonts';
import '@katf/ui/styles.css';
import './admin.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
