import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCashier,
  createClass,
  createStudent,
  day,
  directorAgent,
  setup,
  type StudentDetail,
  type TestApp,
} from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await setup();
});
afterAll(() => t.close());

describe('classes et échéanciers', () => {
  it('crée une classe avec son échéancier et son total', async () => {
    const { agent } = await directorAgent(t.app);
    await createClass(agent, 'CM2');
    const res = await agent.get('/api/classes').expect(200);
    expect(res.body.classes[0]).toMatchObject({ name: 'CM2', total: 60_000, studentsCount: 0 });
    expect(res.body.classes[0].installments.map((i: { label: string }) => i.label)).toEqual([
      'Inscription',
      'Tranche 1',
      'Tranche 2',
    ]);
  });

  it('refuse des dates qui ne suivent pas l’ordre des tranches, et un nom en double', async () => {
    const { agent } = await directorAgent(t.app);
    const bad = await agent
      .post('/api/classes')
      .send({
        name: '6e',
        installments: [
          { label: 'Tranche 1', amount: 30_000, dueDate: day(60) },
          { label: 'Tranche 2', amount: 30_000, dueDate: day(10) },
        ],
      })
      .expect(400);
    expect(bad.body.error.fields['installments.1.dueDate']).toMatch(/avant/);
    await createClass(agent, '6e');
    await agent
      .post('/api/classes')
      .send({ name: '6e', installments: [{ label: 'A', amount: 1, dueDate: day(1) }] })
      .expect(409);
  });

  it('recalcule la situation des élèves quand l’échéancier change', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const { student } = await createStudent(agent, cls.id);
    await agent.post(`/api/students/${student.id}/payments`).send({ amount: 10_000 }).expect(201);
    await agent
      .put(`/api/classes/${cls.id}`)
      .send({ name: 'CM2', installments: [{ label: 'Annuel', amount: 80_000, dueDate: day(20) }] })
      .expect(200);
    const after = (await agent.get(`/api/students/${student.id}`).expect(200)).body as StudentDetail;
    expect(after.summary).toMatchObject({ totalNet: 80_000, totalPaid: 10_000, balance: 70_000 });
  });

  it('ne supprime pas une classe qui a des élèves', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const empty = await createClass(agent, 'CE1');
    await createStudent(agent, cls.id);
    await agent.delete(`/api/classes/${cls.id}`).expect(409);
    await agent.delete(`/api/classes/${empty.id}`).expect(200);
  });
});

describe('élèves', () => {
  it('attribue des matricules qui se suivent', async () => {
    const { agent, school } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const a = await createStudent(agent, cls.id);
    const b = await createStudent(agent, cls.id, { firstName: 'Koffi' });
    const prefix = school.yearLabel.slice(2, 4);
    expect(a.student.matricule).toBe(`${prefix}-0001`);
    expect(b.student.matricule).toBe(`${prefix}-0002`);
    expect(a.student.lastName).toBe('HOUNGBO');
  });

  it('applique la réduction aux dernières tranches', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const detail = await createStudent(agent, cls.id, { discount: 25_000 });
    expect(detail.summary.totalNet).toBe(35_000);
    expect(detail.summary.schedule.map((l) => l.remaining)).toEqual([10_000, 25_000, 0]);
  });

  it('importe une liste copiée d’Excel, tout ou rien', async () => {
    const { agent } = await directorAgent(t.app);
    await createClass(agent, 'CM2');
    await createClass(agent, '6e');
    const bad = await agent
      .post('/api/students/import')
      .send({
        csv: 'Nom;Prénom;Classe;Parent;Téléphone\nDOSSOU;Rodrigue;CM2;M. Dossou;97000001\nBIO;Mariam;5e;Mme Bio;\nX;;CM2;;\nZINSOU;Brice;6e;;123',
      })
      .expect(400);
    expect(bad.body.error.lines.map((l: { line: number }) => l.line)).toEqual([3, 4, 5]);
    expect((await agent.get('/api/students').expect(200)).body.students).toHaveLength(0);

    const ok = await agent
      .post('/api/students/import')
      .send({
        csv: 'Nom;Prénom;Classe;Parent;Téléphone\r\nDOSSOU;Rodrigue;cm2;M. Dossou;97 00 00 01\r\n"SANNI";"Fatou";6e;;\r\n',
      })
      .expect(201);
    expect(ok.body.imported).toBe(2);
    const list = (await agent.get('/api/students').expect(200)).body.students;
    expect(list.map((s: { lastName: string; parentPhone: string | null }) => [s.lastName, s.parentPhone])).toEqual([
      ['DOSSOU', '0197000001'],
      ['SANNI', null],
    ]);
  });
});

