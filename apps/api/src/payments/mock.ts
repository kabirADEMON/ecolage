import { HttpError } from '../lib/errors.js';
import type { PaymentProvider } from './provider.js';

// Prestataire simulé pour le développement, les tests et la démo publique :
// la « page de paiement » est un écran de l'application qui permet d'accepter
// ou de refuser le paiement. Interdit en production hors mode démo (voir config).
export class MockProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  constructor(private readonly appUrl: string) {}

  async createCheckout(req: { paymentId: string }) {
    return {
      providerRef: `mock_${req.paymentId}`,
      url: `${this.appUrl}/paiement/simulation/${req.paymentId}`,
    };
  }

  async fetchStatus() {
    return 'pending' as const;
  }

  parseWebhook(): never {
    throw new HttpError(404, 'not_found', 'Aucun webhook en mode simulation.');
  }
}
