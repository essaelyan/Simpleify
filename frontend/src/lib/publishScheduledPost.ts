/**
 * publishScheduledPost — shared publish helper
 *
 * Encapsulates the DB update + socialPublisher call for a single claimed post.
 * Called by both:
 *   - GET  /api/social/scheduled/process   (cron)
 *   - POST /api/social/scheduled/publish-now  (manual)
 *
 * The caller is responsible for the atomic claim step
 * (updateMany WHERE postStatus = "scheduled" → "processing") before calling
 * this function.  After this function returns the post is either "published"
 * or "failed" in the DB.
 */

import { publishToSocialPlatform } from "@/services/socialPublisher";
import type { Platform } from "@/types/autoPosting";
import prisma from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AccountInfo {
  accessToken: string;
  authorUrn?: string;
}

/** Minimal post fields required by the helper (subset of Prisma SocialPost). */
export interface ScheduledPostRecord {
  id: string;
  platform: string;
  caption: string;
  hashtags: string;   // JSON-stringified string[]
  mediaUrl: string | null;
}

export interface PublishHelperResult {
  postId: string;
  platform: string;
  status: "published" | "failed";
  platformPostId: string | null;
  error: string | null;
}

// ─── Account loader ───────────────────────────────────────────────────────────

/** Load all connected social accounts, keyed by platform. */
export async function loadAccountByPlatform(): Promise<Record<string, AccountInfo>> {
  const accounts = await prisma.socialAccount.findMany();
  return Object.fromEntries(
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
}

// ─── Core helper ──────────────────────────────────────────────────────────────

/**
 * Publish a single scheduled post that has already been claimed
 * (postStatus set to "processing" by the caller).
 *
 * Updates the DB record to "published" or "failed" and returns the result.
 */
export async function publishScheduledPost(
  post: ScheduledPostRecord,
  account: AccountInfo | null
): Promise<PublishHelperResult> {
  // ── No account ─────────────────────────────────────────────────────────────
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
      `[publish-helper] publish_failure postId=${post.id} platform=${post.platform} reason="no_account"`
    );
    return {
      postId: post.id,
      platform: post.platform,
      status: "failed",
      platformPostId: null,
      error: "No connected account at publish time",
    };
  }

  // ── Parse hashtags ─────────────────────────────────────────────────────────
  let hashtags: string[] = [];
  try {
    hashtags = JSON.parse(post.hashtags) as string[];
  } catch {
    // Malformed JSON — publish without hashtags
  }

  // ── Publish ────────────────────────────────────────────────────────────────
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
        `[publish-helper] publish_success postId=${post.id} platform=${post.platform} platformPostId=${publishResult.platform_post_id ?? "none"}`
      );
    } else {
      console.log(
        `[publish-helper] publish_failure postId=${post.id} platform=${post.platform} reason="api_returned_failure"`
      );
    }

    return {
      postId: post.id,
      platform: post.platform,
      status: finalStatus,
      platformPostId: publishResult.platform_post_id ?? null,
      error: publishResult.success ? null : "Publish API returned failure",
    };
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
      `[publish-helper] publish_failure postId=${post.id} platform=${post.platform} error="${message}"`
    );
    return {
      postId: post.id,
      platform: post.platform,
      status: "failed",
      platformPostId: null,
      error: message,
    };
  }
}
