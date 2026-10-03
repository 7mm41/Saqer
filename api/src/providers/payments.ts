/**
 * PaymentProvider (§3). The webhook only tells us *something* happened; the truth is always
 * re-fetched from the provider server-to-server before money is recorded.
 */
import { createHmac } from 'node:crypto';
import type { Config } from '../config';
import { safeEqual } from '../lib/crypto';

export interface CheckoutInput {
  paymentId: string;
  amount: number; // baisa
  description: string;
  successUrl: string;
  cancelUrl: string;
}

export type ProviderStatus = 'paid' | 'pending' | 'failed' | 'cancelled';

export interface PaymentProvider {
  name: 'mock' | 'thawani';
  live: boolean;
  createCheckout(i: CheckoutInput): Promise<{ providerRef: string; url: string }>;
  fetchStatus(providerRef: string): Promise<{ status: ProviderStatus; providerPaymentId?: string | null; amount?: number }>;
  refund(i: { providerPaymentId: string; amount: number; reason: string; paymentId: string }): Promise<{ providerRef: string }>;
  /** Returns the checkout reference named in a verified webhook, or null. */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): { eventId: string; providerRef: string } | null;
}

/** Mock provider: a hosted page served by our API with "pay" and "fail" buttons. */
export class MockPayments implements PaymentProvider {
  name = 'mock' as const;
  live = false;
  readonly state = new Map<string, ProviderStatus>();
  constructor(private apiUrl: string, private sign: (s: string) => string) {}
  async createCheckout(i: CheckoutInput) {
    const ref = `mock_${i.paymentId}`;
    this.state.set(ref, 'pending');
    const sig = this.sign(ref);
    return { providerRef: ref, url: `${this.apiUrl}/api/mock-pay/${encodeURIComponent(ref)}?sig=${sig}&ok=${encodeURIComponent(i.successUrl)}&cancel=${encodeURIComponent(i.cancelUrl)}` };
  }
  async fetchStatus(ref: string) {
    return { status: this.state.get(ref) ?? 'pending', providerPaymentId: `${ref}_pay` };
  }
  async refund(i: { providerPaymentId: string }) {
    return { providerRef: `refund_${i.providerPaymentId}_${Date.now()}` };
  }
  verifyWebhook() {
    return null;
  }
}

/**
 * Thawani Pay (Oman) — hosted checkout sessions. Amounts are in baisa.
 * Endpoints follow Thawani's published API; confirm every field against the current
 * documentation during sandbox integration before any live use (LEGAL GATE + G2).
 */
export class ThawaniPayments implements PaymentProvider {
  name = 'thawani' as const;
  constructor(private cfg: Config) {}
  get live() {
    return this.cfg.THAWANI_LIVE;
  }
  private async call(path: string, init: RequestInit = {}) {
    if (!this.cfg.THAWANI_SECRET_KEY) throw new Error('THAWANI_SECRET_KEY is not set');
    const res = await fetch(`${this.cfg.THAWANI_BASE_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', 'thawani-api-key': this.cfg.THAWANI_SECRET_KEY, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Record<string, unknown>; description?: string };
    if (!res.ok || body.success === false) throw new Error(`thawani ${path} failed: ${res.status} ${body.description ?? ''}`);
    return body.data ?? {};
  }
  async createCheckout(i: CheckoutInput) {
    const data = await this.call('/api/v1/checkout/session', {
      method: 'POST',
      body: JSON.stringify({
        client_reference_id: i.paymentId,
        mode: 'payment',
        products: [{ name: i.description.slice(0, 40), quantity: 1, unit_amount: i.amount }],
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
        metadata: { payment_id: i.paymentId },
      }),
    });
    const sessionId = String(data.session_id ?? '');
    if (!sessionId) throw new Error('thawani: no session id');
    return { providerRef: sessionId, url: `${this.cfg.THAWANI_BASE_URL}/pay/${sessionId}?key=${this.cfg.THAWANI_PUBLISHABLE_KEY ?? ''}` };
  }
  async fetchStatus(ref: string) {
    const data = await this.call(`/api/v1/checkout/session/${encodeURIComponent(ref)}`);
    const st = String(data.payment_status ?? 'unpaid');
    const status: ProviderStatus = st === 'paid' ? 'paid' : st === 'cancelled' ? 'cancelled' : 'pending';
    const invoice = data.invoice ? String(data.invoice) : null;
    let providerPaymentId: string | null = null;
    if (status === 'paid' && invoice) {
      const pays = (await this.call(`/api/v1/payments?checkout_invoice=${encodeURIComponent(invoice)}&limit=1&skip=0`)) as unknown;
      const first = Array.isArray(pays) ? (pays[0] as Record<string, unknown> | undefined) : undefined;
      providerPaymentId = first?.payment_id ? String(first.payment_id) : null;
    }
    return { status, providerPaymentId, amount: typeof data.total_amount === 'number' ? data.total_amount : undefined };
  }
  async refund(i: { providerPaymentId: string; amount: number; reason: string; paymentId: string }) {
    const data = await this.call('/api/v1/refunds', {
      method: 'POST',
      body: JSON.stringify({ payment_id: i.providerPaymentId, amount: i.amount, reason: i.reason.slice(0, 100), metadata: { payment_id: i.paymentId } }),
    });
    return { providerRef: String(data.refund_id ?? '') };
  }
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string) {
    const secret = this.cfg.THAWANI_WEBHOOK_SECRET;
    const sig = String(headers['thawani-signature'] ?? '');
    const ts = String(headers['thawani-timestamp'] ?? '');
    if (!secret || !sig || !ts) return null;
    const expected = createHmac('sha256', secret).update(`${rawBody}-${ts}`).digest('hex');
    if (!safeEqual(expected, sig)) return null;
    try {
      const body = JSON.parse(rawBody) as { event_type?: string; data?: { session_id?: string; id?: string } };
      const ref = body.data?.session_id;
      if (!ref) return null;
      return { eventId: `${body.event_type ?? 'event'}:${body.data?.id ?? ref}:${ts}`, providerRef: ref };
    } catch {
      return null;
    }
  }
}
