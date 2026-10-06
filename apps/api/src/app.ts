import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express, { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Config } from './config.js';
import type { DB } from './db/client.js';
import { requireUser } from './lib/auth.js';
import { errorHandler, HttpError } from './lib/errors.js';
import { FedaPayProvider } from './payments/fedapay.js';
import { MockProvider } from './payments/mock.js';
import type { PaymentProvider } from './payments/provider.js';
import { authRoutes } from './routes/auth.js';
import { classRoutes } from './routes/classes.js';
import { paymentRoutes } from './routes/payments.js';
import { publicRoutes, webhookRoutes } from './routes/public.js';
import { schoolRoutes } from './routes/school.js';
import { studentRoutes } from './routes/students.js';

export function createProvider(config: Config): PaymentProvider {
  return config.payments.provider === 'fedapay'
    ? new FedaPayProvider(config.payments)
    : new MockProvider(config.appUrl);
}

export function createApp(db: DB, config: Config, provider: PaymentProvider = createProvider(config)) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: config.env === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  const limit = (windowMinutes: number, max: number): RequestHandler =>
    config.rateLimit
      ? rateLimit({
          windowMs: windowMinutes * 60_000,
          limit: max,
          standardHeaders: 'draft-8',
          legacyHeaders: false,
          handler: (_req, res) =>
            res
              .status(429)
              .json({ error: { code: 'rate_limited', message: 'Trop de requêtes. Patientez un instant.' } }),
        })
      : (_req, _res, next) => next();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, payments: provider.name, demo: config.demoMode });
  });

  app.use('/api/webhooks', webhookRoutes(db, provider));

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  // Protection CSRF en plus du cookie SameSite=Lax : l'API n'accepte que du JSON.
  app.use('/api', (req, _res, next) => {
    const mutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
    const hasBody = req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] ?? 0) > 0;
    if (mutating && hasBody && !req.is('application/json')) {
      throw new HttpError(415, 'unsupported_media_type', 'Envoyez du JSON.');
    }
    next();
  });

  app.use('/api/auth', limit(15, 30), authRoutes(db, config));
  app.use('/api/public', limit(1, 60), publicRoutes(db, provider, config.appUrl));
  app.use(
    '/api',
    limit(1, 300),
    requireUser(db, config),
    schoolRoutes(db, config),
    classRoutes(db),
    studentRoutes(db),
    paymentRoutes(db),
  );
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found', 'Route inconnue.')));

  if (config.serveWeb) {
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
    if (existsSync(dist)) {
      app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }));
      app.use(express.static(dist, { index: false, maxAge: '1h' }));
      app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    }
  }

  app.use(errorHandler);
  return app;
}
