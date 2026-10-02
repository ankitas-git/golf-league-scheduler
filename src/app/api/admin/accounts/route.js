import { prisma } from '@/server/db';
import { handle, json } from '@/server/http';
import { requireAdmin, publicUser } from '@/server/auth';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const users = await prisma.user.findMany({ orderBy: { player_name: 'asc' } });
  return json(users.map(publicUser));
});
