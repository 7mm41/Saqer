/** In-process event bus for SSE, bridged over Postgres LISTEN/NOTIFY when available. */
import { EventEmitter } from 'node:events';
import type { DbHandle } from '../db';

export interface BusEvent {
  bookingId: string;
  status?: string;
  type: string;
  at: number;
}

export class Bus {
  private em = new EventEmitter();
  constructor(private handle?: DbHandle) {
    this.em.setMaxListeners(10_000);
  }

  async start() {
    if (this.handle?.listen) await this.handle.listen('katf_booking', (p) => this.em.emit('booking', JSON.parse(p)));
  }

  async publish(e: BusEvent) {
    if (this.handle?.notify) await this.handle.notify('katf_booking', JSON.stringify(e));
    else this.em.emit('booking', e);
  }

  subscribe(bookingId: string, fn: (e: BusEvent) => void): () => void {
    const h = (e: BusEvent) => {
      if (e.bookingId === bookingId) fn(e);
    };
    this.em.on('booking', h);
    return () => this.em.off('booking', h);
  }

  subscribeTechnician(fn: (e: BusEvent) => void): () => void {
    this.em.on('booking', fn);
    return () => this.em.off('booking', fn);
  }
}