describe('encaissement et reçus', () => {
  it('impute le paiement, émet un reçu numéroté et refuse le trop-perçu', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const { student } = await createStudent(agent, cls.id);
    const first = await agent
      .post(`/api/students/${student.id}/payments`)
      .send({ amount: 15_000, method: 'cash' })
      .expect(201);
    expect(first.body.receiptNumber).toBe(1);
    expect(first.body.summary.schedule.map((l: { status: string }) => l.status)).toEqual(['paid', 'partial', 'due']);
    expect(first.body.summary.state).toBe('on_track');

    const over = await agent.post(`/api/students/${student.id}/payments`).send({ amount: 45_001 }).expect(409);
    expect(over.body.error.code).toBe('overpayment');
    const second = await agent
      .post(`/api/students/${student.id}/payments`)
      .send({ amount: 45_000, method: 'bank', reference: 'VIR-0042' })
      .expect(201);
    expect(second.body.receiptNumber).toBe(2);
    expect(second.body.summary.state).toBe('settled');
    await agent.post(`/api/students/${student.id}/payments`).send({ amount: 100 }).expect(409);
  });

  it('montre le retard quand une échéance est passée', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const detail = await createStudent(agent, cls.id);
    expect(detail.summary).toMatchObject({ overdueAmount: 10_000, state: 'late' });
  });

  it('numérote les reçus sans trou ni doublon, même avec plusieurs caisses en même temps', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const { cashier } = await addCashier(agent, t.app);
    const kids = await Promise.all(
      ['Afi', 'Koffi', 'Mariam', 'Sèna'].map((firstName) => createStudent(agent, cls.id, { firstName })),
    );
    const results = await Promise.all(
      kids.flatMap((k, i) => [
        (i % 2 ? cashier : agent).post(`/api/students/${k.student.id}/payments`).send({ amount: 1_000 }),
        (i % 2 ? agent : cashier).post(`/api/students/${k.student.id}/payments`).send({ amount: 2_000 }),
      ]),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(results.map((r) => r.body.receiptNumber).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('ne laisse pas deux encaissements simultanés dépasser le reste à payer', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const { cashier } = await addCashier(agent, t.app);
    const { student } = await createStudent(agent, cls.id);
    const results = await Promise.all([
      agent.post(`/api/students/${student.id}/payments`).send({ amount: 40_000 }),
      cashier.post(`/api/students/${student.id}/payments`).send({ amount: 40_000 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('produit un reçu avec le montant en lettres et le reste à payer', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const { student } = await createStudent(agent, cls.id);
    const pay = await agent.post(`/api/students/${student.id}/payments`).send({ amount: 25_500 }).expect(201);
    const r = await agent.get(`/api/payments/${pay.body.paymentId}/receipt`).expect(200);
    expect(r.body).toMatchObject({
      receiptNumber: 1,
      amount: 25_500,
      amountInWords: 'vingt-cinq-mille-cinq-cents',
      method: 'cash',
      cashierName: 'Mme Adjovi',
      balanceAfter: 34_500,
      cancelled: null,
      student: { name: 'HOUNGBO Afi', className: 'CM2' },
      school: { name: 'École Les Palmiers' },
    });
  });

  it('annule un reçu avec un motif, le garde dans la caisse et le retire du total', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const { student } = await createStudent(agent, cls.id);
    const pay = await agent.post(`/api/students/${student.id}/payments`).send({ amount: 20_000 }).expect(201);
    await agent.post(`/api/payments/${pay.body.paymentId}/cancel`).send({ reason: '' }).expect(400);
    const cancelled = await agent
      .post(`/api/payments/${pay.body.paymentId}/cancel`)
      .send({ reason: 'Erreur d’élève' })
      .expect(200);
    expect(cancelled.body.cancelled).toMatchObject({ by: 'Mme Adjovi', reason: 'Erreur d’élève' });
    await agent.post(`/api/payments/${pay.body.paymentId}/cancel`).send({ reason: 'Encore' }).expect(409);

    const detail = (await agent.get(`/api/students/${student.id}`).expect(200)).body as StudentDetail;
    expect(detail.summary.totalPaid).toBe(0);
    expect(detail.payments[0]).toMatchObject({ receiptNumber: 1, cancelled: true });
    // Le numéro annulé n'est jamais réattribué.
    const next = await agent.post(`/api/students/${student.id}/payments`).send({ amount: 1_000 }).expect(201);
    expect(next.body.receiptNumber).toBe(2);
  });

  it('établit le journal de caisse du jour par moyen de paiement et par caissier', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const { cashier } = await addCashier(agent, t.app);
    const { student } = await createStudent(agent, cls.id);
    await cashier.post(`/api/students/${student.id}/payments`).send({ amount: 10_000 }).expect(201);
    await cashier
      .post(`/api/students/${student.id}/payments`)
      .send({ amount: 5_000, method: 'momo', reference: 'MP123' })
      .expect(201);
    const mine = await agent.post(`/api/students/${student.id}/payments`).send({ amount: 3_000 }).expect(201);
    await agent.post(`/api/payments/${mine.body.paymentId}/cancel`).send({ reason: 'Doublon' }).expect(200);

    const journal = (await agent.get('/api/cash').expect(200)).body;
    expect(journal).toMatchObject({
      total: 15_000,
      count: 2,
      cancelledCount: 1,
      byMethod: { cash: 10_000, momo: 5_000, bank: 0 },
    });
    expect(journal.byCashier).toEqual([{ name: 'Rachidi', count: 2, cash: 10_000, total: 15_000 }]);
    expect(journal.payments).toHaveLength(3);
    const yesterday = (await agent.get(`/api/cash?date=${day(-1)}`).expect(200)).body;
    expect(yesterday.count).toBe(0);
  });

  it('calcule le tableau de bord et exporte les impayés', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const a = await createStudent(agent, cls.id, { firstName: 'Afi' });
    await createStudent(agent, cls.id, { firstName: 'Koffi', lastName: '=SOMME(A1)' });
    await agent.post(`/api/students/${a.student.id}/payments`).send({ amount: 30_000 }).expect(201);
    const d = (await agent.get('/api/dashboard').expect(200)).body;
    expect(d).toMatchObject({
      studentsCount: 2,
      expected: 120_000,
      collected: 30_000,
      rate: 0.25,
      overdueAmount: 10_000,
      lateCount: 1,
      collectedToday: 30_000,
    });
    expect(d.perClass[0]).toMatchObject({
      name: 'CM2',
      students: 2,
      expected: 120_000,
      collected: 30_000,
      lateCount: 1,
    });

    const csv = await agent.get('/api/export/impayes.csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.replace(/^﻿/, '').split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("'=SOMME(A1)");
    expect(lines[1]).toContain(';10000;60000');
  });
});
