import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DB, Tx } from '../db/client.js';
import { classes, installments, payments, students, type SchoolClass, type Student } from '../db/schema.js';
import { localDay } from '../domain/dates.js';
import { summarizeFees, type FeeSummary, type PlanItem } from '../domain/fees.js';
import { notFound } from '../lib/errors.js';

type Db = DB | Tx;

export async function getOwnedStudent(db: Db, schoolId: string, studentId: string): Promise<Student> {
  const [student] = await db
    .select()
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.schoolId, schoolId)));
  if (!student) throw notFound('Élève');
  return student;
}

export async function getOwnedClass(db: Db, schoolId: string, classId: string): Promise<SchoolClass> {
  const [found] = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.schoolId, schoolId)));
  if (!found) throw notFound('Classe');
  return found;
}

export async function plansByClass(db: Db, classIds: string[]): Promise<Map<string, PlanItem[]>> {
  const map = new Map<string, PlanItem[]>();
  if (classIds.length === 0) return map;
  const rows = await db
    .select()
    .from(installments)
    .where(inArray(installments.classId, classIds))
    .orderBy(asc(installments.position));
  for (const r of rows) {
    const item = { id: r.id, label: r.label, amount: r.amount, dueDate: r.dueDate, position: r.position };
    const list = map.get(r.classId);
    if (list) list.push(item);
    else map.set(r.classId, [item]);
  }
  return map;
}

// Total encaissé par élève (reçus non annulés).
export async function paidByStudent(db: Db, studentIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (studentIds.length === 0) return map;
  const rows = await db
    .select({ studentId: payments.studentId, total: sql<string>`sum(${payments.amount})` })
    .from(payments)
    .where(and(inArray(payments.studentId, studentIds), isNull(payments.cancelledAt)))
    .groupBy(payments.studentId);
  for (const r of rows) map.set(r.studentId, Number(r.total));
  return map;
}

export async function studentSummary(db: Db, student: Student): Promise<FeeSummary> {
  const plans = await plansByClass(db, [student.classId]);
  const paid = await paidByStudent(db, [student.id]);
  return summarizeFees(plans.get(student.classId) ?? [], student.discount, paid.get(student.id) ?? 0, localDay());
}

export type StudentRow = {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  classId: string;
  className: string;
  parentName: string;
  parentPhone: string | null;
  archived: boolean;
  totalNet: number;
  totalPaid: number;
  balance: number;
  overdueAmount: number;
  state: FeeSummary['state'];
  nextDue: FeeSummary['nextDue'];
};

export async function listStudents(db: DB, schoolId: string): Promise<StudentRow[]> {
  const rows = await db
    .select({ student: students, className: classes.name, classPosition: classes.position })
    .from(students)
    .innerJoin(classes, eq(classes.id, students.classId))
    .where(eq(students.schoolId, schoolId));
  const [plans, paid] = await Promise.all([
    plansByClass(db, [...new Set(rows.map((r) => r.student.classId))]),
    paidByStudent(
      db,
      rows.map((r) => r.student.id),
    ),
  ]);
  const today = localDay();
  return rows
    .sort(
      (a, b) =>
        a.classPosition - b.classPosition ||
        a.student.lastName.localeCompare(b.student.lastName, 'fr') ||
        a.student.firstName.localeCompare(b.student.firstName, 'fr'),
    )
    .map(({ student: s, className }) => {
      const summary = summarizeFees(plans.get(s.classId) ?? [], s.discount, paid.get(s.id) ?? 0, today);
      return {
        id: s.id,
        matricule: s.matricule,
        firstName: s.firstName,
        lastName: s.lastName,
        classId: s.classId,
        className,
        parentName: s.parentName,
        parentPhone: s.parentPhone,
        archived: s.archivedAt !== null,
        totalNet: summary.totalNet,
        totalPaid: summary.totalPaid,
        balance: summary.balance,
        overdueAmount: summary.overdueAmount,
        state: summary.state,
        nextDue: summary.nextDue,
      };
    });
}
