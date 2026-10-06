import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  // Absent : base PGlite embarquée (Postgres en WebAssembly), idéale en local.
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('.data/pglite'),
  JWT_SECRET: z.string().min(32).optional(),
  APP_URL: z.string().url().default('http://localhost:5173'),
  PAYMENT_PROVIDER: z.enum(['fedapay', 'mock']).optional(),
  FEDAPAY_SECRET_KEY: z.string().optional(),
  FEDAPAY_WEBHOOK_SECRET: z.string().optional(),
  FEDAPAY_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
  DEMO_MODE: bool,
  SERVE_WEB: bool,
  TRUST_PROXY: bool,
});

export type Config = {
  env: 'development' | 'production' | 'test';
  port: number;
  databaseUrl: string | undefined;
  pgliteDir: string | undefined;
  jwtSecret: string;
  appUrl: string;
  payments:
    { provider: 'mock' } | { provider: 'fedapay'; secretKey: string; webhookSecret: string; env: 'sandbox' | 'live' };
  demoMode: boolean;
  serveWeb: boolean;
  trustProxy: boolean;
  rateLimit: boolean;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const env = EnvSchema.parse(source);
  const production = env.NODE_ENV === 'production';

  if (production && !env.JWT_SECRET) {
    throw new Error('JWT_SECRET (32 caractères minimum) est obligatoire en production.');
  }

  const provider = env.PAYMENT_PROVIDER ?? (env.FEDAPAY_SECRET_KEY ? 'fedapay' : 'mock');
  if (provider === 'fedapay' && (!env.FEDAPAY_SECRET_KEY || !env.FEDAPAY_WEBHOOK_SECRET)) {
    throw new Error('FEDAPAY_SECRET_KEY et FEDAPAY_WEBHOOK_SECRET sont obligatoires avec PAYMENT_PROVIDER=fedapay.');
  }
  if (production && provider === 'mock' && !env.DEMO_MODE) {
    throw new Error('Le paiement simulé est réservé au développement et au mode démo.');
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    pgliteDir: env.NODE_ENV === 'test' ? undefined : env.PGLITE_DIR,
    jwtSecret: env.JWT_SECRET ?? randomBytes(32).toString('hex'),
    appUrl: env.APP_URL.replace(/\/$/, ''),
    payments:
      provider === 'fedapay'
        ? {
            provider,
            secretKey: env.FEDAPAY_SECRET_KEY!,
            webhookSecret: env.FEDAPAY_WEBHOOK_SECRET!,
            env: env.FEDAPAY_ENV,
          }
        : { provider: 'mock' },
    demoMode: env.DEMO_MODE,
    serveWeb: env.SERVE_WEB,
    trustProxy: env.TRUST_PROXY,
    rateLimit: env.NODE_ENV !== 'test',
  };
}
