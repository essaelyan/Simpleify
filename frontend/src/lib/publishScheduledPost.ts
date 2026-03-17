/**
 * publishScheduledPost — shared publish helper
 *
 * Encapsulates the DB update + socialPublisher call for a single claimed post.
 * Called by both:
 *   - GET  /api/social/scheduled/process   (cron)
 *   - POST /api/social/scheduled/publish-now  (manual)
 *
 * The caller is responsible for the atomic claim step
 * (updateMany WHERE postStatus = "scheduled"|"failed" → "processing") before
 * calling this function.  After this function returns the post is either
 * "published" or "failed" in the DB.
 *
 * Retry policy (auto cron only — manual Publish Now is always immediate)
 * ─────────────────────────────────────────────────────────────────────
 * On a retry-eligible failure (API error or exception — NOT "no account"),
 * up to MAX_RETRIES retries are scheduled with exponential backoff:
 *   attempt 1 → +5 min
 *   attempt 2 → +15 min
 *   attempt 3 → +60 min
 *
 * retryCount tracks how many retries have been scheduled (0 = none yet).
 * nextRetryAt is non-null iff a retry is pending; null after exhaustion.
 */

import { publishToSocialPlatform } from "@/services/socialPublisher";
import type { Platform } from "@/types/autoPosting";
import prisma from "@/lib/prisma";

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_RETRIES = 3;
const BACKOFF_MINUTES = [5, 15, 60]; // indexed by current retryCount (0, 1, 2)

function computeNextRetry(retryCount: number): Date {
  const minutes = BACKOFF_MINUTES[retryCount] ?? 60;
  return new Date(Date.now() + minutes * 60 * 1000);
}

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
  hashtags: string;       // JSON-stringified string[]
  mediaUrl: string | null;
  retryCount: number;
}

export interface PublishHelperResult {
  postId: string;
  platform: string;
  status: "published" | "failed";
  platformPostId: string | null;
  error: string | null;
  /** True when the failure was retryable and a retry has been scheduled. */
  retryScheduled: boolean;
  /** ISO timestamp of the next retry, or null if no retry is pending. */
  nextRetryAt: string | null;
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

// ─── Internal: schedule retry or mark exhausted ───────────────────────────────

async function scheduleRetryOrFail(
  postId: string,
  platform: string,
  retryCount: number,
  error: string
): Promise<{ retryScheduled: boolean; nextRetryAt: string | null }> {
  if (retryCount < MAX_RETRIES) {
    const newRetryCount = retryCount + 1;
    const nextRetryAt = computeNextRetry(retryCount); // backoff index = current count
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        postStatus: "failed",
        success: false,
        lastError: error.slice(0, 500),
        retryCount: newRetryCount,
        nextRetryAt,
      },
    });
    console.log(
      `[publish-helper] retry_scheduled postId=${postId} platform=${platform} attempt=${newRetryCount}/${MAX_RETRIES} nextRetryAt=${nextRetryAt.toISOString()}`
    );
    return { retryScheduled: true, nextRetryAt: nextRetryAt.toISOString() };
  } else {
    // retryCount === MAX_RETRIES — all retries have been exhausted
    await prisma.socialPost.update({
      where: { id: postId },
      data: {
        postStatus: "failed",
        success: false,
        lastError: error.slice(0, 500),
        retryCount: MAX_RETRIES, // cap; do not increment past max
        nextRetryAt: null,
      },
    });
    console.log(
      `[publish-helper] retry_exhausted postId=${postId} platform=${platform} attempts=${MAX_RETRIES}`
    );
    return { retryScheduled: false, nextRetryAt: null };
  }
}

// ─── Core helper ──────────────────────────────────────────────────────────────

/**
 * Publish a single scheduled (or retry-eligible) post that has already been
 * claimed (postStatus set to "processing" by the caller).
 *
 * Updates the DB record to "published" or "failed" and returns the result.
 * On retry-eligible failures, schedules the next attempt automatically.
 */
export async function publishScheduledPost(
  post: ScheduledPostRecord,
  account: AccountInfo | null
): Promise<PublishHelperResult> {
  // ── No account — permanent failure, no retry ───────────────────────────────
  if (!account) {
    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        postStatus: "failed",
        success: false,
        flagReason: "No connected account at publish time",
        lastError: "No connected account at publish time",
        nextRetryAt: null,
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
      retryScheduled: false,
      nextRetryAt: null,
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

    if (publishResult.success) {
      await prisma.socialPost.update({
        where: { id: post.id },
        data: {
          postStatus: "published",
          success: true,
          platformPostId: publishResult.platform_post_id ?? null,
          lastError: null,
          nextRetryAt: null,
        },
      });
      console.log(
        `[publish-helper] publish_success postId=${post.id} platform=${post.platform} platformPostId=${publishResult.platform_post_id ?? "none"}`
      );
      if (post.retryCount > 0) {
        console.log(
          `[publish-helper] retry_success postId=${post.id} platform=${post.platform} attempt=${post.retryCount}/${MAX_RETRIES}`
        );
      }
      return {
        postId: post.id,
        platform: post.platform,
        status: "published",
        platformPostId: publishResult.platform_post_id ?? null,
        error: null,
        retryScheduled: false,
        nextRetryAt: null,
      };
    }

    // API returned failure — retry-eligible
    const retryInfo = await scheduleRetryOrFail(
      post.id,
      post.platform,
      post.retryCount,
      "Publish API returned failure"
    );
    console.log(
      `[publish-helper] publish_failure postId=${post.id} platform=${post.platform} reason="api_returned_failure"`
    );
    return {
      postId: post.id,
      platform: post.platform,
      status: "failed",
      platformPostId: null,
      error: "Publish API returned failure",
      ...retryInfo,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish error";
    const retryInfo = await scheduleRetryOrFail(
      post.id,
      post.platform,
      post.retryCount,
      message
    );
    console.error(
      `[publish-helper] publish_failure postId=${post.id} platform=${post.platform} error="${message}"`
    );
    return {
      postId: post.id,
      platform: post.platform,
      status: "failed",
      platformPostId: null,
      error: message,
      ...retryInfo,
    };
  }
}
