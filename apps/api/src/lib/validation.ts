import { z } from 'zod';
import { normalizeBeninPhone } from '../domain/phone.js';

export const phoneSchema = z
  .string({ error: 'Numéro requis.' })
  .trim()
  .transform((v, ctx) => {
    const phone = normalizeBeninPhone(v);
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Numéro béninois invalide (ex. 01 97 12 34 56).' });
      return z.NEVER;
    }
    return phone;
  });

export const passwordSchema = z
  .string({ error: 'Mot de passe requis.' })
  .min(8, 'Au moins 8 caractères.')
  .max(72, 'Mot de passe trop long.')
  .refine((v) => /\d/.test(v) && /\D/.test(v), { message: 'Mélangez des lettres et des chiffres.' });

export const nameSchema = (label: string) =>
  z
    .string({ error: `${label} requis.` })
    .trim()
    .min(2, `${label} trop court.`)
    .max(80, `${label} trop long.`);

// Montant en F CFA : entier positif, plafonné pour éviter les fautes de frappe absurdes.
export const amountSchema = z.coerce
  .number({ error: 'Montant requis.' })
  .int('Le montant doit être un nombre entier de francs.')
  .positive('Le montant doit être positif.')
  .max(100_000_000, 'Montant trop élevé.');

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Texte trop long (${max} caractères maximum).`)
    .nullish()
    .transform((v) => (v ? v : null));

export const optionalPhone = z
  .union([phoneSchema, z.literal('').transform(() => null), z.null()])
  .optional()
  .transform((v) => v ?? null);

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.');

export const uuidParam = z.string().uuid('Identifiant invalide.');
