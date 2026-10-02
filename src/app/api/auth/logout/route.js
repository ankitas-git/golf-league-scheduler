import { NextResponse } from 'next/server';
import { handle, assertSameOrigin } from '@/server/http';
import { destroySession, clearSessionCookie } from '@/server/auth';

export const POST = handle(async (req) => {
  assertSameOrigin(req);
  await destroySession(req);
  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
});
