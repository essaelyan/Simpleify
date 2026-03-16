/**
 * prisma.ts — Singleton Prisma client for Next.js.
 *
 * Re-uses the same instance across hot-reloads in development to avoid
 * exhausting the connection pool on every file change.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { requireEnv } from "@/lib/env";

function createPrismaClient() {
  const connectionString = requireEnv("DATABASE_URL");

  // PostgreSQL: use the pg driver adapter
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: ReturnType<typeof createPrismaClient> | undefined;
}

const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export default prisma;
