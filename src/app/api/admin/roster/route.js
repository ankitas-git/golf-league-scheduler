import { z } from 'zod';
import { prisma } from '@/server/db';
import { handle, json, readJson, assertSameOrigin } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { parse } from '@/server/validation';
import { listRoster, addPlayer, nameKey, fullName } from '@/server/roster';

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const accounts = new Set((await prisma.user.findMany({ select: { player_name: true } })).map((u) => nameKey(u.player_name)));
  const roster = (await listRoster()).map((p) => ({ ...p, name: fullName(p), has_account: accounts.has(p.name_key) }));
  return json(roster);
});

const namePart = z.string().trim().min(1).max(40).regex(/^[\p{L}\p{M}' .\-_]+$/u, 'Names can only use letters, spaces, apostrophes, dots, and dashes');

// Manual add, for a golfer who joins before the sheet is updated.
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await requireAdmin(req);
  const body = parse(z.object({ first_name: namePart, last_name: namePart }), await readJson(req));
  return json(await addPlayer(body), 201);
});
