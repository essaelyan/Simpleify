/**
 * GET /api/feedback/latest
 *
 * Returns the most recent ContentOptimizationHints snapshot saved by the pipeline.
 * The frontend calls this before content generation and passes the hints into
 * ContentBrief.optimizationHints so future captions are automatically improved
 * by real performance data (hooks, formats, posting times).
 *
 * Returns { success: true } with no hints field when no snapshot exists yet.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { ContentOptimizationHints } from "@/types/feedbackLoop";
import prisma from "@/lib/prisma";

interface LatestFeedbackResponse {
  success: boolean;
  hints?: ContentOptimizationHints;
  isMock?: boolean; // true when the snapshot was built from mock GA/IG data
  generatedAt?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LatestFeedbackResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const snapshot = await prisma.feedbackSnapshot.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!snapshot) {
      return res.status(200).json({ success: true });
    }

    const hints: ContentOptimizationHints = JSON.parse(snapshot.hints);

    return res.status(200).json({
      success: true,
      hints,
      isMock: snapshot.gaIsMock && snapshot.igIsMock,
      generatedAt: snapshot.createdAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch feedback";
    return res.status(500).json({ success: false, error: message });
  }
}
