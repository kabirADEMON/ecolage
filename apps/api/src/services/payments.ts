import { and, asc, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DB, Tx } from '../db/client.js';
import { classes, onlinePayments, payments, schools, students, users, type Payment, type User } from '../db/schema.js';
import { localDay } from '../domain/dates.js';
import { amountInWords } from '../domain/fees.js';
import { HttpError, notFound } from '../lib/errors.js';
import type { PaymentProvider, ProviderStatus } from '../payments/provider.js';
import { getOwnedStudent, studentSummary } from './fees.js';

export const MIN_MOMO_AMOUNT = 100;

// Verrouille l'école le temps d'attribuer un numéro de reçu : deux caisses qui encaissent
// au même instant obtiennent deux numéros consécutifs, jamais le même ni un trou.
async function nextReceiptNumber(tx: Tx, schoolId: string): Promise<number> {
  const [row] = await tx
    .update(schools)
    .set({ receiptSeq: sql`${schools.receiptSeq} + 1` })
    .where(eq(schools.id, schoolId))
    .returning({ seq: schools.receiptSeq });
  return row!.seq;
}

export async function collectPayment(
  db: DB,
  user: User,
  studentId: string,
  input: { amount: number; method: 'cash' | 'bank' | 'momo'; reference: string | null },
): Promise<Payment> {
  return db.transaction(async (tx) => {
    const student = await getOwnedStudent(tx, user.schoolId, studentId);
    if (student.archivedAt) throw new HttpError(409, 'archived', 'Cet élève est archivé.');
    // Verrou sur l'élève : deux encaissements simultanés ne peuvent pas dépasser le reste à payer.
    await tx.select({ id: students.id }).from(students).where(eq(students.id, student.id)).for('update');
    const { balance } = await studentSummary(tx, student);
    if (balance <= 0) throw new HttpError(409, 'nothing_due', 'Cet élève a déjà tout payé.');
    if (input.amount > balance) {
      throw new HttpError(409, 'overpayment', `Il ne reste que ${balance} F à payer.`, {
        amount: `Maximum : ${balance} F`,
      });
    }
    const receiptNumber = await nextReceiptNumber(tx, user.schoolId);
    const [payment] = await tx
      .insert(payments)
      .values({
        schoolId: user.schoolId,
        studentId: student.id,
        receiptNumber,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        receivedBy: user.id,
      })
      .returning();
    return payment!;
  });
}

export async function cancelPayment(db: DB, director: User, paymentId: string, reason: string): Promise<Payment> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.schoolId, director.schoolId)));
  if (!payment) throw notFound('Reçu');
  if (payment.cancelledAt) throw new HttpError(409, 'already_cancelled', 'Ce reçu est déjà annulé.');
  if (payment.onlinePaymentId) {
    throw new HttpError(409, 'online_payment', 'Un paiement Mobile Money reçu en ligne ne s’annule pas ici.');
  }
  const [updated] = await db
    .update(payments)
    .set({ cancelledAt: new Date(), cancelledBy: director.id, cancelReason: reason })
    .where(and(eq(payments.id, payment.id), isNull(payments.cancelledAt)))
    .returning();
  if (!updated) throw new HttpError(409, 'already_cancelled', 'Ce reçu est déjà annulé.');
  return updated;
}

const cashier = alias(users, 'cashier');
const canceller = alias(users, 'canceller');

export async function receipt(db: DB, schoolId: string, paymentId: string) {
  const [row] = await db
    .select({
      payment: payments,
      student: students,
      className: classes.name,
      school: schools,
      cashierName: cashier.name,
      cancelledByName: canceller.name,
    })
    .from(payments)
    .innerJoin(students, eq(students.id, payments.studentId))
    .innerJoin(classes, eq(classes.id, students.classId))
    .innerJoin(schools, eq(schools.id, payments.schoolId))
    .leftJoin(cashier, eq(cashier.id, payments.receivedBy))
    .leftJoin(canceller, eq(canceller.id, payments.cancelledBy))
    .where(and(eq(payments.id, paymentId), eq(payments.schoolId, schoolId)));
  if (!row) throw notFound('Reçu');

  // Reste à payer juste après ce reçu : total dû moins les reçus valides jusqu'à celui-ci inclus.
  const summary = await studentSummary(db, row.student);
  const [{ upTo } = { upTo: '0' }] = await db
    .select({ upTo: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.studentId, row.student.id),
        isNull(payments.cancelledAt),
        lte(payments.receiptNumber, row.payment.receiptNumber),
      ),
    );

  const p = row.payment;
  return {
    id: p.id,
    receiptNumber: p.receiptNumber,
    amount: p.amount,
    amountInWords: amountInWords(p.amount),
    method: p.method,
    reference: p.reference,
    createdAt: p.createdAt.toISOString(),
    cashierName: row.cashierName,
    online: p.onlinePaymentId !== null,
    cancelled: p.cancelledAt
      ? { at: p.cancelledAt.toISOString(), by: row.cancelledByName, reason: p.cancelReason }
      : null,
    balanceAfter: summary.totalNet - Number(upTo),
    school: { name: row.school.name, city: row.school.city, phone: row.school.phone, yearLabel: row.school.yearLabel },
    student: {
      id: row.student.id,
      matricule: row.student.matricule,
      name: `${row.student.lastName} ${row.student.firstName}`,
      className: row.className,
      parentName: row.student.parentName,
    },
  };
}

