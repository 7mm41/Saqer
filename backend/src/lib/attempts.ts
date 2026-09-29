/**
 * Stops password guessing. After `maxFailures` wrong passwords for the same key
 * (an email, or an address), that key is locked for 15 minutes, then 30, 1 h,
 * 2 h… up to a day, whatever address the guesses come from. Kept in memory: the
 * server runs as one process, and a restart (which only the owner can do) clears it.
 */
export class AttemptLimiter {
  private readonly entries = new Map<string, { failures: number; locks: number; lockedUntil: number; lastFailure: number }>();
  private readonly maxFailures: number;
  private readonly baseLockMs: number;
  private readonly maxLockMs: number;

  constructor({ maxFailures = 5, baseLockMs = 15 * 60_000, maxLockMs = 24 * 3_600_000 } = {}) {
    this.maxFailures = maxFailures;
    this.baseLockMs = baseLockMs;
    this.maxLockMs = maxLockMs;
  }

  /** Milliseconds until `key` may try again (0 = now). */
  lockedFor(key: string, now = Date.now()): number {
    const entry = this.entries.get(key);
    return entry && entry.lockedUntil > now ? entry.lockedUntil - now : 0;
  }

  fail(key: string, now = Date.now()) {
    this.prune(now);
    const entry = this.entries.get(key) ?? { failures: 0, locks: 0, lockedUntil: 0, lastFailure: 0 };
    // A quiet day forgets earlier locks.
    if (now - entry.lastFailure > this.maxLockMs) entry.locks = 0;
    entry.failures += 1;
    entry.lastFailure = now;
    if (entry.failures >= this.maxFailures) {
      entry.lockedUntil = now + Math.min(this.baseLockMs * 2 ** entry.locks, this.maxLockMs);
      entry.locks += 1;
      entry.failures = 0;
    }
    this.entries.set(key, entry);
  }

  succeed(key: string) {
    this.entries.delete(key);
  }

  /** Keeps memory bounded when many keys are tried. */
  private prune(now: number) {
    if (this.entries.size < 10_000) return;
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil < now && now - entry.lastFailure > this.maxLockMs) this.entries.delete(key);
    }
  }
}
