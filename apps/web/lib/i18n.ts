import { cookies } from 'next/headers';
import { ar } from '../messages/ar';
import { en } from '../messages/en';

export type Locale = 'ar' | 'en';
export const MESSAGES = { ar, en } as const;
export type Messages = typeof ar;

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get('katf_lang')?.value;
  return c === 'en' ? 'en' : 'ar';
}

export async function getMessages() {
  const locale = await getLocale();
  return { locale, m: MESSAGES[locale] as Messages };
}

export function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
