import { Router } from 'express';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { DB } from '../db/client.js';
import { schools, users } from '../db/schema.js';
import { openSession, requireDirector, session } from '../lib/auth.js';
import { HttpError, notFound } from '../lib/errors.js';
import { hashSecret, temporaryPassword, verifySecret } from '../lib/security.js';
import { nameSchema, optionalPhone, passwordSchema, phoneSchema, uuidParam } from '../lib/validation.js';
import { schoolDto, userDto } from './auth.js';

const SchoolBody = z.object({
  name: nameSchema('Nom de l’école'),
  city: nameSchema('Ville'),
  phone: optionalPhone,
  yearLabel: z
    .string()
    .trim()
    .regex(/^(\d{4})-(\d{4})$/, 'Format attendu : 2026-2027.')
    .refine((v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1, 'Les deux années doivent se suivre.'),
});

const PasswordBody = z.object({ currentPassword: z.string().min(1).max(72), newPassword: passwordSchema });

export function schoolRoutes(db: DB, config: Config) {
  const r = Router();

  r.patch('/school', requireDirector, async (req, res) => {
    const { school } = session(req);
    const body = SchoolBody.parse(req.body);
    const [updated] = await db.update(schools).set(body).where(eq(schools.id, school.id)).returning();
    res.json({ school: schoolDto(updated!) });
  });

  r.post('/account/password', async (req, res) => {
    const { user, school } = session(req);
    if (school.isDemo) throw new HttpError(403, 'demo', 'Le mot de passe ne se change pas en mode démo.');
    const body = PasswordBody.parse(req.body);
    if (!(await verifySecret(body.currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'wrong_password', 'Le mot de passe actuel est incorrect.', {
        currentPassword: 'Mot de passe incorrect',
      });
    }
    const [updated] = await db
      .update(users)
      .set({ passwordHash: await hashSecret(body.newPassword), sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, user.id))
      .returning();
    openSession(res, config, updated!);
    res.status(204).end();
  });

  // --- Équipe (direction uniquement) ---

  r.get('/team', requireDirector, async (req, res) => {
    const { school } = session(req);
    const list = await db.select().from(users).where(eq(users.schoolId, school.id)).orderBy(asc(users.createdAt));
    res.json({ team: list.map(userDto) });
  });

  // Le caissier reçoit un mot de passe provisoire, communiqué de vive voix par la direction.
  r.post('/team', requireDirector, async (req, res) => {
    const { school } = session(req);
    if (school.isDemo) throw new HttpError(403, 'demo', 'L’équipe ne se modifie pas en mode démo.');
    const body = z.object({ name: nameSchema('Nom'), phone: phoneSchema }).parse(req.body);
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, body.phone));
    if (taken) throw new HttpError(409, 'phone_taken', 'Ce numéro est déjà utilisé.', { phone: 'Numéro déjà utilisé' });
    const password = temporaryPassword();
    const [created] = await db
      .insert(users)
      .values({
        schoolId: school.id,
        name: body.name,
        phone: body.phone,
        passwordHash: await hashSecret(password),
        role: 'cashier',
      })
      .returning();
    res.status(201).json({ user: userDto(created!), temporaryPassword: password });
  });

  async function teammate(schoolId: string, id: string) {
    const [found] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, uuidParam.parse(id)), eq(users.schoolId, schoolId)));
    if (!found) throw notFound('Membre');
    if (found.role === 'director')
      throw new HttpError(403, 'forbidden', 'Le compte de la direction ne se modifie pas ici.');
    return found;
  }

  r.post('/team/:id/active', requireDirector, async (req, res) => {
    const { school } = session(req);
    const member = await teammate(school.id, String(req.params.id));
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    // Désactiver coupe immédiatement les sessions ouvertes.
    const [updated] = await db
      .update(users)
      .set({ active, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, member.id))
      .returning();
    res.json({ user: userDto(updated!) });
  });

  r.post('/team/:id/reset-password', requireDirector, async (req, res) => {
    const { school } = session(req);
    if (school.isDemo) throw new HttpError(403, 'demo', 'L’équipe ne se modifie pas en mode démo.');
    const member = await teammate(school.id, String(req.params.id));
    const password = temporaryPassword();
    const [updated] = await db
      .update(users)
      .set({
        passwordHash: await hashSecret(password),
        sessionVersion: sql`${users.sessionVersion} + 1`,
        failedAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, member.id))
      .returning();
    res.json({ user: userDto(updated!), temporaryPassword: password });
  });

  return r;
}
