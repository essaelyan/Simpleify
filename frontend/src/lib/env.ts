/**
 * env.ts — Runtime environment validation helpers.
 *
 * Call requireEnv() in server-side code to fail fast with a clear message
 * when a required variable is not set, rather than getting a cryptic runtime
 * error deep inside a library.
 *
 * Usage:
 *   import { requireEnv } from "@/lib/env";
 *   const url = requireEnv("DATABASE_URL");
 */

/**
 * Returns the value of an env var or throws a descriptive error if it is missing.
 * Only call this in server-side code (API routes, services).
 */
export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `[startup] Required environment variable "${name}" is not set.\n` +
        `Set it in .env.local for local development or in the Vercel dashboard for production.\n` +
        `See .env.example for the full list of required variables.`
    );
  }
  return val;
}

/**
 * Returns the value of an env var or a fallback if it is not set.
 * Safe to call for optional variables.
 */
export function getEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/**
 * Validates all required vars at once and returns a map of their values.
 * Throws a single error listing all missing vars so you can fix them in one go.
 *
 * Usage:
 *   const env = requireAllEnv(["DATABASE_URL", "CLAUDE_API_KEY"]);
 */
export function requireAllEnv<T extends string>(
  names: readonly T[]
): Record<T, string> {
  const missing = names.filter((n) => !process.env[n]);

  if (missing.length > 0) {
    throw new Error(
      `[startup] Missing required environment variables:\n` +
        missing.map((n) => `  - ${n}`).join("\n") +
        `\n\nSet them in .env.local (local) or the Vercel dashboard (production).\n` +
        `See .env.example for the full list.`
    );
  }

  return Object.fromEntries(names.map((n) => [n, process.env[n] as string])) as Record<
    T,
    string
  >;
}
