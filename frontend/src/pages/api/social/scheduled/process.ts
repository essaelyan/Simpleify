/**
 * GET /api/social/scheduled/process
 *
 * Finds all SocialPost records that are due for publishing:
 *   1. postStatus = "scheduled" and publishAt <= now()
 *   2. postStatus = "failed" and nextRetryAt <= now()  (automatic retries)
 *
 * Each post is atomically claimed, published via the shared helper, and
 * updated to "published" or "failed" (with the next retry scheduled when
 * applicable).
 *
 * Invoked automatically by the Vercel cron defined in vercel.json.
 * Also safe to call manually — only due posts are processed.
 *
 * Double-publish prevention
 * ─────────────────────────
 * Before publishing, each post is atomically claimed by updating
 * postStatus from its current value → "processing" using updateMany with
 * the same WHERE condition.  If count === 0 another worker already claimed
 * the row; we skip it.
 *
 * Auth
 * ────
 * In production Vercel sets CRON_SECRET and sends it as
 * Authorization: Bearer <secret>.  Local dev works without a secret.
 *
 * Response: ApiResponse<ProcessScheduledData>
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import { publishScheduledPost, loadAccountByPlatform, MAX_RETRIES } from "@/lib/publishScheduledPost";
import prisma from "@/lib/prisma";

export interface ProcessedResult {
  postId: string;
  platform: string;
  status: "published" | "failed" | "skipped";
  platformPostId: string | null;
  error: string | null;
  retryScheduled: boolean;
  nextRetryAt: string | null;
}

export interface ProcessScheduledData {
  processed: number;
  skipped: number;
  results: ProcessedResult[];
  checkedAt: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ProcessScheduledData>>
): Promise<void> {
  if (req.method !== "GET") {
    fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
    return;
  }

  // ── CRON_SECRET auth ─────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      fail(res, 401, "UNAUTHORIZED", "Unauthorized");
      return;
    }
  }

  const checkedAt = new Date().toISOString();
  const now = new Date();

  try {
    // ── 1. Find all due posts (new scheduled + retry-eligible failed) ──────
    const duePosts = await prisma.socialPost.findMany({
      where: {
        OR: [
          // Fresh scheduled posts
          {
            postStatus: "scheduled",
            publishAt: { lte: now },
          },
          // Retry-eligible failed posts (nextRetryAt non-null and due)
          {
            postStatus: "failed",
            nextRetryAt: { lte: now },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(
      `[scheduled/process] found_due_posts count=${duePosts.length} checkedAt=${checkedAt}`
    );

    if (duePosts.length === 0) {
      return ok(res, { processed: 0, skipped: 0, results: [], checkedAt });
    }

    // ── 2. Load connected accounts once ──────────────────────────────────
    const accountByPlatform = await loadAccountByPlatform();

    const results: ProcessedResult[] = [];
    let skippedCount = 0;

    for (const post of duePosts) {
      const isRetry = post.postStatus === "failed";

      // ── 3. Atomic claim — prevents double-publish ─────────────────────
      // Claim by matching the current status so only one worker wins.
      const claim = await prisma.socialPost.updateMany({
        where: { id: post.id, postStatus: post.postStatus },
        data: { postStatus: "processing" },
      });

      if (claim.count === 0) {
        console.log(
          `[scheduled/process] skipped_already_processed postId=${post.id} platform=${post.platform}`
        );
        skippedCount++;
        results.push({
          postId: post.id,
          platform: post.platform,
          status: "skipped",
          platformPostId: null,
          error: null,
          retryScheduled: false,
          nextRetryAt: null,
        });
        continue;
      }

      if (isRetry) {
        console.log(
          `[scheduled/process] retry_attempt postId=${post.id} platform=${post.platform} attempt=${post.retryCount}/${MAX_RETRIES}`
        );
      } else {
        console.log(
          `[scheduled/process] processing_post postId=${post.id} platform=${post.platform} publishAt=${post.publishAt?.toISOString()}`
        );
      }

      // ── 4. Publish via shared helper ──────────────────────────────────
      const account = accountByPlatform[post.platform] ?? null;
      const result = await publishScheduledPost(post, account);
      results.push({
        postId: result.postId,
        platform: result.platform,
        status: result.status,
        platformPostId: result.platformPostId,
        error: result.error,
        retryScheduled: result.retryScheduled,
        nextRetryAt: result.nextRetryAt,
      });
    }

    const processedCount = results.filter((r) => r.status !== "skipped").length;
    console.log(
      `[scheduled/process] done checkedAt=${checkedAt} processed=${processedCount} skipped=${skippedCount}`
    );

    return ok(res, {
      processed: processedCount,
      skipped: skippedCount,
      results,
      checkedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduler error";
    console.error("[scheduled/process] fatal:", message);
    fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
