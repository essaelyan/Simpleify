import type { NextApiRequest, NextApiResponse } from "next";
import type { Platform } from "@/types/autoPosting";
import { PLATFORMS } from "@/types/autoPosting";
import { publishToSocialPlatform } from "@/services/socialPublisher";
import prisma from "@/lib/prisma";

export interface SocialPublishRequest {
  platform: Platform;
  media_url: string;
  caption: string;
  hashtags: string[];
}

export interface SocialPublishResponse {
  success: boolean;
  platform_post_id?: string;
  safetyBlocked?: boolean;
  flagReason?: string;
  postId?: string;          // DB record id
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SocialPublishResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { platform, media_url, caption, hashtags } =
    req.body as SocialPublishRequest;

  // ── Validate input ──────────────────────────────────────────────────────────
  if (!platform || !PLATFORMS.includes(platform)) {
    return res.status(400).json({
      success: false,
      error: `platform must be one of: ${PLATFORMS.join(", ")}`,
    });
  }
  if (!caption?.trim()) {
    return res.status(400).json({ success: false, error: "caption is required" });
  }
  if (!media_url?.trim()) {
    return res.status(400).json({ success: false, error: "media_url is required" });
  }

  try {
    // ── Step 1 & 2: AI Safety Filter + Publish ─────────────────────────────────
    const result = await publishToSocialPlatform({
      platform,
      media_url,
      caption,
      hashtags: hashtags ?? [],
    });

    // ── Step 3: Save to database ───────────────────────────────────────────────
    const postStatus = result.safetyBlocked
      ? "safety_blocked"
      : result.success
        ? "published"
        : "failed";

    const record = await prisma.socialPost.create({
      data: {
        platform,
        mediaUrl: media_url,
        caption,
        hashtags: JSON.stringify(hashtags ?? []),
        postStatus,
        success: result.success,
        platformPostId: result.platform_post_id ?? null,
        safetyBlocked: result.safetyBlocked ?? false,
        flagReason: result.flagReason ?? null,
      },
    });

    // ── Step 4: Return result ──────────────────────────────────────────────────
    if (!result.success) {
      return res.status(200).json({
        success: false,
        safetyBlocked: result.safetyBlocked,
        flagReason: result.flagReason,
        postId: record.id,
      });
    }

    return res.status(200).json({
      success: true,
      platform_post_id: result.platform_post_id,
      postId: record.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return res.status(500).json({ success: false, error: message });
  }
}
