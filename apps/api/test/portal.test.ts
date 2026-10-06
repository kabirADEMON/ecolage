import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FedaPayProvider } from '../src/payments/fedapay.js';
import { createClass, createStudent, directorAgent, setup, type TestApp } from './helpers.js';

async function family(app: TestApp['app']) {
  const { agent } = await directorAgent(app);
  const cls = await createClass(agent);
  const detail = await createStudent(agent, cls.id);
  return { agent, student: detail.student, token: detail.student.shareToken };
}

describe('portail parents', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('montre l’échéancier et les reçus valides, sans compte', async () => {
    const { agent, student, token } = await family(t.app);
    await agent.post(`/api/students/${student.id}/payments`).send({ amount: 10_000 }).expect(201);
    const bad = await agent.post(`/api/students/${student.id}/payments`).send({ amount: 5_000 }).expect(201);
    await agent.post(`/api/payments/${bad.body.paymentId}/cancel`).send({ reason: 'Erreur' }).expect(200);

    const res = await request(t.app).get(`/api/public/students/${token}`).expect(200);
    expect(res.body.student).toMatchObject({ firstName: 'Afi', className: 'CM2' });
    expect(res.body.summary).toMatchObject({ totalPaid: 10_000, balance: 50_000, state: 'on_track' });
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0]).not.toHaveProperty('cashierName');

    const receipt = await request(t.app)
      .get(`/api/public/students/${token}/receipts/${res.body.payments[0].id}`)
      .expect(200);
    expect(receipt.body.amountInWords).toBe('dix-mille');
    // Reçu annulé ou reçu d'un autre élève : introuvable.
    await request(t.app).get(`/api/public/students/${token}/receipts/${bad.body.paymentId}`).expect(404);
    const other = await family(t.app);
    await request(t.app).get(`/api/public/students/${other.token}/receipts/${res.body.payments[0].id}`).expect(404);
  });

  it('coupe l’ancien lien quand il est renouvelé', async () => {
    const { agent, student, token } = await family(t.app);
    const renewed = await agent.post(`/api/students/${student.id}/share-link`).expect(200);
    await request(t.app).get(`/api/public/students/${token}`).expect(404);
    await request(t.app).get(`/api/public/students/${renewed.body.student.shareToken}`).expect(200);
    await request(t.app).get('/api/public/students/trop-court').expect(404);
  });

  it('paiement Mobile Money simulé : un reçu émis une seule fois', async () => {
    const { agent, student, token } = await family(t.app);
    await request(t.app).post(`/api/public/students/${token}/payments`).send({ amount: 60_001 }).expect(400);
    const start = await request(t.app)
      .post(`/api/public/students/${token}/payments`)
      .send({ amount: 10_000 })
      .expect(201);
    expect(start.body.url).toBe(`http://ecolage.test/paiement/simulation/${start.body.paymentId}`);

    const sim = () =>
      request(t.app)
        .post(`/api/public/payments/${start.body.paymentId}/simulate`)
        .send({ outcome: 'approved' })
        .expect(200);
    const first = await sim();
    expect(first.body).toMatchObject({ status: 'approved', balance: 50_000 });
    expect(first.body.receiptId).toBeTruthy();
    await sim();

    const detail = await agent.get(`/api/students/${student.id}`).expect(200);
    expect(detail.body.payments).toHaveLength(1);
    expect(detail.body.payments[0]).toMatchObject({ method: 'momo', online: true, cashierName: null });
    await agent.post(`/api/payments/${detail.body.payments[0].id}/cancel`).send({ reason: 'Test' }).expect(409);
  });
});

describe('FedaPay', () => {
  const SECRET = 'wh_sandbox_ecolage';
  let t: TestApp;
  let lastId = 7000;
  let remote = 'pending';
  const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const json = (d: unknown) =>
      new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (u.endsWith('/transactions') && init?.method === 'POST') return json({ 'v1/transaction': { id: ++lastId } });
    let m = u.match(/\/transactions\/(\d+)\/token$/);
    if (m) return json({ token: 't', url: `https://sandbox-checkout.fedapay.com/${m[1]}` });
    m = u.match(/\/transactions\/(\d+)$/);
    if (m) return json({ 'v1/transaction': { id: Number(m[1]), status: remote } });
    return new Response('', { status: 404 });
  });
  const provider = new FedaPayProvider({
    secretKey: 'sk_sandbox',
    webhookSecret: SECRET,
    env: 'sandbox',
    fetch: fakeFetch as unknown as typeof fetch,
  });
  const sign = (body: string, ts = Math.floor(Date.now() / 1000)) =>
    `t=${ts},s=${createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')}`;

  beforeAll(async () => {
    t = await setup(
      { PAYMENT_PROVIDER: 'fedapay', FEDAPAY_SECRET_KEY: 'sk_sandbox', FEDAPAY_WEBHOOK_SECRET: SECRET },
      provider,
    );
  });
  afterAll(() => t.close());

  it('émet le reçu sur webhook signé, une seule fois, et rejette une fausse signature', async () => {
    const { agent, student, token } = await family(t.app);
    const start = await request(t.app)
      .post(`/api/public/students/${token}/payments`)
      .send({ amount: 10_000 })
      .expect(201);
    expect(start.body.url).toBe(`https://sandbox-checkout.fedapay.com/${lastId}`);
    const body = JSON.stringify({ name: 'transaction.approved', entity: { id: lastId, status: 'approved' } });
    await request(t.app)
      .post('/api/webhooks/fedapay')
      .set('Content-Type', 'application/json')
      .set('X-FEDAPAY-SIGNATURE', 't=1,s=00')
      .send(body)
      .expect(400);
    for (let i = 0; i < 2; i++) {
      await request(t.app)
        .post('/api/webhooks/fedapay')
        .set('Content-Type', 'application/json')
        .set('X-FEDAPAY-SIGNATURE', sign(body))
        .send(body)
        .expect(200);
    }
    const detail = await agent.get(`/api/students/${student.id}`).expect(200);
    expect(detail.body.payments).toHaveLength(1);
    expect(detail.body.summary.totalPaid).toBe(10_000);
  });

  it('interroge FedaPay au retour du parent si le webhook tarde', async () => {
    const { token } = await family(t.app);
    const start = await request(t.app)
      .post(`/api/public/students/${token}/payments`)
      .send({ amount: 5_000 })
      .expect(201);
    remote = 'pending';
    expect((await request(t.app).get(`/api/public/payments/${start.body.paymentId}`)).body.status).toBe('pending');
    remote = 'approved';
    const done = await request(t.app).get(`/api/public/payments/${start.body.paymentId}`).expect(200);
    expect(done.body).toMatchObject({ status: 'approved', balance: 55_000 });
  });
});
