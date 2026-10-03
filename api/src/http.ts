/** Request auth, role checks and cookie helpers shared by all routes. */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Ctx, Actor } from './ctx';
import { forbidden, unauthorized } from './lib/errors';
import { touchAdminSession, verifyAccess, type AccessClaims, type AdminRole, type Tokens } from './services/auth';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AccessClaims | null;
    viaCookie: boolean;
  }
}

export const COOKIE = {
  access: 'katf_at',
  refresh: 'katf_rt',
  device: 'katf_did',
  adminAccess: 'katf_aat',
  adminRefresh: 'katf_art',
};

export function readAuth(ctx: Ctx, req: FastifyRequest, admin: boolean) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return { claims: verifyAccess(ctx, h.slice(7)), viaCookie: false };
  const c = req.cookies?.[admin ? COOKIE.adminAccess : COOKIE.access];
  return { claims: c ? verifyAccess(ctx, c) : null, viaCookie: Boolean(c) };
}

/** Cookie-authenticated writes must carry a custom header (cross-site forms cannot set it). */
export function assertCsrf(req: FastifyRequest) {
  if (req.viaCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'katf') throw forbidden('csrf');
}

export function actorOf(req: FastifyRequest, ctx: Ctx): Actor & { id: string } {
  const a = req.auth;
  if (!a) throw unauthorized();
  return { id: a.uid, role: a.role, adminRole: a.arole, ipHash: ctx.crypto.hashIp(req.ip) };
}

export function requireRole(req: FastifyRequest, ctx: Ctx, role: 'customer' | 'technician'): Actor & { id: string } {
  const a = actorOf(req, ctx);
  if (a.role !== role) throw forbidden();
  assertCsrf(req);
  return a;
}

export async function requireAdmin(req: FastifyRequest, ctx: Ctx, roles: AdminRole[] | 'any'): Promise<Actor & { id: string }> {
  const a = actorOf(req, ctx);
  if (a.role !== 'admin' || !a.adminRole) throw forbidden();
  if (!(await touchAdminSession(ctx, req.auth!.sid))) throw unauthorized('session_expired');
  if (roles !== 'any' && a.adminRole !== 'owner' && !roles.includes(a.adminRole as AdminRole)) throw forbidden();
  assertCsrf(req);
  return a;
}

export function deviceId(req: FastifyRequest, reply: FastifyReply, ctx: Ctx): string {
  const fromHeader = req.headers['x-device-id'];
  if (typeof fromHeader === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(fromHeader)) return fromHeader;
  const c = req.cookies?.[COOKIE.device];
  if (c && /^[A-Za-z0-9_-]{8,100}$/.test(c)) return c;
  const id = randomUUID();
  reply.setCookie(COOKIE.device, id, { path: '/', httpOnly: true, secure: ctx.config.NODE_ENV === 'production', sameSite: 'lax', maxAge: 400 * 86400 });
  return id;
}

export function setSessionCookies(reply: FastifyReply, ctx: Ctx, t: Tokens, admin = false) {
  const secure = ctx.config.NODE_ENV === 'production';
  const base = admin ? `/${ctx.config.adminPath}` : '/';
  reply.setCookie(admin ? COOKIE.adminAccess : COOKIE.access, t.accessToken, { path: base, httpOnly: true, secure, sameSite: admin ? 'strict' : 'lax', maxAge: 600 });
  reply.setCookie(admin ? COOKIE.adminRefresh : COOKIE.refresh, t.refreshToken, {
    path: admin ? `${base}/api/auth` : '/api/auth',
    httpOnly: true,
    secure,
    sameSite: admin ? 'strict' : 'lax',
    maxAge: admin ? 8 * 3600 : 60 * 86400,
  });
}

export function clearSessionCookies(reply: FastifyReply, ctx: Ctx, admin = false) {
  const base = admin ? `/${ctx.config.adminPath}` : '/';
  reply.clearCookie(admin ? COOKIE.adminAccess : COOKIE.access, { path: base });
  reply.clearCookie(admin ? COOKIE.adminRefresh : COOKIE.refresh, { path: admin ? `${base}/api/auth` : '/api/auth' });
}

export const reason = (b: unknown) => String((b as { reason?: unknown })?.reason ?? '');

