import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Ressource') => new HttpError(404, 'not_found', `${what} introuvable.`);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    res.status(400).json({ error: { code: 'validation', message: 'Certains champs sont invalides.', fields } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields } });
    return;
  }
  // Corps JSON illisible (express.json).
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'bad_json', message: 'Requête invalide.' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'Une erreur inattendue est survenue.' } });
};
