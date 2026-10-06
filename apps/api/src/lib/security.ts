import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pwd: string, salt: Buffer, keylen: number) => Promise<Buffer>;

// Hachage lent avec sel aléatoire. Le verrouillage après plusieurs échecs est dans routes/auth.
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(secret, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const actual = await scryptAsync(secret, Buffer.from(saltB64, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Mot de passe provisoire lisible pour un nouveau caissier : 4 lettres + 4 chiffres.
export function temporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 4; i++) out += letters[bytes[i]! % letters.length];
  for (let i = 4; i < 8; i++) out += String(bytes[i]! % 10);
  return out;
}

// 128 bits aléatoires : impossible à deviner, assez court pour un message WhatsApp.
export function newShareToken(): string {
  return randomBytes(16).toString('base64url');
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
}
