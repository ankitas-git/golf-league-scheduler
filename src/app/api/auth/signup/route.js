import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { handle, readJson, assertSameOrigin, clientIp, HttpError } from '@/server/http';
import { rateLimit } from '@/server/ratelimit';
import { parse, username, password, optionalEmail } from '@/server/validation';
import { hashPassword, createSession, setSessionCookie, publicUser } from '@/server/auth';
import { rosterName } from '@/server/roster';
import { assertSignupCode } from '@/server/signupCode';

const Body = z.object({
  player_name: z.string().trim().min(1).max(100),
  username,
  password,
  email: optionalEmail,
  signup_code: z.string().max(200).optional(),
});

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  rateLimit(`signup-ip:${clientIp(req)}`, 60, 60 * 60 * 1000);
  const body = parse(Body, await readJson(req));

  // Checked again here, so the lookup step cannot be skipped.
  assertSignupCode(body.signup_code);

  // Use the roster's spelling, not whatever casing was typed.
  const playerName = await rosterName(body.player_name);
  if (!playerName) throw new HttpError(403, 'That name is not on the league roster');

  if (await prisma.user.findUnique({ where: { player_name: playerName } })) {
    throw new HttpError(409, `${playerName} already has an account. Log in, or ask an admin to reset it.`);
  }
  if (await prisma.user.findUnique({ where: { username: body.username } })) {
    throw new HttpError(409, 'That username is taken');
  }

  const user = await prisma.user.create({
    data: {
      username: body.username,
      password_hash: await hashPassword(body.password),
      player_name: playerName,
      email: body.email,
    },
  });

  const res = NextResponse.json({ user: publicUser(user) }, { status: 201 });
  setSessionCookie(res, await createSession(user.id));
  return res;
});
