/**
 * POST /api/social/publish
 *
 * Canonical single-platform publish endpoint.
 *
 * This is the only publish route. /api/publish-post has been deprecated
 * and returns 410. All client code should call this route.
 *
 * Flow:
 *   1. Validate input
 *   2. Look up stored OAuth token for the platform from the database
 *   3. Call publishToSocialPlatform() (pure publish — no safety check here)
 *   4. Save result to social_posts
 *   5. Return result
 *
 * Architecture note:
 *   Safety checking is the responsibility of the caller, not this route.
 *
 * SocialPost persistence ownership:
 *   This route owns its own SocialPost writes for standalone publish flows
 *   (Repurpose, manual posts from other pages).
 *   The Auto Posting pipeline (POST /api/pipeline/run) writes its own records
 *   directly via processPlatform() — it never calls this route — so there are
 *   no duplicate DB writes between the two paths.
 *
 * Response: ApiResponse<SocialPublishData>
 *   meta: { platform, isMock }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { Platform } from "@/types/autoPosting";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import { PLATFORMS } from "@/types/autoPosting";
import { publishToSocialPlatform } from "@/services/socialPublisher";
import prisma from "@/lib/prisma";

export interface SocialPublishRequest {
  platform: Platform;
  media_url: string;
  caption: string;
  hashtags: string[];
}

export interface SocialPublishData {
  /** Platform-native post ID (real or mock). */
  platform_post_id: string | null;
  /** DB record id of the persisted SocialPost. */
  postId: string;
  /** True when content was blocked before publish (legacy compat field). */
  safetyBlocked?: boolean;
  /** Reason content was blocked, if applicable. */
  flagReason?: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<SocialPublishData>>
) {
  if (req.method !== "POST") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const { platform, media_url, caption, hashtags } =
    req.body as SocialPublishRequest;

  if (!platform || !PLATFORMS.includes(platform)) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, `platform must be one of: ${PLATFORMS.join(", ")}`);
  }
  if (!caption?.trim()) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "caption is required");
  }
  if (!media_url?.trim()) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "media_url is required");
  }

  try {
    // ── Look up stored OAuth token for this platform ───────────────────────────
    const account = await prisma.socialAccount.findUnique({
      where: { platform },
    });

    console.log(
      `[publish] platform=${platform}  account=${account ? account.accountHandle ?? "connected" : "none"}`
    );

    // ── Publish (safety already verified by the caller) ───────────────────────
    const result = await publishToSocialPlatform({
      platform,
      media_url,
      caption,
      hashtags: hashtags ?? [],
      accessToken: account?.accessToken,
    });

    // ── Save to database ───────────────────────────────────────────────────────
    const postStatus = result.success ? "published" : "failed";

    const record = await prisma.socialPost.create({
      data: {
        platform,
        mediaUrl: media_url,
        caption,
        hashtags: JSON.stringify(hashtags ?? []),
        postStatus,
        success: result.success,
        platformPostId: result.platform_post_id ?? null,
        safetyBlocked: false,
        flagReason: null,
      },
    });

    if (!result.success) {
      return fail(res, 422, "PUBLISH_FAILED", "Publish failed — check platform credentials", { postId: record.id });
    }

    return ok(
      res,
      {
        platform_post_id: result.platform_post_id ?? null,
        postId: record.id,
      },
      { platform, isMock: result.isMock ?? false }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    console.error("[publish] error:", message);
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
