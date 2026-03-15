/**
 * prisma.ts — Singleton Prisma client for Next.js.
 *
 * Re-uses the same instance across hot-reloads in development to avoid
 * exhausting the connection pool on every file change.
 */

import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  return new PrismaClient();
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
