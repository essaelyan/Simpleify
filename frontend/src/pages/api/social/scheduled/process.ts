/**
 * GET /api/social/scheduled/process
 *
 * Finds all SocialPost records with postStatus = "scheduled" and
 * publishAt <= now(), then publishes each one via the social publishing
 * service and updates the record to "published" or "failed".
 *
 * Invoked automatically by the Vercel cron defined in vercel.json.
 * Also safe to call manually — only due posts are processed.
 *
 * Double-publish prevention
 * ─────────────────────────
 * Before publishing, each post is atomically claimed by updating
 * postStatus from "scheduled" → "processing" using updateMany with the
 * same WHERE condition.  If count === 0 another worker already claimed
 * the row; we skip it.  This prevents duplicate publishes even if two
 * cron invocations overlap.
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
import { publishToSocialPlatform } from "@/services/socialPublisher";
import type { Platform } from "@/types/autoPosting";
import prisma from "@/lib/prisma";

export interface ProcessedResult {
  postId: string;
  platform: string;
  status: "published" | "failed" | "skipped";
  platformPostId: string | null;
  error: string | null;
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
  // Vercel sets CRON_SECRET automatically and sends it as the Bearer token.
  // When the secret is absent (local dev) any caller is allowed.
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
    // ── 1. Find all due scheduled posts ──────────────────────────────────
    const duePosts = await prisma.socialPost.findMany({
      where: {
        postStatus: "scheduled",
        publishAt: { lte: now },
      },
      orderBy: { publishAt: "asc" },
    });

    console.log(
      `[scheduled/process] found_due_posts count=${duePosts.length} checkedAt=${checkedAt}`
    );

    if (duePosts.length === 0) {
      return ok(res, { processed: 0, skipped: 0, results: [], checkedAt });
    }

    // ── 2. Load connected accounts once ──────────────────────────────────
    const accounts = await prisma.socialAccount.findMany();
    const accountByPlatform = Object.fromEntries(
      accounts.map((a) => [
        a.platform,
        {
          accessToken: a.accessToken,
          authorUrn:
            a.platform === "linkedin" && a.platformUserId
              ? `urn:li:person:${a.platformUserId}`
              : undefined,
        },
      ])
    );

    const results: ProcessedResult[] = [];
    let skippedCount = 0;

    for (const post of duePosts) {
      // ── 3. Atomic claim — prevents double-publish ─────────────────────
      // updateMany returns count = 0 if another worker already changed
      // the status away from "scheduled".
      const claim = await prisma.socialPost.updateMany({
        where: { id: post.id, postStatus: "scheduled" },
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
        });
        continue;
      }

      console.log(
        `[scheduled/process] processing_post postId=${post.id} platform=${post.platform} publishAt=${post.publishAt?.toISOString()}`
      );

      // ── 4. Check for connected account ───────────────────────────────
      const account = accountByPlatform[post.platform] ?? null;

      if (!account) {
        await prisma.socialPost.update({
          where: { id: post.id },
          data: {
            postStatus: "failed",
            success: false,
            flagReason: "No connected account at publish time",
          },
        });
        console.log(
          `[scheduled/process] publish_failure postId=${post.id} platform=${post.platform} reason="no_account"`
        );
        results.push({
          postId: post.id,
          platform: post.platform,
          status: "failed",
          platformPostId: null,
          error: "No connected account at publish time",
        });
        continue;
      }

      // ── 5. Parse hashtags ─────────────────────────────────────────────
      let hashtags: string[] = [];
      try {
        hashtags = JSON.parse(post.hashtags) as string[];
      } catch {
        // Malformed JSON — publish without hashtags
      }

      // ── 6. Publish ────────────────────────────────────────────────────
      try {
        const publishResult = await publishToSocialPlatform({
          platform: post.platform as Platform,
          media_url: post.mediaUrl ?? "",
          caption: post.caption,
          hashtags,
          accessToken: account.accessToken,
          authorUrn: account.authorUrn,
        });

        const finalStatus = publishResult.success ? "published" : "failed";
        await prisma.socialPost.update({
          where: { id: post.id },
          data: {
            postStatus: finalStatus,
            success: publishResult.success,
            platformPostId: publishResult.platform_post_id ?? null,
          },
        });

        if (publishResult.success) {
          console.log(
            `[scheduled/process] publish_success postId=${post.id} platform=${post.platform} platformPostId=${publishResult.platform_post_id ?? "none"}`
          );
        } else {
          console.log(
            `[scheduled/process] publish_failure postId=${post.id} platform=${post.platform} reason="api_returned_failure"`
          );
        }

        results.push({
          postId: post.id,
          platform: post.platform,
          status: finalStatus,
          platformPostId: publishResult.platform_post_id ?? null,
          error: publishResult.success ? null : "Publish API returned failure",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Publish error";
        await prisma.socialPost.update({
          where: { id: post.id },
          data: {
            postStatus: "failed",
            success: false,
            flagReason: message.slice(0, 255),
          },
        });
        console.error(
          `[scheduled/process] publish_failure postId=${post.id} platform=${post.platform} error="${message}"`
        );
        results.push({
          postId: post.id,
          platform: post.platform,
          status: "failed",
          platformPostId: null,
          error: message,
        });
      }
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
