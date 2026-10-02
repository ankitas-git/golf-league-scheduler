import { prisma } from '@/server/db';

// Readiness probe. Checks the database so a pod with no connection is taken out of rotation.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
