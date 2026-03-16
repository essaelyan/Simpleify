/**
 * GET /api/social/posts
 *
 * Returns the 50 most-recent SocialPost records so the Auto Posting history
 * panel can be hydrated on page mount — surviving a browser refresh.
 *
 * This route is read-only. It never writes to social_posts.
 * Writing is owned by:
 *   - pipeline/run.ts  → Auto Posting pipeline runs
 *   - social/publish.ts → Repurpose / manual-post flows
 *
 * Response: ApiResponse<{ posts: HistoryPost[] }>
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import prisma from "@/lib/prisma";

/** DB postStatus → UI PostStatus value. */
function mapDbStatus(dbStatus: string): string {
  // The pipeline stores "safety_blocked"; the UI calls it "blocked"
  if (dbStatus === "safety_blocked") return "blocked";
  // published, failed, qa_rejected, no_account are identical in both namespaces
  return dbStatus;
}

export interface HistoryPost {
  id: string;
  platform: string;
  caption: string;
  hashtags: string[];
  /** UI-ready status (safety_blocked is normalised to "blocked"). */
  status: string;
  /** ISO timestamp — populated when status = "published", null otherwise. */
  publishedAt: string | null;
  /** Human-readable safety or QA block reason (status = "blocked"). */
  flagReason: string | null;
  /** Human-readable error description (status = "failed"). */
  errorMessage: string | null;
}

interface PostsData {
  posts: HistoryPost[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<PostsData>>
): Promise<void> {
  if (req.method !== "GET") {
    fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
    return;
  }

  try {
    const records = await prisma.socialPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        platform: true,
        caption: true,
        hashtags: true,
        postStatus: true,
        flagReason: true,
        success: true,
        createdAt: true,
      },
    });

    const posts: HistoryPost[] = records.map((r) => {
      const uiStatus = mapDbStatus(r.postStatus);

      let hashtags: string[] = [];
      try {
        hashtags = JSON.parse(r.hashtags) as string[];
      } catch {
        // Malformed JSON — treat as empty
      }

      return {
        id: r.id,
        platform: r.platform,
        caption: r.caption,
        hashtags,
        status: uiStatus,
        publishedAt: uiStatus === "published" ? r.createdAt.toISOString() : null,
        flagReason: uiStatus === "blocked" ? (r.flagReason ?? null) : null,
        errorMessage: uiStatus === "failed" ? (r.flagReason ?? "Publish failed") : null,
      };
    });

    ok(res, { posts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load post history";
    console.error("[social/posts] error:", message);
    fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
