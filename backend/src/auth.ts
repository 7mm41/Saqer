import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from './db/client.ts';
import { sessions, users, type Role, type User } from './db/schema.ts';
import { errors } from './lib/errors.ts';
import type { TokenService } from './lib/tokens.ts';

export type AuthContext = { user: User; sessionId: string };

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/** Resolves the bearer token to a live session and an active user. */
export async function authenticate(request: FastifyRequest, db: Database, tokens: TokenService): Promise<AuthContext> {
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
  return { user: row.user, sessionId: claims.sessionId };
}

/** Route guard: `{ preHandler: app.requireAuth() }` or `app.requireAuth('admin')`. */
export function makeGuard(db: Database, tokens: TokenService) {
  return (...allowed: Role[]) => async (request: FastifyRequest, _reply: FastifyReply) => {
    const context = await authenticate(request, db, tokens);
    if (allowed.length > 0 && !allowed.includes(context.user.role)) throw errors.forbidden();
    request.auth = context;
  };
}

export function requireAuthContext(request: FastifyRequest): AuthContext {
  if (!request.auth) throw errors.unauthorized();
  return request.auth;
}
