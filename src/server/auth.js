import 'server-only';
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { prisma } from './db';
import { HttpError } from './http';
import { isOnRoster } from './roster';

const scrypt = promisify(scryptCb);

// __Host- pins the cookie to this exact host over HTTPS. Plain http on localhost cannot use it.
const secure = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE = secure ? '__Host-golf_session' : 'golf_session';
const SESSION_DAYS = 30;

// N=2^15 is the OWASP floor for scrypt. maxmem has to be raised to fit it.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: MAXMEM });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, saltB64, hashB64] = (stored || '').split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return timingSafeEqual(expected, actual);
}

// Run when the username does not exist, so a miss takes as long as a wrong password.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('not-a-real-password');
  await verifyPassword(password, dummyHash);
}

const tokenId = (token) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { id: tokenId(token), user_id: userId, expires_at: expires } });
  // Opportunistic cleanup keeps the table small without a cron job.
  prisma.session.deleteMany({ where: { expires_at: { lt: new Date() } } }).catch(() => {});
  return { token, expires };
}

const cookieBase = { httpOnly: true, secure, sameSite: 'lax', path: '/' };

export function setSessionCookie(res, { token, expires }) {
  res.cookies.set(SESSION_COOKIE, token, { ...cookieBase, expires });
}

export function clearSessionCookie(res) {
  res.cookies.set(SESSION_COOKIE, '', { ...cookieBase, maxAge: 0 });
}

export async function destroySession(req) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: tokenId(token) } });
}

function sessionUser(req) {
  return userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
}

// For server components, which read cookies from next/headers instead of a request.
export async function currentUser() {
  const { cookies } = await import('next/headers');
  const user = await userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user || !(await isOnRoster(user.player_name))) return null;
  return { ...user, role: roleOf(user) };
}

async function userFromToken(token) {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: tokenId(token) }, include: { user: true } });
  if (!session) return null;
  if (session.expires_at < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

// Admins are named in ADMIN_PLAYERS, so access is managed in k8s and not in the database.
function adminNames() {
  return new Set(
    (process.env.ADMIN_PLAYERS || '').split(',').map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
}

export function roleOf(user) {
  return adminNames().has(user.player_name.toLowerCase()) ? 'admin' : 'player';
}

// Checked on every request, so taking someone off the sheet locks them out within the cache window.
export async function requireUser(req) {
  const user = await sessionUser(req);
  if (!user) throw new HttpError(401, 'Not signed in');
  if (!(await isOnRoster(user.player_name))) throw new HttpError(403, 'You are not on the league roster');
  return { ...user, role: roleOf(user) };
}

export async function requireAdmin(req) {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw new HttpError(403, 'Admins only');
  return user;
}

// The shape the UI sees. full_name keeps the old Base44 field name working.
export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    role: u.role ?? roleOf(u),
    player_name: u.player_name,
    full_name: u.player_name,
    email: u.email,
    created_date: u.created_date,
  };
}

export { playerKey } from '@/lib/players';
