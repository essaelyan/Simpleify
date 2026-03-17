/**
 * POST /api/feedback/process-run
 *
 * Runs the feedback pipeline stages (Steps 5–7) that were removed from
 * /api/pipeline/run to keep it within Vercel's 60-second timeout budget.
 *
 * Called by the Auto Posting UI immediately after /api/pipeline/run completes,
 * as a fire-and-forget request that updates the optimization hints store once
 * the response arrives.
 *
 * Input:  { dateRangeDays?: number }   (defaults to 30)
 * Output: ProcessRunData envelope
 *
 * Failure contract:
 *   Returns 500 on any failure. The caller (UI) treats this as non-critical —
 *   existing hints in the store are preserved and the user is not blocked.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse } from "@/types/api";
import type { ContentOptimizationHints } from "@/types/feedbackLoop";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import { runFeedbackPipeline } from "@/services/feedbackPipelineService";
import type { FeedbackDataSources } from "@/services/feedbackPipelineService";

// ─── Anthropic client ─────────────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  // 55 s per-call limit — route has a 60 s Vercel maxDuration so we leave 5 s headroom
  timeout: 55_000,
  maxRetries: 4,
});

// ─── Response type ────────────────────────────────────────────────────────────

export interface ProcessRunData {
  processed: boolean;
  hints: ContentOptimizationHints;
  dataSources: FeedbackDataSources;
  /** Total wall-clock time for all three stages combined. */
  durationMs: number;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ProcessRunData>>
): Promise<void> {
  if (req.method !== "POST") {
    fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
    return;
  }

  if (!process.env.CLAUDE_API_KEY) {
    fail(
      res, 500, "CONFIG_ERROR",
      "CLAUDE_API_KEY is not set. Configure it in .env.local or the deployment environment."
    );
    return;
  }

  const { dateRangeDays = 30 } = req.body as { dateRangeDays?: number };
  const t0 = Date.now();

  try {
    console.log(`[feedback/process-run] starting dateRangeDays=${dateRangeDays}`);
    const result = await runFeedbackPipeline(anthropic, dateRangeDays);
    const durationMs = Date.now() - t0;
    console.log(`[feedback/process-run] complete durationMs=${durationMs}`);

    ok(res, {
      processed: true,
      hints: result.hints,
      dataSources: result.dataSources,
      durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Feedback processing failed";
    const durationMs = Date.now() - t0;
    console.error(`[feedback/process-run] FAILED durationMs=${durationMs}: ${message}`);
    fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
