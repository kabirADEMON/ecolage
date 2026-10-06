import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/client.js';
import { schools, users } from '../db/schema.js';
import { hashSecret } from '../lib/security.js';
import { addSampleData, currentYearLabel } from '../services/school.js';

// Comptes d'exemple pour le développement :
//   direction : 01 00 00 00 10 / ecole2026
//   caisse    : 01 00 00 00 11 / caisse2026
const DIRECTOR = { phone: '0100000010', password: 'ecole2026' };
const CASHIER = { phone: '0100000011', password: 'caisse2026' };

const config = loadConfig();
const { db, close } = await openDatabase({ url: config.databaseUrl, pgliteDir: config.pgliteDir });

const existing = await db
  .select({ schoolId: users.schoolId })
  .from(users)
  .where(inArray(users.phone, [DIRECTOR.phone, CASHIER.phone]));
for (const e of existing) await db.delete(schools).where(eq(schools.id, e.schoolId));

const [school] = await db
  .insert(schools)
  .values({
    name: 'Complexe scolaire Les Palmiers',
    city: 'Cotonou',
    phone: DIRECTOR.phone,
    yearLabel: currentYearLabel(),
  })
  .returning();
await db.insert(users).values({
  schoolId: school!.id,
  name: 'Mme Adjovi',
  phone: DIRECTOR.phone,
  passwordHash: await hashSecret(DIRECTOR.password),
  role: 'director',
});
const [cashier] = await db
  .insert(users)
  .values({
    schoolId: school!.id,
    name: 'Rachidi',
    phone: CASHIER.phone,
    passwordHash: await hashSecret(CASHIER.password),
    role: 'cashier',
  })
  .returning();
await addSampleData(db, school!.id, cashier!.id);

console.log('École d’exemple prête.');
console.log(`  Direction : 01 00 00 00 10 / ${DIRECTOR.password}`);
console.log(`  Caisse    : 01 00 00 00 11 / ${CASHIER.password}`);
await close();
