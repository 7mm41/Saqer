/** Attempt limiter with doubling locks (§9.1, §13). Keys are hashed before storage. */
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../db';
import { attempts } from '../db/schema';
import { tooMany } from '../lib/errors';

export async function assertNotLocked(tx: DbOrTx, key: string, now: number) {
  const r = await tx.select().from(attempts).where(eq(attempts.key, key));
  const row = r[0];
  if (row?.lockedUntil && row.lockedUntil.getTime() > now) {
    throw tooMany('otp_locked', { minutes: Math.ceil((row.lockedUntil.getTime() - now) / 60_000) });
  }
}

export async function recordFailure(tx: DbOrTx, key: string, now: number, opts: { max: number; baseLockMinutes: number; maxLockHours: number }) {
  const r = await tx.select().from(attempts).where(eq(attempts.key, key));
  const row = r[0];
  const count = (row?.count ?? 0) + 1;
  if (count >= opts.max) {
    const level = (row?.lockLevel ?? 0) + 1;
    const minutes = Math.min(opts.baseLockMinutes * 2 ** (level - 1), opts.maxLockHours * 60);
    const lockedUntil = new Date(now + minutes * 60_000);
    if (row) await tx.update(attempts).set({ count: 0, lockLevel: level, lockedUntil }).where(eq(attempts.key, key));
    else await tx.insert(attempts).values({ key, count: 0, lockLevel: level, lockedUntil });
    return { locked: true, minutes };
  }
  if (row) await tx.update(attempts).set({ count }).where(eq(attempts.key, key));
  else await tx.insert(attempts).values({ key, count });
  return { locked: false, minutes: 0 };
}

export async function recordSuccess(tx: DbOrTx, key: string) {
  await tx.update(attempts).set({ count: 0 }).where(eq(attempts.key, key));
}
