import { z } from 'zod';
import { prisma } from '@/server/db';
import { handle, json, readJson, assertSameOrigin, HttpError } from '@/server/http';
import { requireAdmin, hashPassword } from '@/server/auth';
import { parse, password } from '@/server/validation';

async function target(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'Account not found');
  return user;
}

// Sets a temporary password for a golfer who forgot theirs, and signs them out everywhere.
export const PATCH = handle(async (req, { params }) => {
  assertSameOrigin(req);
  await requireAdmin(req);
  const { id } = await params;
  const { new_password } = parse(z.object({ new_password: password }), await readJson(req));
  await target(id);
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { password_hash: await hashPassword(new_password) } }),
    prisma.session.deleteMany({ where: { user_id: id } }),
  ]);
  return json({ success: true });
});

// Frees the roster name, for when someone signed up as the wrong golfer.
export const DELETE = handle(async (req, { params }) => {
  assertSameOrigin(req);
  const admin = await requireAdmin(req);
  const { id } = await params;
  if (id === admin.id) throw new HttpError(400, 'Delete your own account from the account menu');
  await target(id);
  await prisma.user.delete({ where: { id } });
  return json({ success: true });
});
