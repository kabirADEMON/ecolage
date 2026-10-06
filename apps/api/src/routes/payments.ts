import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db/client.js';
import { localDay } from '../domain/dates.js';
import { formatBeninPhone } from '../domain/phone.js';
import { requireDirector, session } from '../lib/auth.js';
import { amountSchema, isoDate, optionalText, uuidParam } from '../lib/validation.js';
import { dashboard } from '../services/dashboard.js';
import { getOwnedStudent, listStudents } from '../services/fees.js';
import { cancelPayment, cashJournal, collectPayment, receipt } from '../services/payments.js';
import { studentDetail } from './students.js';

const CollectBody = z.object({
  amount: amountSchema,
  method: z.enum(['cash', 'bank', 'momo']).default('cash'),
  reference: optionalText(60),
});

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function paymentRoutes(db: DB) {
  const r = Router();

  r.post('/students/:id/payments', async (req, res) => {
    const { user, school } = session(req);
    const studentId = uuidParam.parse(req.params.id);
    const body = CollectBody.parse(req.body);
    const payment = await collectPayment(db, user, studentId, body);
    const student = await getOwnedStudent(db, school.id, studentId);
    res.status(201).json({
      paymentId: payment.id,
      receiptNumber: payment.receiptNumber,
      ...(await studentDetail(db, school.id, student)),
    });
  });

  r.post('/payments/:id/cancel', requireDirector, async (req, res) => {
    const { user } = session(req);
    const { reason } = z
      .object({ reason: z.string().trim().min(3, 'Indiquez le motif de l’annulation.').max(140) })
      .parse(req.body);
    const payment = await cancelPayment(db, user, uuidParam.parse(req.params.id), reason);
    res.json(await receipt(db, user.schoolId, payment.id));
  });

  r.get('/payments/:id/receipt', async (req, res) => {
    res.json(await receipt(db, session(req).school.id, uuidParam.parse(req.params.id)));
  });

  r.get('/cash', async (req, res) => {
    const day = isoDate.catch(localDay()).parse(req.query.date ?? localDay());
    res.json(await cashJournal(db, session(req).school.id, day));
  });

  r.get('/dashboard', async (req, res) => {
    res.json(await dashboard(db, session(req).school.id));
  });

  // Liste des impayés pour la relance : élèves en retard, du plus gros retard au plus petit.
  r.get('/export/impayes.csv', async (req, res) => {
    const list = (await listStudents(db, session(req).school.id))
      .filter((s) => !s.archived && s.state === 'late')
      .sort((a, b) => b.overdueAmount - a.overdueAmount);
    const header = [
      'Matricule',
      'Nom',
      'Prénom',
      'Classe',
      'Parent',
      'Téléphone',
      'En retard (F CFA)',
      'Reste à payer (F CFA)',
    ];
    const rows = list.map((s) => [
      s.matricule,
      s.lastName,
      s.firstName,
      s.className,
      s.parentName,
      s.parentPhone ? formatBeninPhone(s.parentPhone) : null,
      s.overdueAmount,
      s.balance,
    ]);
    const csv = '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    res.type('text/csv; charset=utf-8').attachment(`impayes-${localDay()}.csv`).send(csv);
  });

  return r;
}
