export type ProviderStatus = 'pending' | 'approved' | 'declined' | 'canceled';

export type CheckoutRequest = {
  paymentId: string;
  amount: number;
  description: string;
  returnUrl: string;
};

export type WebhookEvent = { providerRef: string; status: ProviderStatus };

export interface PaymentProvider {
  readonly name: 'fedapay' | 'mock';
  // Crée la transaction chez le prestataire et renvoie la page de paiement.
  createCheckout(req: CheckoutRequest): Promise<{ providerRef: string; url: string }>;
  // Interroge le prestataire (filet de sécurité si le webhook tarde).
  fetchStatus(providerRef: string): Promise<ProviderStatus>;
  // Vérifie la signature et extrait l'événement. Renvoie null si l'événement est ignoré.
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): WebhookEvent | null;
}
