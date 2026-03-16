/**
 * GET /api/health
 *
 * Readiness probe for Vercel, uptime monitors, and manual smoke tests.
 *
 * Returns 200 when the server is up and the database is reachable.
 * Returns 503 when the database ping fails (so load balancers / monitors
 * can detect a broken deployment immediately).
 *
 * Response shape:
 *   {
 *     status: "ok" | "error"
 *     db:     "connected" | "error"
 *     timestamp: string   // ISO-8601
 *     version?: string    // process.env.npm_package_version if available
 *     error?: string      // only present when db === "error"
 *   }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

interface HealthResponse {
  status: "ok" | "error";
  db: "connected" | "error";
  timestamp: string;
  version?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse>
) {
  // Accept both GET and HEAD (HEAD is common for uptime checks)
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }

  const timestamp = new Date().toISOString();
  const version = process.env.npm_package_version;

  try {
    // Lightweight DB liveness check — does not read or write any tables
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      status: "ok",
      db: "connected",
      timestamp,
      ...(version ? { version } : {}),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Database check failed";
    console.error("[health] DB ping failed:", error);

    return res.status(503).json({
      status: "error",
      db: "error",
      timestamp,
      ...(version ? { version } : {}),
      error,
    });
  }
}
