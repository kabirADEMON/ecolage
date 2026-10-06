import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/client.js';
import { purgeOldDemos } from './services/school.js';

const config = loadConfig();
const { db, close } = await openDatabase({ url: config.databaseUrl, pgliteDir: config.pgliteDir });

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET absent : clé aléatoire générée, les sessions ne survivront pas au redémarrage.');
}

if (config.demoMode) {
  await purgeOldDemos(db);
  setInterval(() => purgeOldDemos(db).catch(console.error), 3_600_000).unref();
}

const server = createApp(db, config).listen(config.port, () => {
  console.log(
    `Écolage API sur http://localhost:${config.port} · base ${config.databaseUrl ? 'PostgreSQL' : 'PGlite'} · paiements ${config.payments.provider}${config.demoMode ? ' · démo' : ''}`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      close().finally(() => process.exit(0));
    });
  });
}
