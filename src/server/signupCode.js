import 'server-only';
import { timingSafeEqual, createHash } from 'node:crypto';
import { HttpError } from './http';

export const signupCodeRequired = () => Boolean(process.env.SIGNUP_CODE);

// Hashing first makes the comparison constant time whatever the input length.
export function assertSignupCode(given) {
  const expected = process.env.SIGNUP_CODE;
  if (!expected) return;
  const h = (s) => createHash('sha256').update(s).digest();
  if (!timingSafeEqual(h(given || ''), h(expected))) throw new HttpError(403, 'That league signup code is not right');
}
