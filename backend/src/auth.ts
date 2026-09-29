import { timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from './db/client.ts';
import { sessions, users, type Role, type User } from './db/schema.ts';
import { errors } from './lib/errors.ts';
import type { TokenService } from './lib/tokens.ts';

/** `panel`: the owner, signed in from the control panel's secret address — the only one who can manage anything. */
export type AuthContext = { user: User; sessionId: string; panel: boolean };

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/** Resolves the bearer token to a live session and an active user. */
export async function authenticate(request: FastifyRequest, db: Database, tokens: TokenService, ownerEmail: string): Promise<AuthContext> {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claims = token ? await tokens.verify(token) : null;
  if (!claims) throw errors.unauthorized();

  const [row] = await db.select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, claims.sessionId), eq(sessions.userId, claims.userId), isNull(sessions.revokedAt)))
    .limit(1);
  if (!row) throw errors.unauthorized();
  if (row.user.status !== 'active') throw errors.suspended();
  const panel = claims.panel && row.user.role === 'admin' && row.user.email === ownerEmail;
  return { user: row.user, sessionId: claims.sessionId, panel };
}

/**
 * Route guard: `{ preHandler: app.guard() }` (any signed-in account) or
 * `app.guard('admin')` (the control panel: its owner, signed in from its secret
 * address; the same account signed in from the app is only a member there).
 */
export function makeGuard(db: Database, tokens: TokenService, ownerEmail: string) {
  return (...allowed: Role[]) => async (request: FastifyRequest, _reply: FastifyReply) => {
    const context = await authenticate(request, db, tokens, ownerEmail);
    if (allowed.length > 0 && !(context.panel && allowed.includes(context.user.role))) throw errors.forbidden();
    request.auth = context;
  };
}

/** The control panel sends its secret address with a sign-in (`X-Sarena-Panel`). */
export function fromPanel(request: FastifyRequest, panelPath: string): boolean {
  const given = Buffer.from(String(request.headers['x-sarena-panel'] ?? '').trim().toLowerCase());
  const expected = Buffer.from(panelPath);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function requireAuthContext(request: FastifyRequest): AuthContext {
  if (!request.auth) throw errors.unauthorized();
  return request.auth;
}
