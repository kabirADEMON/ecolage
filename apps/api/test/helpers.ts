import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/client.js';
import { localDay } from '../src/domain/dates.js';
import type { PaymentProvider } from '../src/payments/provider.js';

export async function setup(env: Record<string, string> = {}, provider?: PaymentProvider) {
  const config = loadConfig({ NODE_ENV: 'test', APP_URL: 'http://ecolage.test', JWT_SECRET: 'x'.repeat(40), ...env });
  const database = await openDatabase({});
  const app = createApp(database.db, config, provider);
  return { app, config, ...database };
}

export type TestApp = Awaited<ReturnType<typeof setup>>;

let counter = 20_000_000;
export const nextPhone = () => `01${counter++}`;
export const day = (offset: number) => localDay(new Date(Date.now() + offset * 86_400_000));

export const PASSWORD = 'ecole2026';

export async function directorAgent(app: TestApp['app']) {
  const agent = request.agent(app);
  const phone = nextPhone();
  const res = await agent
    .post('/api/auth/register')
    .send({ schoolName: 'École Les Palmiers', city: 'Cotonou', directorName: 'Mme Adjovi', phone, password: PASSWORD })
    .expect(201);
  return { agent, phone, school: res.body.school as { id: string; yearLabel: string } };
}

// Classe avec inscription échue (hier) et deux tranches à venir : 10 000 + 30 000 + 20 000.
export async function createClass(agent: request.Agent, name = 'CM2') {
  const res = await agent
    .post('/api/classes')
    .send({
      name,
      installments: [
        { label: 'Inscription', amount: 10_000, dueDate: day(-1) },
        { label: 'Tranche 1', amount: 30_000, dueDate: day(30) },
        { label: 'Tranche 2', amount: 20_000, dueDate: day(90) },
      ],
    })
    .expect(201);
  return (res.body.classes as { id: string; name: string }[]).find((c) => c.name === name)!;
}

export async function createStudent(agent: request.Agent, classId: string, extra: Record<string, unknown> = {}) {
  const res = await agent
    .post('/api/students')
    .send({
      lastName: 'Houngbo',
      firstName: 'Afi',
      classId,
      parentName: 'M. Houngbo',
      parentPhone: '97 12 34 56',
      ...extra,
    })
    .expect(201);
  return res.body as StudentDetail;
}

export async function addCashier(agent: request.Agent, app: TestApp['app']) {
  const phone = nextPhone();
  const res = await agent.post('/api/team').send({ name: 'Rachidi', phone }).expect(201);
  const cashier = request.agent(app);
  await cashier.post('/api/auth/login').send({ phone, password: res.body.temporaryPassword }).expect(200);
  return { cashier, phone, id: res.body.user.id as string, password: res.body.temporaryPassword as string };
}

export type StudentDetail = {
  student: { id: string; matricule: string; shareToken: string; classId: string; discount: number; lastName: string };
  summary: {
    totalNet: number;
    totalPaid: number;
    balance: number;
    overdueAmount: number;
    state: string;
    schedule: { label: string; paid: number; remaining: number; status: string }[];
  };
  payments: { id: string; receiptNumber: number; amount: number; cancelled: boolean; cashierName: string | null }[];
};
