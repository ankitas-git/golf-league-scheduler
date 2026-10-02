import { prisma } from '@/server/db';
import { handle, json, clientIp, HttpError } from '@/server/http';
import { rateLimit } from '@/server/ratelimit';
import { matchesForLastName } from '@/server/roster';

// Signup looks golfers up by last name. Returning matches only avoids publishing the whole roster.
export const GET = handle(async (req) => {
  rateLimit(`roster-ip:${clientIp(req)}`, 120, 60 * 1000);
  const last = (req.nextUrl.searchParams.get('last') || '').trim();
  if (last.length < 2) throw new HttpError(400, 'Enter your full last name');

  const matches = await matchesForLastName(last);
  const taken = new Set(
    (await prisma.user.findMany({ where: { player_name: { in: matches } }, select: { player_name: true } })).map((u) => u.player_name),
  );
  return json({
    matches: matches.map((name) => ({ name, registered: taken.has(name) })),
    signup_code_required: Boolean(process.env.SIGNUP_CODE),
  });
});
