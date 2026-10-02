import 'server-only';
import { z } from 'zod';
import { HttpError } from './http';

export const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-z0-9._-]+$/, 'Username can only use letters, numbers, dots, dashes, and underscores');

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);

// Accepts an empty string as "clear it", which is what the forms send.
export const optionalEmail = z.union([z.literal(''), email, z.null()]).optional().transform((v) => (v ? v : null));

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message || 'Invalid input');
  return result.data;
}
