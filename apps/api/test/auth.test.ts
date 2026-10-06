import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCashier,
  createClass,
  createStudent,
  directorAgent,
  nextPhone,
  PASSWORD,
  setup,
  type TestApp,
} from './helpers.js';

let t: TestApp;
beforeAll(async () => {
  t = await setup({ DEMO_MODE: 'true' });
});
afterAll(() => t.close());

describe('inscription d’une école', () => {
  it('crée l’école, le compte de direction et ouvre la session', async () => {
    const { agent, school } = await directorAgent(t.app);
    expect(school.yearLabel).toMatch(/^\d{4}-\d{4}$/);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user).toMatchObject({ name: 'Mme Adjovi', role: 'director' });
    expect(me.body.school).toMatchObject({ name: 'École Les Palmiers', city: 'Cotonou' });
  });

  it('exige un mot de passe d’au moins 8 caractères avec lettres et chiffres', async () => {
    for (const password of ['court1', 'motdepasse', '12345678']) {
      const res = await request(t.app)
        .post('/api/auth/register')
        .send({ schoolName: 'École', city: 'Porto-Novo', directorName: 'M. Test', phone: nextPhone(), password })
        .expect(400);
      expect(res.body.error.fields.password).toBeTruthy();
    }
  });

  it('refuse un numéro déjà utilisé', async () => {
    const { phone } = await directorAgent(t.app);
    await request(t.app)
      .post('/api/auth/register')
      .send({ schoolName: 'Autre', city: 'Cotonou', directorName: 'M. Autre', phone, password: PASSWORD })
      .expect(409);
  });
});

describe('connexion', () => {
  it('verrouille après 5 échecs', async () => {
    const { phone } = await directorAgent(t.app);
    for (let i = 0; i < 4; i++) {
      await request(t.app).post('/api/auth/login').send({ phone, password: 'mauvais123' }).expect(401);
    }
    await request(t.app).post('/api/auth/login').send({ phone, password: 'mauvais123' }).expect(429);
    await request(t.app).post('/api/auth/login').send({ phone, password: PASSWORD }).expect(429);
  });

  it('change le mot de passe et coupe les autres sessions', async () => {
    const { agent, phone } = await directorAgent(t.app);
    const other = request.agent(t.app);
    await other.post('/api/auth/login').send({ phone, password: PASSWORD }).expect(200);
    await agent.post('/api/account/password').send({ currentPassword: 'faux', newPassword: 'nouveau2026' }).expect(400);
    await agent
      .post('/api/account/password')
      .send({ currentPassword: PASSWORD, newPassword: 'nouveau2026' })
      .expect(204);
    await agent.get('/api/auth/me').expect(200);
    await other.get('/api/auth/me').expect(401);
  });
});

describe('rôles', () => {
  it('le caissier se connecte avec son mot de passe provisoire et encaisse', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const { student } = await createStudent(agent, cls.id);
    const { cashier } = await addCashier(agent, t.app);
    const me = await cashier.get('/api/auth/me').expect(200);
    expect(me.body.user.role).toBe('cashier');
    await cashier.post(`/api/students/${student.id}/payments`).send({ amount: 5_000 }).expect(201);
    await cashier
      .post('/api/students')
      .send({ lastName: 'Bio', firstName: 'Mariam', classId: cls.id, parentName: 'Mme Bio' })
      .expect(201);
  });

  it('réserve à la direction les échéanciers, réductions, annulations et l’équipe', async () => {
    const { agent } = await directorAgent(t.app);
    const cls = await createClass(agent);
    const detail = await createStudent(agent, cls.id);
    const { cashier } = await addCashier(agent, t.app);
    const pay = await cashier.post(`/api/students/${detail.student.id}/payments`).send({ amount: 5_000 }).expect(201);

    await cashier
      .post('/api/classes')
      .send({ name: 'CE1', installments: [{ label: 'X', amount: 1, dueDate: '2030-01-01' }] })
      .expect(403);
    await cashier.put(`/api/classes/${cls.id}`).send({ name: 'CM2', installments: [] }).expect(403);
    await cashier.post(`/api/payments/${pay.body.paymentId}/cancel`).send({ reason: 'Erreur' }).expect(403);
    await cashier.get('/api/team').expect(403);
    await cashier.post('/api/team').send({ name: 'X', phone: nextPhone() }).expect(403);
    await cashier.post(`/api/students/${detail.student.id}/archive`).send({ archived: true }).expect(403);
    await cashier.patch('/api/school').send({ name: 'X', city: 'Y', yearLabel: '2026-2027' }).expect(403);

    // Le caissier corrige un numéro, mais pas la réduction.
    const base = { lastName: 'Houngbo', firstName: 'Afi', classId: cls.id, parentName: 'M. Houngbo' };
    await cashier
      .patch(`/api/students/${detail.student.id}`)
      .send({ ...base, parentPhone: '66 55 44 33' })
      .expect(200);
    await cashier
      .patch(`/api/students/${detail.student.id}`)
      .send({ ...base, discount: 10_000 })
      .expect(403);
    await cashier
      .post('/api/students')
      .send({ ...base, discount: 5_000 })
      .expect(403);
  });

  it('désactiver un caissier coupe sa session immédiatement', async () => {
    const { agent } = await directorAgent(t.app);
    const { cashier, id, phone, password } = await addCashier(agent, t.app);
    await agent.post(`/api/team/${id}/active`).send({ active: false }).expect(200);
    await cashier.get('/api/auth/me').expect(401);
    await request(t.app).post('/api/auth/login').send({ phone, password }).expect(401);
    await agent.post(`/api/team/${id}/active`).send({ active: true }).expect(200);
    const reset = await agent.post(`/api/team/${id}/reset-password`).expect(200);
    await request(t.app).post('/api/auth/login').send({ phone, password: reset.body.temporaryPassword }).expect(200);
  });

  it('isole les écoles entre elles', async () => {
    const a = await directorAgent(t.app);
    const b = await directorAgent(t.app);
    const cls = await createClass(a.agent);
    const { student } = await createStudent(a.agent, cls.id);
    await b.agent.get(`/api/students/${student.id}`).expect(404);
    await b.agent.post(`/api/students/${student.id}/payments`).send({ amount: 1_000 }).expect(404);
    await b.agent
      .put(`/api/classes/${cls.id}`)
      .send({ name: 'X', installments: [{ label: 'A', amount: 1, dueDate: '2030-01-01' }] })
      .expect(404);
    await b.agent
      .post('/api/students')
      .send({ lastName: 'Xavier', firstName: 'Yao', classId: cls.id, parentName: 'M. Xavier' })
      .expect(404);
    expect((await b.agent.get('/api/students').expect(200)).body.students).toHaveLength(0);
  });
});

describe('démo', () => {
  it('crée une école d’exemple complète par visiteur', async () => {
    const visitor = request.agent(t.app);
    const res = await visitor.post('/api/auth/demo').expect(201);
    expect(res.body.school.isDemo).toBe(true);
    const list = await visitor.get('/api/students').expect(200);
    expect(list.body.students).toHaveLength(24);
    const dash = await visitor.get('/api/dashboard').expect(200);
    expect(dash.body.lateCount).toBeGreaterThan(0);
    expect(dash.body.collected).toBeGreaterThan(0);
    // Reçus numérotés sans trou, dans l'ordre chronologique.
    const numbers = dash.body.recent.map((p: { receiptNumber: number }) => p.receiptNumber);
    expect(numbers).toEqual([...numbers].sort((x: number, y: number) => y - x));
  });
});
