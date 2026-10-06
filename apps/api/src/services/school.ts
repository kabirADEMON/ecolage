import { randomInt } from 'node:crypto';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { DB, Tx } from '../db/client.js';
import { classes, installments, payments, schools, students, users, type User } from '../db/schema.js';
import { localDay } from '../domain/dates.js';
import { hashSecret, newShareToken } from '../lib/security.js';

// Année scolaire en cours : elle commence en septembre.
export function currentYearLabel(day = localDay()): string {
  const [y, m] = day.split('-').map(Number) as [number, number];
  const start = m >= 9 ? y : y - 1;
  return `${start}-${start + 1}`;
}

// Matricule « AA-NNNN » (AA = début de l'année scolaire). École verrouillée le temps du calcul.
export async function nextMatricule(tx: Tx, schoolId: string, yearLabel: string): Promise<string> {
  await tx.select({ id: schools.id }).from(schools).where(eq(schools.id, schoolId)).for('update');
  const prefix = `${yearLabel.slice(2, 4)}-`;
  const [row] = await tx
    .select({ max: sql<string | null>`max(substring(${students.matricule} from 4)::int)` })
    .from(students)
    .where(and(eq(students.schoolId, schoolId), sql`${students.matricule} like ${prefix + '%'}`));
  const next = Number(row?.max ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

const DAY = 86_400_000;

// Une école primaire et un collège de Cotonou, avec des montants réalistes en F CFA.
const SAMPLE_CLASSES: { name: string; fees: [number, number, number, number] }[] = [
  { name: 'CI', fees: [15_000, 40_000, 30_000, 25_000] },
  { name: 'CP', fees: [15_000, 40_000, 30_000, 25_000] },
  { name: 'CE1', fees: [15_000, 45_000, 35_000, 25_000] },
  { name: 'CM2', fees: [20_000, 50_000, 40_000, 30_000] },
  { name: '6e', fees: [25_000, 60_000, 50_000, 40_000] },
  { name: '3e', fees: [25_000, 70_000, 55_000, 45_000] },
];

const FIRST = [
  'Afi',
  'Koffi',
  'Mariam',
  'Rodrigue',
  'Sèna',
  'Fatou',
  'Brice',
  'Chantal',
  'Ulrich',
  'Grâce',
  'Yannick',
  'Nadège',
  'Ismaël',
  'Esther',
  'Romaric',
  'Aïcha',
  'Josué',
  'Bénédicta',
];
const LAST = [
  'Houngbo',
  'Agossou',
  'Bio',
  'Dossou',
  'Ahouandjinou',
  'Sanni',
  'Zinsou',
  'Adjovi',
  'Hounkpatin',
  'Tossou',
  'Gbaguidi',
  'Akplogan',
  'Soglo',
  'Kpadonou',
  'Lawani',
  'Dossa',
];

// Échéances relatives à aujourd'hui : l'inscription et la 1re tranche sont passées,
// pour que la démo montre des retards réalistes.
function sampleDueDates(now: number): [string, string, string, string] {
  return [-40, -10, 50, 140].map((d) => localDay(new Date(now + d * DAY))) as [string, string, string, string];
}

export async function addSampleData(db: DB, schoolId: string, cashierId: string, now = Date.now()) {
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
  const dues = sampleDueDates(now);
  let n = 0;
  const pending: (typeof payments.$inferInsert)[] = [];
  for (const [ci, spec] of SAMPLE_CLASSES.entries()) {
    const [cls] = await db.insert(classes).values({ schoolId, name: spec.name, position: ci }).returning();
    await db.insert(installments).values(
      ['Inscription', 'Tranche 1', 'Tranche 2', 'Tranche 3'].map((label, i) => ({
        classId: cls!.id,
        label,
        amount: spec.fees[i]!,
        dueDate: dues[i]!,
        position: i,
      })),
    );
    const total = spec.fees.reduce((a, b) => a + b, 0);
    for (let k = 0; k < 4; k++) {
      n += 1;
      const first = FIRST[(n * 7) % FIRST.length]!;
      const last = LAST[(n * 5 + ci) % LAST.length]!;
      const discount = n % 9 === 0 ? 20_000 : 0;
      const [student] = await db
        .insert(students)
        .values({
          schoolId,
          classId: cls!.id,
          matricule: `${school!.yearLabel.slice(2, 4)}-${String(n).padStart(4, '0')}`,
          firstName: first,
          lastName: last.toUpperCase(),
          parentName: `${n % 2 ? 'M.' : 'Mme'} ${last}`,
          parentPhone: `01${String(97_000_000 + n * 13_579).slice(0, 8)}`,
          discount,
          shareToken: newShareToken(),
        })
        .returning();
      // Profils variés : soldé, à jour, en retard, rien payé.
      const profile = n % 4;
      const paidTotal =
        profile === 0
          ? total - discount
          : profile === 1
            ? spec.fees[0] + spec.fees[1]
            : profile === 2
              ? spec.fees[0] + Math.round(spec.fees[1] / 2)
              : 0;
      const parts =
        paidTotal > spec.fees[0] ? [spec.fees[0], paidTotal - spec.fees[0]] : paidTotal > 0 ? [paidTotal] : [];
      for (const [pi, amount] of parts.entries()) {
        // Inscription payée il y a environ un mois, tranche payée ces derniers jours (parfois aujourd'hui).
        let at = new Date(now - (pi === 0 ? 28 + (n % 5) : n % 6) * DAY);
        at.setUTCHours(7 + (n % 8), (n * 11) % 60);
        if (at.getTime() > now) at = new Date(now - ((n % 5) + 1) * 1_800_000);
        pending.push({
          schoolId,
          studentId: student!.id,
          receiptNumber: 0,
          amount,
          method: (n + pi) % 4 === 0 ? 'momo' : (n + pi) % 7 === 0 ? 'bank' : 'cash',
          receivedBy: cashierId,
          createdAt: at,
        });
      }
    }
  }
  // Numéros de reçu dans l'ordre chronologique, comme à une vraie caisse.
  pending.sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  let receipt = school!.receiptSeq;
  for (const p of pending) p.receiptNumber = ++receipt;
  if (pending.length) await db.insert(payments).values(pending);
  await db.update(schools).set({ receiptSeq: receipt }).where(eq(schools.id, schoolId));
}

// Démo publique : chaque visiteur reçoit sa propre école d'exemple, connecté en directeur.
export async function createDemoSchool(db: DB): Promise<User> {
  const [school] = await db
    .insert(schools)
    .values({
      name: 'Complexe scolaire Les Palmiers (démo)',
      city: 'Cotonou',
      yearLabel: currentYearLabel(),
      isDemo: true,
    })
    .returning();
  const fakePhone = () => `00${String(randomInt(0, 1e8)).padStart(8, '0')}`;
  const hash = await hashSecret(String(randomInt(0, 1e9)));
  const [director] = await db
    .insert(users)
    .values({ schoolId: school!.id, name: 'Mme Adjovi', phone: fakePhone(), passwordHash: hash, role: 'director' })
    .returning();
  const [cashier] = await db
    .insert(users)
    .values({ schoolId: school!.id, name: 'Rachidi (caisse)', phone: fakePhone(), passwordHash: hash, role: 'cashier' })
    .returning();
  await addSampleData(db, school!.id, cashier!.id);
  return director!;
}

export async function purgeOldDemos(db: DB, olderThanHours = 24) {
  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);
  await db.delete(schools).where(and(eq(schools.isDemo, true), lt(schools.createdAt, cutoff)));
}
