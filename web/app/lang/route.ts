import { NextResponse, type NextRequest } from 'next/server';

export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to') === 'en' ? 'en' : 'ar';
  const next = req.nextUrl.searchParams.get('next') ?? '/';
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const res = NextResponse.redirect(new URL(safe, req.url));
  res.cookies.set('katf_lang', to, { path: '/', maxAge: 400 * 86400, sameSite: 'lax' });
  return res;
}
