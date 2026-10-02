import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { handle, readJson, assertSameOrigin, clientIp, HttpError } from '@/server/http';
import { rateLimit } from '@/server/ratelimit';
import { parse } from '@/server/validation';
import { verifyPassword, burnPasswordCheck, createSession, setSessionCookie, publicUser } from '@/server/auth';
import { isOnRoster } from '@/server/sheets';

const Body = z.object({
  username: z.string().trim().toLowerCase().min(1).max(32),
  password: z.string().min(1).max(128),
});

const WINDOW = 15 * 60 * 1000;

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  const ip = clientIp(req);
  // Generous per IP since the whole league can arrive from one address behind the load balancer.
  rateLimit(`login-ip:${ip}`, 200, WINDOW);
  const { username, password } = parse(Body, await readJson(req));
  // Per account too, so spreading guesses across IPs still gets slowed down.
  rateLimit(`login-user:${username}`, 10, WINDOW);

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    await burnPasswordCheck(password);
    throw new HttpError(401, 'Wrong username or password');
  }
  if (!(await verifyPassword(password, user.password_hash))) throw new HttpError(401, 'Wrong username or password');
  if (!(await isOnRoster(user.player_name))) throw new HttpError(403, 'You are not on the league roster. Contact a league admin.');

  const res = NextResponse.json({ user: publicUser(user) });
  setSessionCookie(res, await createSession(user.id));
  return res;
});
