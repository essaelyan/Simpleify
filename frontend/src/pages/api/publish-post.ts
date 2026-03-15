/**
 * POST /api/publish-post
 *
 * Publishes a single platform draft.
 * Looks up the stored OAuth token for the platform from the database,
 * runs the AI safety filter, then calls the real platform REST API
 * (or a mock if SOCIAL_PUBLISH_MOCK=true, which is the default).
 *
 * Body: { draft: PublishPostRequest }
 * Response: PublishPostResponse
 */
import type { NextApiRequest, NextApiResponse } from "next";
import type { PublishPostRequest, PublishPostResponse } from "@/types/autoPosting";
import { publishToSocialPlatform } from "@/services/socialPublisher";
import prisma from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { draft } = req.body as { draft: PublishPostRequest };

  if (!draft?.platform || !draft?.caption) {
    return res.status(400).json({ error: "platform and caption are required" });
  }

  try {
    // Look up the stored access token for this platform
    const account = await prisma.socialAccount.findUnique({
      where: { platform: draft.platform },
    });

    const result = await publishToSocialPlatform({
      platform: draft.platform,
      media_url: draft.mediaUrl ?? "",
      caption: draft.caption,
      hashtags: draft.hashtags ?? [],
      accessToken: account?.accessToken,
    });

    if (result.safetyBlocked) {
      const response: PublishPostResponse = {
        draftId: draft.draftId,
        success: false,
        publishedAt: null,
        mockPlatformPostId: null,
        errorMessage: result.flagReason ?? "Content blocked by safety filter",
      };
      return res.status(200).json(response);
    }

    const response: PublishPostResponse = {
      draftId: draft.draftId,
      success: result.success,
      publishedAt: result.success ? new Date().toISOString() : null,
      mockPlatformPostId: result.isMock ? (result.platform_post_id ?? null) : null,
      errorMessage: result.success ? null : "Publish failed",
    };
    return res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    const response: PublishPostResponse = {
      draftId: draft.draftId,
      success: false,
      publishedAt: null,
      mockPlatformPostId: null,
      errorMessage: message,
    };
    return res.status(500).json(response);
  }
}
