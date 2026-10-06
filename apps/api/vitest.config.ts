import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Chaque fichier crée sa propre base PGlite en mémoire (Postgres en WebAssembly) :
    // un fichier à la fois, pour ne pas lancer plusieurs moteurs en même temps.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
