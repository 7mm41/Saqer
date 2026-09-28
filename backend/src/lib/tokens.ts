import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '../db/schema.ts';

export type TokenClaims = { userId: string; sessionId: string; role: Role };

/** HS256 bearer tokens; each one is tied to a revocable session row. */
export function createTokenService(secret: string, ttlDays: number) {
  const key = new TextEncoder().encode(secret);
  return {
    async sign(claims: TokenClaims): Promise<string> {
      return new SignJWT({ sid: claims.sessionId, role: claims.role })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.userId)
        .setIssuedAt()
        .setExpirationTime(`${ttlDays}d`)
        .sign(key);
    },
    async verify(token: string): Promise<TokenClaims | null> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
        if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
        return { userId: payload.sub, sessionId: payload.sid, role: payload.role as Role };
      } catch {
        return null;
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;
