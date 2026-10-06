import { HttpError } from '../lib/errors.js';
import { hmacSha256Hex, safeEqualHex } from '../lib/security.js';
import type { PaymentProvider, ProviderStatus, WebhookEvent } from './provider.js';

type Options = {
  secretKey: string;
  webhookSecret: string;
  env: 'sandbox' | 'live';
  fetch?: typeof fetch;
  now?: () => number;
};

// Tolérance sur l'horodatage de la signature : bloque le rejeu d'un vieux webhook.
const SIGNATURE_TOLERANCE_S = 300;

const STATUS: Record<string, ProviderStatus> = {
  pending: 'pending',
  approved: 'approved',
  transferred: 'approved',
  declined: 'declined',
  canceled: 'canceled',
  refunded: 'canceled',
};

export class FedaPayProvider implements PaymentProvider {
  readonly name = 'fedapay' as const;
  private readonly base: string;
  private readonly http: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly opts: Options) {
    this.base = opts.env === 'live' ? 'https://api.fedapay.com/v1' : 'https://sandbox-api.fedapay.com/v1';
    this.http = opts.fetch ?? fetch;
    this.now = opts.now ?? (() => Date.now());
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await this.http(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.opts.secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`FedaPay ${method} ${path} -> ${res.status} ${detail.slice(0, 300)}`);
      throw new HttpError(
        502,
        'payment_provider',
        'Le service de paiement est indisponible. Réessayez dans un instant.',
      );
    }
    return (await res.json()) as T;
  }

  async createCheckout(req: { paymentId: string; amount: number; description: string; returnUrl: string }) {
    const created = await this.call<{ 'v1/transaction': { id: number } }>('POST', '/transactions', {
      description: req.description,
      amount: req.amount,
      currency: { iso: 'XOF' },
      callback_url: req.returnUrl,
      custom_metadata: { ecolage_payment_id: req.paymentId },
    });
    const id = created['v1/transaction'].id;
    const token = await this.call<{ token: string; url: string }>('POST', `/transactions/${id}/token`);
    return { providerRef: String(id), url: token.url };
  }

  async fetchStatus(providerRef: string): Promise<ProviderStatus> {
    const res = await this.call<{ 'v1/transaction': { status: string } }>('GET', `/transactions/${providerRef}`);
    return STATUS[res['v1/transaction'].status] ?? 'pending';
  }

  // En-tête « X-FEDAPAY-SIGNATURE: t=<horodatage>,s=<hmac> », HMAC-SHA256 de « t.corps ».
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): WebhookEvent | null {
    const header = headers['x-fedapay-signature'];
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) throw new HttpError(400, 'bad_signature', 'Signature manquante.');

    const parts = Object.fromEntries(
      value.split(',').map((kv) => {
        const i = kv.indexOf('=');
        return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
      }),
    );
    const t = Number(parts.t);
    const s = parts.s ?? '';
    if (!Number.isFinite(t) || !s) throw new HttpError(400, 'bad_signature', 'Signature illisible.');
    if (Math.abs(this.now() / 1000 - t) > SIGNATURE_TOLERANCE_S) {
      throw new HttpError(400, 'bad_signature', 'Signature expirée.');
    }
    const expected = hmacSha256Hex(this.opts.webhookSecret, `${t}.${rawBody}`);
    if (!safeEqualHex(expected, s)) throw new HttpError(400, 'bad_signature', 'Signature invalide.');

    const event = JSON.parse(rawBody) as { name?: string; entity?: { id?: number | string; status?: string } };
    if (!event.name?.startsWith('transaction.') || event.entity?.id === undefined) return null;
    const status = STATUS[event.entity.status ?? ''] ?? null;
    if (!status || status === 'pending') return null;
    return { providerRef: String(event.entity.id), status };
  }
}
