import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '../db/schema.ts';

/** `panel`: signed in from the control panel's secret address (the only way to manage anything). */
export type TokenClaims = { userId: string; sessionId: string; role: Role; panel: boolean };

/** Control panel sign-ins last a week; the app's, `ttlDays`. */
const PANEL_TTL = '7d';

/** HS256 bearer tokens; each one is tied to a revocable session row. */
export function createTokenService(secret: string, ttlDays: number) {
  const key = new TextEncoder().encode(secret);
  return {
    async sign(claims: TokenClaims): Promise<string> {
      return new SignJWT({ sid: claims.sessionId, role: claims.role, ...(claims.panel ? { pnl: true } : {}) })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.userId)
        .setIssuedAt()
        .setExpirationTime(claims.panel ? PANEL_TTL : `${ttlDays}d`)
        .sign(key);
    },
    async verify(token: string): Promise<TokenClaims | null> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
        return { userId: payload.sub, sessionId: payload.sid, role: payload.role as Role, panel: payload.pnl === true };
      } catch {
        return null;
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
