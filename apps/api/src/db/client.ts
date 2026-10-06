import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export type Database = { db: DB; close: () => Promise<void> };

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

// Postgres partout : un vrai serveur via DATABASE_URL, sinon PGlite (Postgres compilé en
// WebAssembly) en fichier local ou en mémoire pour les tests. Mêmes migrations, même SQL.
export async function openDatabase(opts: { url?: string; pgliteDir?: string }): Promise<Database> {
  if (opts.url) {
    const { default: pg } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.Pool({ connectionString: opts.url, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder });
    return { db: db as unknown as DB, close: () => pool.end() };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  if (opts.pgliteDir) mkdirSync(opts.pgliteDir, { recursive: true });
  const client = new PGlite(opts.pgliteDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as DB, close: () => client.close() };
}
