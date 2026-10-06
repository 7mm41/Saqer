/** Injectable clock so tests can fast-forward timers. */
export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

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
