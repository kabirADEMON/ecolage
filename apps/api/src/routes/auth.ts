import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { DB } from '../db/client.js';
import { schools, users, type School, type User } from '../db/schema.js';
import { formatBeninPhone } from '../domain/phone.js';
import { closeSession, openSession, requireUser, session } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { hashSecret, verifySecret } from '../lib/security.js';
import { nameSchema, passwordSchema, phoneSchema } from '../lib/validation.js';
import { createDemoSchool, currentYearLabel } from '../services/school.js';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export function userDto(u: User) {
  const demo = u.phone.startsWith('00');
  return {
    id: u.id,
    name: u.name,
    phone: demo ? null : u.phone,
    phoneDisplay: demo ? null : formatBeninPhone(u.phone),
    role: u.role,
    active: u.active,
  };
}

export function schoolDto(s: School) {
  return { id: s.id, name: s.name, city: s.city, phone: s.phone, yearLabel: s.yearLabel, isDemo: s.isDemo };
}

const RegisterBody = z.object({
  schoolName: nameSchema('Nom de l’école'),
  city: nameSchema('Ville'),
  directorName: nameSchema('Votre nom'),
  phone: phoneSchema,
  password: passwordSchema,
});

const LoginBody = z.object({ phone: phoneSchema, password: z.string().min(1, 'Mot de passe requis.').max(72) });

const INVALID = 'Numéro ou mot de passe incorrect.';

export function authRoutes(db: DB, config: Config) {
  const r = Router();

  r.post('/register', async (req, res) => {
    const body = RegisterBody.parse(req.body);
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, body.phone));
    if (taken) {
      throw new HttpError(409, 'phone_taken', 'Ce numéro est déjà utilisé. Connectez-vous.', {
        phone: 'Numéro déjà utilisé',
      });
    }
    const user = await db.transaction(async (tx) => {
      const [school] = await tx
        .insert(schools)
        .values({ name: body.schoolName, city: body.city, phone: body.phone, yearLabel: currentYearLabel() })
        .returning();
      const [director] = await tx
        .insert(users)
        .values({
          schoolId: school!.id,
          name: body.directorName,
          phone: body.phone,
          passwordHash: await hashSecret(body.password),
          role: 'director',
        })
        .returning();
      return { director: director!, school: school! };
    });
    openSession(res, config, user.director);
    res.status(201).json({ user: userDto(user.director), school: schoolDto(user.school) });
  });

  r.post('/login', async (req, res) => {
    const body = LoginBody.parse(req.body);
    const [row] = await db
      .select({ user: users, school: schools })
      .from(users)
      .innerJoin(schools, eq(schools.id, users.schoolId))
      .where(eq(users.phone, body.phone));
    if (!row || !row.user.active) {
      await hashSecret(body.password);
      throw new HttpError(401, 'invalid_credentials', INVALID);
    }
    const user = row.user;
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpError(429, 'locked', `Trop d’essais. Réessayez dans ${minutes} min.`);
    }
    if (!(await verifySecret(body.password, user.passwordHash))) {
      const [updated] = await db
        .update(users)
        .set({ failedAttempts: sql`${users.failedAttempts} + 1` })
        .where(eq(users.id, user.id))
        .returning({ failedAttempts: users.failedAttempts });
      if (updated!.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        await db
          .update(users)
          .set({ failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) })
          .where(eq(users.id, user.id));
        throw new HttpError(429, 'locked', `Trop d’essais. Réessayez dans ${LOCK_MINUTES} min.`);
      }
      const left = MAX_FAILED_ATTEMPTS - updated!.failedAttempts;
      throw new HttpError(
        401,
        'invalid_credentials',
        `${INVALID} ${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.`,
      );
    }
    await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
    openSession(res, config, user);
    res.json({ user: userDto(user), school: schoolDto(row.school) });
  });

  r.post('/demo', async (_req, res) => {
    if (!config.demoMode) throw new HttpError(404, 'not_found', 'La démo n’est pas activée.');
    const director = await createDemoSchool(db);
    const [school] = await db.select().from(schools).where(eq(schools.id, director.schoolId));
    openSession(res, config, director);
    res.status(201).json({ user: userDto(director), school: schoolDto(school!) });
  });

  r.post('/logout', (_req, res) => {
    closeSession(res, config);
    res.status(204).end();
  });

  r.get('/me', requireUser(db, config), (req, res) => {
    const { user, school } = session(req);
    res.json({ user: userDto(user), school: schoolDto(school) });
  });

  return r;
}
