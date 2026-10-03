import { NextResponse, type NextRequest } from 'next/server';

/** Sets the language cookie and returns to the same page. Only same-origin paths are accepted. */
export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to') === 'en' ? 'en' : 'ar';
  const next = req.nextUrl.searchParams.get('next') ?? '/';
  let target = new URL('/', req.url);
  try {
    // "/\evil.com" and "//evil.com" resolve to another host; compare the resolved origin, not the text
    const u = new URL(next, req.url);
    if (u.origin === target.origin && next.startsWith('/')) target = u;
  } catch {
    /* keep "/" */
  }
  const res = NextResponse.redirect(target);
  res.cookies.set('katf_lang', to, { path: '/', maxAge: 400 * 86400, sameSite: 'lax' });
  return res;
}
