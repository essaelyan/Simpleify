/**
 * GET /api/social/scheduled/process
 *
 * Finds all SocialPost records with postStatus = "scheduled" and
 * publishAt <= now(), then publishes each one via the social publishing
 * service and updates the record to "published" or "failed".
 *
 * Call this from a cron job, a Vercel cron, or manually to flush the
 * scheduled queue.  Safe to call multiple times — only due posts are processed.
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
  status: "published" | "failed";
  platformPostId: string | null;
  error: string | null;
}

export interface ProcessScheduledData {
  processed: number;
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

  const checkedAt = new Date().toISOString();

  try {
    // Find all due scheduled posts
    const duePosts = await prisma.socialPost.findMany({
      where: {
        postStatus: "scheduled",
        publishAt: { lte: new Date() },
      },
      orderBy: { publishAt: "asc" },
    });

    if (duePosts.length === 0) {
      return ok(res, { processed: 0, results: [], checkedAt });
    }

    // Load all connected social accounts once
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

    for (const post of duePosts) {
      const account = accountByPlatform[post.platform] ?? null;

      if (!account) {
        // No connected account — mark failed so we don't retry indefinitely
        await prisma.socialPost.update({
          where: { id: post.id },
          data: {
            postStatus: "failed",
            success: false,
            flagReason: "No connected account at publish time",
          },
        });
        results.push({
          postId: post.id,
          platform: post.platform,
          status: "failed",
          platformPostId: null,
          error: "No connected account at publish time",
        });
        continue;
      }

      let hashtags: string[] = [];
      try {
        hashtags = JSON.parse(post.hashtags) as string[];
      } catch {
        // Malformed — publish without hashtags
      }

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
        results.push({
          postId: post.id,
          platform: post.platform,
          status: "failed",
          platformPostId: null,
          error: message,
        });
      }
    }

    console.log(
      `[scheduled/process] checkedAt=${checkedAt} processed=${results.length}`,
      results.map((r) => `${r.platform}:${r.status}`).join(" ")
    );

    return ok(res, { processed: results.length, results, checkedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scheduler error";
    console.error("[scheduled/process] fatal:", message);
    fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
