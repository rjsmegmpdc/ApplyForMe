import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// DATABASE_URL (optional) overrides the SQLite file configured in
// prisma/schema.prisma. The Playwright e2e suite uses this to run against an
// isolated throwaway database instead of prisma/applyforme.db.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : undefined
  );

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
