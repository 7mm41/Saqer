/** Injectable clock so tests can fast-forward timers. */
export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

/**
 * The clock the database defaults use (created_at and friends). createContext points it at the context's
 * clock, so a row's creation time and the rules that compare against it (resend waits, appeal windows,
 * "today" reports) always read the same clock. In production that is the system clock either way.
 */
let defaultsClock: Clock = systemClock;
export function useClockForDefaults(c: Clock) {
  defaultsClock = c;
}
export const clockNow = () => new Date(defaultsClock.now());

export class FakeClock implements Clock {
  constructor(private t: number) {}
  now() {
    return this.t;
  }
  set(t: number) {
    this.t = t;
  }
  advance(ms: number) {
    this.t += ms;
  }
  advanceMinutes(m: number) {
    this.t += m * 60_000;
  }
}
