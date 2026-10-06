import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import type { Config } from '../config.js';
import type { DB } from '../db/client.js';
import { schools, users, type School, type User } from '../db/schema.js';
import { HttpError } from './errors.js';

export const SESSION_COOKIE = 'ecolage_session';
const SESSION_DAYS = 14;

type Claims = { sub: string; sv: number };
export type Session = { user: User; school: School };

declare module 'express-serve-static-core' {
  interface Request {
    session?: Session;
  }
}

function cookieOptions(config: Config): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.env === 'production', path: '/' };
}

export function openSession(res: Response, config: Config, user: User) {
  const token = jwt.sign({ sv: user.sessionVersion }, config.jwtSecret, {
    subject: user.id,
    expiresIn: `${SESSION_DAYS}d`,
    algorithm: 'HS256',
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(config), maxAge: SESSION_DAYS * 86_400_000 });
}

export function closeSession(res: Response, config: Config) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(config));
}

export function requireUser(db: DB, config: Config) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string') throw new HttpError(401, 'unauthenticated', 'Connectez-vous pour continuer.');
    let claims: Claims;
    try {
      claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as Claims;
    } catch {
      throw new HttpError(401, 'unauthenticated', 'Votre session a expiré. Reconnectez-vous.');
    }
    const [row] = await db
      .select({ user: users, school: schools })
      .from(users)
      .innerJoin(schools, eq(schools.id, users.schoolId))
      .where(eq(users.id, claims.sub));
    // Mot de passe changé ou compte désactivé : la session ne vaut plus rien.
    if (!row || !row.user.active || row.user.sessionVersion !== claims.sv) {
      throw new HttpError(401, 'unauthenticated', 'Votre session a expiré. Reconnectez-vous.');
    }
    req.session = row;
    next();
  };
}

export function session(req: Request): Session {
  if (!req.session) throw new HttpError(401, 'unauthenticated', 'Connectez-vous pour continuer.');
  return req.session;
}

// Réservé à la direction : échéanciers, réductions, annulation de reçus, équipe.
export function requireDirector(req: Request, _res: Response, next: NextFunction) {
  if (session(req).user.role !== 'director') {
    throw new HttpError(403, 'forbidden', 'Action réservée à la direction de l’école.');
  }
  next();
}
