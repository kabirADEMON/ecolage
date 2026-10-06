import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client.js';
import { classes, students, type Student } from '../db/schema.js';
import { normalizeBeninPhone } from '../domain/phone.js';
import { requireDirector, session } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { newShareToken } from '../lib/security.js';
import { nameSchema, optionalPhone, uuidParam } from '../lib/validation.js';
import { getOwnedClass, getOwnedStudent, listStudents, studentSummary } from '../services/fees.js';
import { studentPayments } from '../services/payments.js';
import { nextMatricule } from '../services/school.js';

const StudentBody = z.object({
  lastName: nameSchema('Nom').transform((v) => v.toUpperCase()),
  firstName: nameSchema('Prénom'),
  classId: uuidParam,
  parentName: nameSchema('Nom du parent'),
  parentPhone: optionalPhone,
  discount: z.coerce.number().int('Montant entier.').min(0, 'Montant positif.').max(10_000_000).default(0),
});

export async function studentDetail(db: DB, schoolId: string, student: Student) {
  const [cls] = await db.select().from(classes).where(eq(classes.id, student.classId));
  const [summary, payments] = await Promise.all([studentSummary(db, student), studentPayments(db, student.id)]);
  return {
    student: {
      id: student.id,
      matricule: student.matricule,
      firstName: student.firstName,
      lastName: student.lastName,
      classId: student.classId,
      className: cls!.name,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      discount: student.discount,
      shareToken: student.shareToken,
      archived: student.archivedAt !== null,
    },
    summary,
    payments,
  };
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function studentRoutes(db: DB) {
  const r = Router();

  r.get('/students', async (req, res) => {
    res.json({ students: await listStudents(db, session(req).school.id) });
  });

  r.post('/students', async (req, res) => {
    const { user, school } = session(req);
    const body = StudentBody.parse(req.body);
    if (body.discount > 0 && user.role !== 'director') {
      throw new HttpError(403, 'forbidden', 'Seule la direction accorde une réduction.');
    }
    await getOwnedClass(db, school.id, body.classId);
    const created = await db.transaction(async (tx) => {
      const matricule = await nextMatricule(tx, school.id, school.yearLabel);
      const [row] = await tx
        .insert(students)
        .values({ ...body, schoolId: school.id, matricule, shareToken: newShareToken() })
        .returning();
      return row!;
    });
    res.status(201).json(await studentDetail(db, school.id, created));
  });

  r.get('/students/:id', async (req, res) => {
    const { school } = session(req);
    const student = await getOwnedStudent(db, school.id, uuidParam.parse(req.params.id));
    res.json(await studentDetail(db, school.id, student));
  });

  r.patch('/students/:id', async (req, res) => {
    const { user, school } = session(req);
    const student = await getOwnedStudent(db, school.id, uuidParam.parse(req.params.id));
    const body = StudentBody.parse(req.body);
    // Le caissier corrige un nom ou un numéro ; la réduction et la classe engagent la direction.
    if (user.role !== 'director' && (body.discount !== student.discount || body.classId !== student.classId)) {
      throw new HttpError(403, 'forbidden', 'Seule la direction change la classe ou la réduction.');
    }
    await getOwnedClass(db, school.id, body.classId);
    const [updated] = await db.update(students).set(body).where(eq(students.id, student.id)).returning();
    res.json(await studentDetail(db, school.id, updated!));
  });

  r.post('/students/:id/archive', requireDirector, async (req, res) => {
    const { school } = session(req);
    const student = await getOwnedStudent(db, school.id, uuidParam.parse(req.params.id));
    const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
    const [updated] = await db
      .update(students)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(students.id, student.id))
      .returning();
    res.json(await studentDetail(db, school.id, updated!));
  });

  // Nouveau lien du portail parents : l'ancien cesse de fonctionner.
  r.post('/students/:id/share-link', async (req, res) => {
    const { school } = session(req);
    const student = await getOwnedStudent(db, school.id, uuidParam.parse(req.params.id));
    const [updated] = await db
      .update(students)
      .set({ shareToken: newShareToken() })
      .where(eq(students.id, student.id))
      .returning();
    res.json(await studentDetail(db, school.id, updated!));
  });

  // Import d'une liste (copiée d'Excel) : « Nom;Prénom;Classe;Parent;Téléphone ».
  // Tout ou rien : à la moindre ligne invalide, rien n'est importé et chaque erreur est signalée.
  r.post('/students/import', requireDirector, async (req, res) => {
    const { school } = session(req);
    const { csv } = z.object({ csv: z.string().max(200_000, 'Fichier trop volumineux.') }).parse(req.body);
    const lines = csv
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .map((l, i) => ({ text: l, line: i + 1 }))
      .filter((l) => l.text.trim());
    if (lines.length === 0) throw new HttpError(400, 'empty', 'La liste est vide.');
    const sep = (lines[0]!.text.match(/;/g)?.length ?? 0) >= (lines[0]!.text.match(/,/g)?.length ?? 0) ? ';' : ',';
    const first = splitCsvLine(lines[0]!.text, sep).map((c) => c.toLowerCase());
    const rows = first[0] === 'nom' ? lines.slice(1) : lines;
    if (rows.length > 1000) throw new HttpError(400, 'too_many', '1 000 élèves au maximum par import.');

    const classList = await db.select().from(classes).where(eq(classes.schoolId, school.id));
    const byName = new Map(classList.map((c) => [c.name.trim().toLowerCase(), c]));
    const errors: { line: number; message: string }[] = [];
    const parsed: {
      lastName: string;
      firstName: string;
      classId: string;
      parentName: string;
      parentPhone: string | null;
    }[] = [];

    for (const { text, line } of rows) {
      const [lastName = '', firstName = '', className = '', parentName = '', phone = ''] = splitCsvLine(text, sep);
      const cls = byName.get(className.toLowerCase());
      const parentPhone = phone ? normalizeBeninPhone(phone) : null;
      if (lastName.length < 2 || firstName.length < 2) errors.push({ line, message: 'Nom ou prénom manquant.' });
      else if (!cls) errors.push({ line, message: `Classe inconnue : « ${className} ».` });
      else if (phone && !parentPhone) errors.push({ line, message: `Numéro invalide : « ${phone} ».` });
      else {
        parsed.push({
          lastName: lastName.toUpperCase(),
          firstName,
          classId: cls.id,
          parentName: parentName.length >= 2 ? parentName : `Parent de ${firstName}`,
          parentPhone,
        });
      }
    }
    if (errors.length) {
      res
        .status(400)
        .json({ error: { code: 'import_errors', message: `${errors.length} ligne(s) à corriger.`, lines: errors } });
      return;
    }
    await db.transaction(async (tx) => {
      for (const p of parsed) {
        const matricule = await nextMatricule(tx, school.id, school.yearLabel);
        await tx.insert(students).values({ ...p, schoolId: school.id, matricule, shareToken: newShareToken() });
      }
    });
    res.status(201).json({ imported: parsed.length });
  });

  return r;
}
