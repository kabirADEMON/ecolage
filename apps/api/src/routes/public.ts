import express, { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client.js';
import { classes, payments, schools, students } from '../db/schema.js';
import { formatBeninPhone } from '../domain/phone.js';
import { HttpError, notFound } from '../lib/errors.js';
import { amountSchema, uuidParam } from '../lib/validation.js';
import type { PaymentProvider } from '../payments/provider.js';
import { studentSummary } from '../services/fees.js';
import {
  finalizeOnlinePayment,
  MIN_MOMO_AMOUNT,
  onlinePaymentStatus,
  receipt,
  startOnlinePayment,
  studentPayments,
} from '../services/payments.js';

const tokenParam = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

async function studentByToken(db: DB, raw: unknown) {
  const parsed = tokenParam.safeParse(raw);
  if (!parsed.success) throw notFound('Lien');
  const [row] = await db
    .select({ student: students, school: schools, className: classes.name })
    .from(students)
    .innerJoin(schools, eq(schools.id, students.schoolId))
    .innerJoin(classes, eq(classes.id, students.classId))
    .where(eq(students.shareToken, parsed.data));
  if (!row) throw notFound('Lien');
  return row;
}

// Portail parents : consulter la scolarité de son enfant et payer, sans créer de compte.
export function publicRoutes(db: DB, provider: PaymentProvider, appUrl: string) {
  const r = Router();

  r.get('/students/:token', async (req, res) => {
    const { student, school, className } = await studentByToken(db, req.params.token);
    const [summary, list] = await Promise.all([studentSummary(db, student), studentPayments(db, student.id)]);
    res.json({
      school: {
        name: school.name,
        city: school.city,
        yearLabel: school.yearLabel,
        phone: school.phone,
        phoneDisplay: school.phone ? formatBeninPhone(school.phone) : null,
      },
      student: { firstName: student.firstName, lastName: student.lastName, matricule: student.matricule, className },
      summary,
      // Le parent voit ses reçus valides, sans le nom du caissier.
      payments: list
        .filter((p) => !p.cancelled)
        .map(({ id, receiptNumber, amount, method, createdAt }) => ({ id, receiptNumber, amount, method, createdAt })),
      payment: { provider: provider.name, minAmount: Math.min(MIN_MOMO_AMOUNT, Math.max(summary.balance, 0)) },
    });
  });

  r.get('/students/:token/receipts/:paymentId', async (req, res) => {
    const { student } = await studentByToken(db, req.params.token);
    const paymentId = uuidParam.parse(req.params.paymentId);
    const [owned] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.studentId, student.id)));
    if (!owned) throw notFound('Reçu');
    const data = await receipt(db, student.schoolId, paymentId);
    if (data.cancelled) throw notFound('Reçu');
    res.json(data);
  });

  r.post('/students/:token/payments', async (req, res) => {
    const { student } = await studentByToken(db, req.params.token);
    if (student.archivedAt) throw new HttpError(409, 'archived', 'Ce dossier est clos.');
    const { amount } = z.object({ amount: amountSchema }).parse(req.body);
    res.status(201).json(await startOnlinePayment(db, provider, appUrl, student.id, amount));
  });

  r.get('/payments/:id', async (req, res) => {
    res.json(await onlinePaymentStatus(db, provider, uuidParam.parse(req.params.id)));
  });

  r.post('/payments/:id/simulate', async (req, res) => {
    if (provider.name !== 'mock') throw notFound();
    const id = uuidParam.parse(req.params.id);
    const { outcome } = z.object({ outcome: z.enum(['approved', 'declined']) }).parse(req.body);
    if (!(await finalizeOnlinePayment(db, { id }, outcome))) throw notFound('Paiement');
    res.json(await onlinePaymentStatus(db, provider, id));
  });

  return r;
}

export function webhookRoutes(db: DB, provider: PaymentProvider) {
  const r = Router();
  r.post('/fedapay', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    if (provider.name !== 'fedapay') throw notFound();
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!raw) throw new HttpError(400, 'empty', 'Corps vide.');
    const event = provider.parseWebhook(raw, req.headers);
    if (event && event.status !== 'pending') {
      await finalizeOnlinePayment(db, { providerRef: event.providerRef }, event.status);
    }
    res.json({ received: true });
  });
  return r;
}
