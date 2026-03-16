/**
 * Shared API response envelope used across all routes.
 *
 * Every API route in this app returns one of these shapes:
 *
 *   Success:  { success: true,  data: T,              meta?: ApiMeta }
 *   Failure:  { success: false, error: ApiError,       meta?: ApiMeta }
 *
 * Client wrappers in src/api/ unwrap `data` and throw on `error` so
 * component code never needs to inspect the envelope directly.
 */

export interface ApiError {
  /** Machine-readable error code (e.g. "BAD_REQUEST", "INTERNAL_ERROR"). */
  code: string;
  /** Human-readable description safe to display in the UI. */
  message: string;
  /** Optional structured detail (raw parse error, field list, etc.). */
  details?: unknown;
}

export interface ApiMeta {
  /**
   * Correlation ID for request tracing. Not yet generated server-side;
   * reserved for future use when a request-id middleware is added.
   */
  requestId?: string;
  /**
   * True when the response data was produced by a mock/stub rather than a
   * real external API call (GA4, Instagram, social platforms, etc.).
   */
  isMock?: boolean;
  /** Agent name that produced this response (e.g. "caption-variants"). */
  agent?: string;
  /** Platform the response is scoped to (e.g. "instagram"). */
  platform?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

// ─── Common error codes ────────────────────────────────────────────────────────

export const API_ERRORS = {
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  BAD_REQUEST: "BAD_REQUEST",
  PARSE_ERROR: "PARSE_ERROR",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ApiErrorCode = (typeof API_ERRORS)[keyof typeof API_ERRORS];
