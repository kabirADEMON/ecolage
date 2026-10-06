import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['director', 'cashier']);
export const paymentMethod = pgEnum('payment_method', ['cash', 'momo', 'bank']);
export const onlineStatus = pgEnum('online_status', ['pending', 'approved', 'declined', 'canceled']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const schools = pgTable('schools', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  phone: text('phone'),
  // Année scolaire en cours, ex. « 2026-2027 » : imprimée sur les reçus.
  yearLabel: text('year_label').notNull(),
  // Dernier numéro de reçu attribué. Incrémenté dans la transaction de l'encaissement :
  // les numéros se suivent sans trou ni doublon, même avec deux caisses en même temps.
  receiptSeq: integer('receipt_seq').notNull().default(0),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull(),
    active: boolean('active').notNull().default(true),
    // Incrémentée au changement de mot de passe ou à la désactivation : coupe les sessions.
    sessionVersion: integer('session_version').notNull().default(1),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('users_school_idx').on(t.schoolId)],
);

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Ordre d'affichage (CI avant CP, 6e avant 5e...).
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [unique('classes_school_name').on(t.schoolId, t.name)],
);

// Échéancier d'une classe : inscription, puis tranches avec leur date limite.
export const installments = pgTable(
  'installments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    amount: integer('amount').notNull(),
    dueDate: date('due_date').notNull(),
    position: integer('position').notNull(),
  },
  (t) => [check('installments_amount_positive', sql`${t.amount} > 0`), index('installments_class_idx').on(t.classId)],
);

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id),
    // Matricule lisible, unique dans l'école : « 26-0042 ».
    matricule: text('matricule').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    parentName: text('parent_name').notNull(),
    parentPhone: text('parent_phone'),
    // Réduction accordée (fratrie, bourse...) en F CFA, retirée des dernières tranches.
    discount: integer('discount').notNull().default(0),
    // Jeton du portail parents. Révocable.
    shareToken: text('share_token').notNull().unique(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('students_school_matricule').on(t.schoolId, t.matricule),
    check('students_discount_positive', sql`${t.discount} >= 0`),
    index('students_school_idx').on(t.schoolId),
    index('students_class_idx').on(t.classId),
  ],
);

export const onlinePayments = pgTable(
  'online_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref').unique(),
    status: onlineStatus('status').notNull().default('pending'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('online_amount_positive', sql`${t.amount} > 0`)],
);

// Un paiement = un reçu numéroté. Un reçu ne se supprime jamais : on l'annule
// (motif et auteur obligatoires), il reste dans la caisse, barré.
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    schoolId: uuid('school_id')
      .notNull()
      .references(() => schools.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    receiptNumber: integer('receipt_number').notNull(),
    amount: integer('amount').notNull(),
    method: paymentMethod('method').notNull(),
    reference: text('reference'),
    // Caissier qui a encaissé (null pour un paiement Mobile Money en ligne).
    receivedBy: uuid('received_by').references(() => users.id),
    onlinePaymentId: uuid('online_payment_id')
      .unique()
      .references(() => onlinePayments.id),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    cancelReason: text('cancel_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('payments_school_receipt').on(t.schoolId, t.receiptNumber),
    check('payments_amount_positive', sql`${t.amount} > 0`),
    check(
      'payments_cancel_complete',
      sql`(${t.cancelledAt} IS NULL) = (${t.cancelledBy} IS NULL) AND (${t.cancelledAt} IS NULL) = (${t.cancelReason} IS NULL)`,
    ),
    index('payments_student_idx').on(t.studentId),
    index('payments_school_date_idx').on(t.schoolId, t.createdAt),
  ],
);

export type School = typeof schools.$inferSelect;
export type User = typeof users.$inferSelect;
export type SchoolClass = typeof classes.$inferSelect;
export type Installment = typeof installments.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type OnlinePayment = typeof onlinePayments.$inferSelect;
