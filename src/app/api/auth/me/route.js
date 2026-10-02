import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { handle, json, readJson, assertSameOrigin, HttpError } from '@/server/http';
import { parse, password, optionalEmail } from '@/server/validation';
import {
  requireUser, publicUser, verifyPassword, hashPassword, clearSessionCookie, createSession, setSessionCookie,
} from '@/server/auth';

export const GET = handle(async (req) => json(publicUser(await requireUser(req))));

const Update = z.object({
  email: optionalEmail,
  current_password: z.string().max(128).optional(),
  new_password: password.optional(),
});

// Email can change freely. A new password needs the current one.
export const PATCH = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  const body = parse(Update, await readJson(req));
  const data = {};
  if (body.email !== undefined) data.email = body.email;
  if (body.new_password) {
    if (!(await verifyPassword(body.current_password || '', user.password_hash))) {
      throw new HttpError(403, 'Current password is wrong');
    }
    data.password_hash = await hashPassword(body.new_password);
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data });
  const res = NextResponse.json(publicUser({ ...updated, role: user.role }));
  // A new password signs out every other device. This one gets a fresh session.
  if (data.password_hash) {
    await prisma.session.deleteMany({ where: { user_id: user.id } });
    setSessionCookie(res, await createSession(user.id));
  }
  return res;
});

// Deletes the account. Their availability stays, since admins schedule off it.
export const DELETE = handle(async (req) => {
  assertSameOrigin(req);
  const user = await requireUser(req);
  await prisma.user.delete({ where: { id: user.id } });
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
});
