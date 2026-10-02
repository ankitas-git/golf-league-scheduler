import 'server-only';
import { PrismaClient } from '@prisma/client';

// Reused across hot reloads in dev so we do not leak connections.
const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
