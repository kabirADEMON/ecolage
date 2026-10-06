import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const baseURL = `http://localhost:${PORT}`;

// L'API sert l'interface compilée (npm run build) : on teste l'application comme en production,
// avec une base PGlite neuve et le paiement simulé.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    locale: 'fr-FR',
    timezoneId: 'Africa/Porto-Novo',
    trace: 'retain-on-failure',
    // En local, le navigateur Edge déjà installé suffit ; la CI installe Chromium.
    ...(process.env.CI ? {} : { channel: 'msedge' }),
  },
  // L'école travaille sur un ordinateur à la caisse ; les parents ouvrent le portail sur leur téléphone
  // (les tests du portail créent leur propre page au format mobile).
  projects: [
    {
      name: 'bureau',
      use: {
        ...devices['Desktop Edge'],
        viewport: { width: 1366, height: 860 },
        ...(process.env.CI ? { channel: undefined } : {}),
      },
    },
  ],
  webServer: {
    command: 'npx tsx ../api/src/server.ts',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: 'development',
      PORT: String(PORT),
      APP_URL: baseURL,
      SERVE_WEB: 'true',
      DEMO_MODE: 'true',
      PAYMENT_PROVIDER: 'mock',
      PGLITE_DIR: `.data/e2e-${Date.now()}`,
      JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
    },
  },
});
