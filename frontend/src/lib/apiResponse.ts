/**
 * Server-side helpers for building standardised API responses.
 *
 * Usage in route handlers:
 *
 *   import { ok, fail } from "@/lib/apiResponse";
 *   import { API_ERRORS } from "@/types/api";
 *
 *   // success
 *   return ok(res, { briefId, platforms });
 *   return ok(res, { hints }, { isMock: true, agent: "feedback-optimizer" });
 *
 *   // failure
 *   return fail(res, 400, API_ERRORS.BAD_REQUEST, "topic is required");
 *   return fail(res, 500, API_ERRORS.INTERNAL_ERROR, err.message);
 *   return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Only POST is accepted");
 */

import type { NextApiResponse } from "next";
import type { ApiError, ApiMeta, ApiResponse } from "@/types/api";

/**
 * Sends a 2xx success response wrapped in the standard envelope.
 *
 * @param res    Next.js response object
 * @param data   The payload to place in `data`
 * @param meta   Optional metadata (isMock, agent, platform, etc.)
 * @param status HTTP status code (defaults to 200)
 */
export function ok<T>(
  res: NextApiResponse<ApiResponse<T>>,
  data: T,
  meta?: ApiMeta,
  status = 200
): void {
  const body: ApiResponse<T> = { success: true, data };
  if (meta) body.meta = meta;
  res.status(status).json(body);
}

/**
 * Sends an error response wrapped in the standard envelope.
 *
 * @param res     Next.js response object
 * @param status  HTTP status code (400, 405, 422, 500, …)
 * @param code    Machine-readable error code from API_ERRORS
 * @param message Human-readable message safe to surface in the UI
 * @param details Optional structured detail for debugging
 */
export function fail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: NextApiResponse<ApiResponse<any>>,
  status: number,
  code: string,
  message: string,
  details?: unknown
): void {
  const error: ApiError = { code, message };
  if (details !== undefined) error.details = details;
  res.status(status).json({ success: false, error });
}