export type PaymentRow = {
  id: string;
  receiptNumber: number;
  amount: number;
  method: Payment['method'];
  reference: string | null;
  createdAt: string;
  cashierName: string | null;
  online: boolean;
  cancelled: boolean;
  cancelReason: string | null;
  studentId: string;
  studentName: string;
  className: string;
};

async function paymentRows(db: DB, where: ReturnType<typeof and>, order: 'asc' | 'desc', limit?: number) {
  const query = db
    .select({
      payment: payments,
      firstName: students.firstName,
      lastName: students.lastName,
      className: classes.name,
      cashierName: cashier.name,
    })
    .from(payments)
    .innerJoin(students, eq(students.id, payments.studentId))
    .innerJoin(classes, eq(classes.id, students.classId))
    .leftJoin(cashier, eq(cashier.id, payments.receivedBy))
    .where(where)
    .orderBy(order === 'asc' ? asc(payments.receiptNumber) : desc(payments.receiptNumber));
  const rows = limit ? await query.limit(limit) : await query;
  return rows.map((r): PaymentRow => ({
    id: r.payment.id,
    receiptNumber: r.payment.receiptNumber,
    amount: r.payment.amount,
    method: r.payment.method,
    reference: r.payment.reference,
    createdAt: r.payment.createdAt.toISOString(),
    cashierName: r.cashierName,
    online: r.payment.onlinePaymentId !== null,
    cancelled: r.payment.cancelledAt !== null,
    cancelReason: r.payment.cancelReason,
    studentId: r.payment.studentId,
    studentName: `${r.lastName} ${r.firstName}`,
    className: r.className,
  }));
}

export function studentPayments(db: DB, studentId: string) {
  return paymentRows(db, and(eq(payments.studentId, studentId)), 'desc');
}

export function recentPayments(db: DB, schoolId: string, limit: number) {
  return paymentRows(db, and(eq(payments.schoolId, schoolId)), 'desc', limit);
}

