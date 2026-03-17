/**
 * POST /api/social/scheduled/publish-now
 *
 * Immediately publishes a single scheduled post on behalf of the user.
 * Reuses the same atomic claim + publish logic as the cron scheduler so
 * concurrent cron + manual clicks never produce a duplicate publish.
 *
 * Request body: { postId: string }
 *
 * Response: ApiResponse<PublishNowData>
 *
 * Error codes:
 *   400 BAD_REQUEST          — postId missing or not a string
 *   404 NOT_FOUND            — no post with that id
 *   409 ALREADY_HANDLED      — post is not in "scheduled" state
 *   409 ALREADY_PROCESSING   — atomic claim failed (another worker got it first)
 *   500 INTERNAL_ERROR       — unexpected server error
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import { publishScheduledPost, loadAccountByPlatform } from "@/lib/publishScheduledPost";
import prisma from "@/lib/prisma";

export interface PublishNowData {
  postId: string;
  platform: string;
  status: "published" | "failed";
  platformPostId: string | null;
  error: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<PublishNowData>>
): Promise<void> {
  if (req.method !== "POST") {
    fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
    return;
  }

  const { postId } = req.body as { postId?: unknown };

  if (!postId || typeof postId !== "string") {
    fail(res, 400, API_ERRORS.BAD_REQUEST, "postId is required");
    return;
  }

  console.log(`[publish-now] publish_now_requested postId=${postId}`);

  try {
    // ── Load and validate post ────────────────────────────────────────────
    const post = await prisma.socialPost.findUnique({ where: { id: postId } });

    if (!post) {
      fail(res, 404, API_ERRORS.NOT_FOUND, "Post not found");
      return;
    }

    if (post.postStatus !== "scheduled") {
      console.log(
        `[publish-now] claim_failed postId=${postId} reason="not_scheduled" current=${post.postStatus}`
      );
      fail(
        res,
        409,
        "ALREADY_HANDLED",
        `Post cannot be published now (current status: ${post.postStatus})`
      );
      return;
    }

    // ── Atomic claim (same guard as the cron) ─────────────────────────────
    // updateMany WHERE postStatus = "scheduled" ensures only one caller wins.
    const claim = await prisma.socialPost.updateMany({
      where: { id: postId, postStatus: "scheduled" },
      data: { postStatus: "processing" },
    });

    if (claim.count === 0) {
      console.log(
        `[publish-now] claim_failed postId=${postId} reason="already_processing_or_handled"`
      );
      fail(res, 409, "ALREADY_PROCESSING", "Post is already being processed");
      return;
    }

    console.log(
      `[publish-now] claim_success postId=${postId} platform=${post.platform}`
    );

    // ── Publish via shared helper ─────────────────────────────────────────
    const accountByPlatform = await loadAccountByPlatform();
    const account = accountByPlatform[post.platform] ?? null;
    const result = await publishScheduledPost(post, account);

    return ok(res, {
      postId: result.postId,
      platform: result.platform,
      status: result.status,
      platformPostId: result.platformPostId,
      error: result.error,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish error";
    console.error(`[publish-now] fatal postId=${postId} error="${message}"`);
    fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
