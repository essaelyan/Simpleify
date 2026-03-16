/**
 * GET /api/feedback/latest
 *
 * Returns the most recent ContentOptimizationHints snapshot saved by the pipeline.
 * The frontend calls this before content generation and passes the hints into
 * ContentBrief.optimizationHints so future captions are automatically improved
 * by real performance data (hooks, formats, posting times).
 *
 * Returns data: { hints: null } when no snapshot exists yet.
 *
 * Response: ApiResponse<FeedbackLatestData>
 *   meta: { isMock } — true when the snapshot was built from mock GA/IG data
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { ContentOptimizationHints } from "@/types/feedbackLoop";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import prisma from "@/lib/prisma";

export interface FeedbackLatestData {
  hints: ContentOptimizationHints | null;
  generatedAt: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<FeedbackLatestData>>
) {
  if (req.method !== "GET") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  try {
    const snapshot = await prisma.feedbackSnapshot.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!snapshot) {
      return ok(res, { hints: null, generatedAt: null });
    }

    const hints: ContentOptimizationHints = JSON.parse(snapshot.hints);
    const isMock = snapshot.gaIsMock && snapshot.igIsMock;

    return ok(
      res,
      { hints, generatedAt: snapshot.createdAt.toISOString() },
      { isMock }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch feedback";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