// Le Bénin est à UTC+1 toute l'année : une journée locale commence à 23 h UTC la veille.
export function dayBounds(day: string): { start: Date; end: Date } {
  const start = new Date(`${day}T00:00:00+01:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

// Journal de caisse d'une journée : ce que chaque caissier doit remettre.
export async function cashJournal(db: DB, schoolId: string, day: string) {
  const { start, end } = dayBounds(day);
  const rows = await paymentRows(
    db,
    and(eq(payments.schoolId, schoolId), gte(payments.createdAt, start), lt(payments.createdAt, end)),
    'asc',
  );
  const valid = rows.filter((r) => !r.cancelled);
  const byMethod = { cash: 0, momo: 0, bank: 0 };
  const byCashier = new Map<string, { name: string; count: number; cash: number; total: number }>();
  for (const r of valid) {
    byMethod[r.method] += r.amount;
    const key = r.online ? 'En ligne (Mobile Money)' : (r.cashierName ?? '—');
    const entry = byCashier.get(key) ?? { name: key, count: 0, cash: 0, total: 0 };
    entry.count += 1;
    entry.total += r.amount;
    if (r.method === 'cash') entry.cash += r.amount;
    byCashier.set(key, entry);
  }
  return {
    day,
    payments: rows,
    total: valid.reduce((s, r) => s + r.amount, 0),
    count: valid.length,
    cancelledCount: rows.length - valid.length,
    byMethod,
    byCashier: [...byCashier.values()],
  };
}

// --- Paiement en ligne (portail parents) -----------------------------------------

export async function startOnlinePayment(
  db: DB,
  provider: PaymentProvider,
  appUrl: string,
  studentId: string,
  amount: number,
) {
  const [student] = await db.select().from(students).where(eq(students.id, studentId));
  if (!student) throw notFound('Élève');
  const summary = await studentSummary(db, student);
  if (summary.balance <= 0) throw new HttpError(409, 'nothing_due', 'La scolarité est entièrement payée.');
  const min = Math.min(MIN_MOMO_AMOUNT, summary.balance);
  if (amount < min || amount > summary.balance) {
    throw new HttpError(400, 'bad_amount', `Le montant doit être compris entre ${min} F et ${summary.balance} F.`, {
      amount: `Entre ${min} F et ${summary.balance} F`,
    });
  }
  const [school] = await db.select().from(schools).where(eq(schools.id, student.schoolId));
  const [online] = await db
    .insert(onlinePayments)
    .values({ schoolId: student.schoolId, studentId: student.id, amount, provider: provider.name })
    .returning();
  try {
    const checkout = await provider.createCheckout({
      paymentId: online!.id,
      amount,
      description: `${school!.name} - scolarité ${student.lastName} ${student.firstName} (${student.matricule})`,
      returnUrl: `${appUrl}/paiement/${online!.id}`,
    });
    await db
      .update(onlinePayments)
      .set({ providerRef: checkout.providerRef, updatedAt: new Date() })
      .where(eq(onlinePayments.id, online!.id));
    return { paymentId: online!.id, url: checkout.url };
  } catch (err) {
    await db
      .update(onlinePayments)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(onlinePayments.id, online!.id));
    throw err;
  }
}

// Idempotent : webhook rejoué ou reçu en même temps que la vérification au retour du parent.
export async function finalizeOnlinePayment(
  db: DB,
  where: { id: string } | { providerRef: string },
  status: Exclude<ProviderStatus, 'pending'>,
) {
  return db.transaction(async (tx) => {
    const condition =
      'id' in where ? eq(onlinePayments.id, where.id) : eq(onlinePayments.providerRef, where.providerRef);
    const [online] = await tx.select().from(onlinePayments).where(condition).for('update');
    if (!online) return null;
    if (online.status !== 'pending') return online;
    const [updated] = await tx
      .update(onlinePayments)
      .set({ status, updatedAt: new Date() })
      .where(eq(onlinePayments.id, online.id))
      .returning();
    if (status === 'approved') {
      // L'argent est reçu : un reçu est émis, même si le reste à payer a baissé entre-temps.
      const receiptNumber = await nextReceiptNumber(tx, online.schoolId);
      await tx.insert(payments).values({
        schoolId: online.schoolId,
        studentId: online.studentId,
        receiptNumber,
        amount: online.amount,
        method: 'momo',
        reference: online.providerRef,
        onlinePaymentId: online.id,
      });
    }
    return updated!;
  });
}

export async function onlinePaymentStatus(db: DB, provider: PaymentProvider, id: string) {
  const [row] = await db
    .select({ online: onlinePayments, student: students, schoolName: schools.name })
    .from(onlinePayments)
    .innerJoin(students, eq(students.id, onlinePayments.studentId))
    .innerJoin(schools, eq(schools.id, onlinePayments.schoolId))
    .where(eq(onlinePayments.id, id));
  if (!row) throw notFound('Paiement');
  let online = row.online;
  if (
    online.status === 'pending' &&
    online.providerRef &&
    provider.name === online.provider &&
    provider.name !== 'mock'
  ) {
    const status = await provider.fetchStatus(online.providerRef).catch(() => 'pending' as const);
    if (status !== 'pending') online = (await finalizeOnlinePayment(db, { id: online.id }, status)) ?? online;
  }
  const [issued] = await db.select({ id: payments.id }).from(payments).where(eq(payments.onlinePaymentId, online.id));
  const summary = await studentSummary(db, row.student);
  return {
    id: online.id,
    status: online.status,
    amount: online.amount,
    provider: online.provider,
    schoolName: row.schoolName,
    studentName: `${row.student.firstName} ${row.student.lastName}`,
    shareToken: row.student.shareToken,
    receiptId: issued?.id ?? null,
    balance: summary.balance,
    today: localDay(),
  };
}
