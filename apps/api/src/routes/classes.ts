import { Router } from 'express';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client.js';
import { classes, installments, students } from '../db/schema.js';
import { requireDirector, session } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { amountSchema, isoDate, uuidParam } from '../lib/validation.js';
import { getOwnedClass, plansByClass } from '../services/fees.js';

const ClassBody = z
  .object({
    name: z.string().trim().min(1, 'Nom de la classe requis.').max(30, 'Nom trop long.'),
    installments: z
      .array(
        z.object({
          label: z.string().trim().min(1, 'Libellé requis.').max(40, 'Libellé trop long.'),
          amount: amountSchema,
          dueDate: isoDate,
        }),
      )
      .min(1, 'Ajoutez au moins une échéance.')
      .max(12, '12 échéances au maximum.'),
  })
  .superRefine((body, ctx) => {
    // Les dates doivent suivre l'ordre des tranches : sinon « en retard » ne veut plus rien dire.
    for (let i = 1; i < body.installments.length; i++) {
      if (body.installments[i]!.dueDate < body.installments[i - 1]!.dueDate) {
        ctx.addIssue({
          code: 'custom',
          path: ['installments', i, 'dueDate'],
          message: 'Cette date est avant celle de l’échéance précédente.',
        });
      }
    }
  });

export function classRoutes(db: DB) {
  const r = Router();

  async function classesWithPlans(schoolId: string) {
    const list = await db.select().from(classes).where(eq(classes.schoolId, schoolId)).orderBy(asc(classes.position));
    const plans = await plansByClass(
      db,
      list.map((c) => c.id),
    );
    const counts = await db
      .select({ classId: students.classId, n: count() })
      .from(students)
      .where(eq(students.schoolId, schoolId))
      .groupBy(students.classId);
    return list.map((c) => {
      const plan = plans.get(c.id) ?? [];
      return {
        id: c.id,
        name: c.name,
        position: c.position,
        total: plan.reduce((s, i) => s + i.amount, 0),
        studentsCount: counts.find((x) => x.classId === c.id)?.n ?? 0,
        installments: plan,
      };
    });
  }

  async function assertNameFree(schoolId: string, name: string, exceptId?: string) {
    const conditions = [eq(classes.schoolId, schoolId), eq(classes.name, name)];
    if (exceptId) conditions.push(ne(classes.id, exceptId));
    const [dup] = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(...conditions));
    if (dup) throw new HttpError(409, 'name_taken', 'Une classe porte déjà ce nom.', { name: 'Nom déjà utilisé' });
  }

  r.get('/classes', async (req, res) => {
    res.json({ classes: await classesWithPlans(session(req).school.id) });
  });

  r.post('/classes', requireDirector, async (req, res) => {
    const { school } = session(req);
    const body = ClassBody.parse(req.body);
    await assertNameFree(school.id, body.name);
    const existing = await db.select({ id: classes.id }).from(classes).where(eq(classes.schoolId, school.id));
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(classes)
        .values({ schoolId: school.id, name: body.name, position: existing.length })
        .returning();
      await tx
        .insert(installments)
        .values(body.installments.map((i, position) => ({ ...i, classId: created!.id, position })));
    });
    res.status(201).json({ classes: await classesWithPlans(school.id) });
  });

  // Modifier l'échéancier recalcule la situation de tous les élèves de la classe :
  // les paiements déjà reçus restent, ils sont simplement réimputés.
  r.put('/classes/:id', requireDirector, async (req, res) => {
    const { school } = session(req);
    const cls = await getOwnedClass(db, school.id, uuidParam.parse(req.params.id));
    const body = ClassBody.parse(req.body);
    await assertNameFree(school.id, body.name, cls.id);
    await db.transaction(async (tx) => {
      await tx.update(classes).set({ name: body.name }).where(eq(classes.id, cls.id));
      await tx.delete(installments).where(eq(installments.classId, cls.id));
      await tx
        .insert(installments)
        .values(body.installments.map((i, position) => ({ ...i, classId: cls.id, position })));
    });
    res.json({ classes: await classesWithPlans(school.id) });
  });

  r.delete('/classes/:id', requireDirector, async (req, res) => {
    const { school } = session(req);
    const cls = await getOwnedClass(db, school.id, uuidParam.parse(req.params.id));
    const [used] = await db.select({ n: count() }).from(students).where(eq(students.classId, cls.id));
    if (used && used.n > 0) {
      throw new HttpError(
        409,
        'class_in_use',
        'Des élèves sont inscrits dans cette classe : changez-les de classe d’abord.',
      );
    }
    await db.delete(classes).where(eq(classes.id, cls.id));
    res.json({ classes: await classesWithPlans(school.id) });
  });

  return r;
}
