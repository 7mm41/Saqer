'use client';
import { createContext, useContext, type ReactNode } from 'react';
import { I18nProvider, ToastProvider } from '@katf/ui';
import { commonAr, commonEn } from '@katf/shared/i18n';
import type { Messages, Locale } from '../lib/i18n';
import type { PublicConfig } from '../lib/server-api';

const SiteCtx = createContext<{ m: Messages; locale: Locale; config: PublicConfig } | null>(null);

export function useSite() {
  const v = useContext(SiteCtx);
  if (!v) throw new Error('SiteCtx missing');
  return v;
}

export function Providers({ locale, m, config, children }: { locale: Locale; m: Messages; config: PublicConfig; children: ReactNode }) {
  return (
    <SiteCtx.Provider value={{ m, locale, config }}>
      <I18nProvider locale={locale} dict={locale === 'en' ? (commonEn as never) : (commonAr as never)} fallback={commonAr as never}>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </SiteCtx.Provider>
  );
}
