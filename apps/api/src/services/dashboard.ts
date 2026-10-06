import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { classes, payments } from '../db/schema.js';
import { localDay, localMonth } from '../domain/dates.js';
import { listStudents } from './fees.js';
import { dayBounds, recentPayments } from './payments.js';

export async function dashboard(db: DB, schoolId: string) {
  const [students, classRows, recent] = await Promise.all([
    listStudents(db, schoolId),
    db.select().from(classes).where(eq(classes.schoolId, schoolId)),
    recentPayments(db, schoolId, 6),
  ]);
  const active = students.filter((s) => !s.archived);

  const today = localDay();
  const monthStart = dayBounds(`${localMonth()}-01`).start;
  const [sums] = await db
    .select({
      today: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.createdAt} >= ${dayBounds(today).start}), 0)`,
      month: sql<string>`coalesce(sum(${payments.amount}), 0)`,
    })
    .from(payments)
    .where(and(eq(payments.schoolId, schoolId), isNull(payments.cancelledAt), gte(payments.createdAt, monthStart)));

  const perClass = classRows
    .sort((a, b) => a.position - b.position)
    .map((c) => {
      const list = active.filter((s) => s.classId === c.id);
      const expected = list.reduce((sum, s) => sum + s.totalNet, 0);
      const collected = list.reduce((sum, s) => sum + Math.min(s.totalPaid, s.totalNet), 0);
      return {
        id: c.id,
        name: c.name,
        students: list.length,
        expected,
        collected,
        overdue: list.reduce((sum, s) => sum + s.overdueAmount, 0),
        lateCount: list.filter((s) => s.state === 'late').length,
        rate: expected > 0 ? collected / expected : 0,
      };
    });

  const expected = perClass.reduce((s, c) => s + c.expected, 0);
  const collected = perClass.reduce((s, c) => s + c.collected, 0);
  const late = active.filter((s) => s.state === 'late').sort((a, b) => b.overdueAmount - a.overdueAmount);

  return {
    studentsCount: active.length,
    expected,
    collected,
    rate: expected > 0 ? collected / expected : 0,
    overdueAmount: late.reduce((s, x) => s + x.overdueAmount, 0),
    lateCount: late.length,
    settledCount: active.filter((s) => s.state === 'settled').length,
    collectedToday: Number(sums?.today ?? 0),
    collectedThisMonth: Number(sums?.month ?? 0),
    perClass,
    topLate: late.slice(0, 5),
    recent,
  };
}
