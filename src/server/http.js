import 'server-only';
import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

// Wraps a route handler so thrown HttpErrors become JSON and anything else becomes a plain 500.
export function handle(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Internal error' }, 500);
    }
  };
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

// SameSite cookies already block most CSRF. This also rejects cross origin writes from older browsers.
export function assertSameOrigin(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  if (!origin) return;
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Bad origin');
  }
  if (originHost !== host) throw new HttpError(403, 'Cross origin request rejected');
}

// Traefik replaces untrusted X-Forwarded-For, so the last hop is the address it saw.
export function clientIp(req) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',').pop().trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
