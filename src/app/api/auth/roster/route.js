import { z } from 'zod';
import { prisma } from '@/server/db';
import { handle, json, readJson, assertSameOrigin, clientIp } from '@/server/http';
import { rateLimit } from '@/server/ratelimit';
import { parse } from '@/server/validation';
import { assertSignupCode } from '@/server/signupCode';
import { matchesForLastName } from '@/server/roster';

const Body = z.object({
  last: z.string().trim().min(2, 'Enter your full last name').max(40),
  signup_code: z.string().max(200).optional(),
});

// Signup looks golfers up by last name. The code is checked first, so outsiders cannot probe the roster.
// POST keeps the code out of URLs and access logs.
export const POST = handle(async (req) => {
  assertSameOrigin(req);
  rateLimit(`roster-ip:${clientIp(req)}`, 120, 60 * 1000);
  const { last, signup_code } = parse(Body, await readJson(req));
  assertSignupCode(signup_code);

  const matches = await matchesForLastName(last);
  const taken = new Set(
    (await prisma.user.findMany({ where: { player_name: { in: matches } }, select: { player_name: true } })).map((u) => u.player_name),
  );
  return json({ matches: matches.map((name) => ({ name, registered: taken.has(name) })) });
});
