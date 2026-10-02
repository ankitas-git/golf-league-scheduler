import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

function createClient() {
  // Sized for one replica and the 50 connection limit on the database.
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10 });
  return new PrismaClient({ adapter });
}

// Reused across hot reloads in dev so we do not leak connections.
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
