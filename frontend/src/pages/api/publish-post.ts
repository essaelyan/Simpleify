import type { NextApiRequest, NextApiResponse } from "next";
import type { PublishPostRequest, PublishPostResponse } from "@/types/autoPosting";

// Set to false and add real OAuth credentials when ready to go live
const MOCK_MODE = true;

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

  if (MOCK_MODE) {
    const mockResponse: PublishPostResponse = {
      draftId: draft.draftId,
      success: true,
      publishedAt: new Date().toISOString(),
      mockPlatformPostId: `mock_${draft.platform}_${Date.now()}`,
      errorMessage: null,
    };
    return res.status(200).json(mockResponse);
  }

  // ─── Real OAuth path ─────────────────────────────────────────────────────────
  // Each case below is a stub — swap in the real platform SDK when OAuth is wired.
  // Access tokens should come from a server-side session or encrypted cookie store.
  try {
    switch (draft.platform) {
      case "instagram":
        // const igClient = new IgApiClient();
        // await igClient.publish({ caption: draft.caption, mediaUrl: draft.mediaUrl, accessToken })
        break;

      case "facebook":
        // await facebookClient.postToPage({ message: draft.caption, accessToken })
        break;

      case "linkedin":
        // await linkedinClient.createPost({ text: draft.caption, accessToken })
        break;

      case "twitter":
        // const twitterClient = new TwitterApi(accessToken);
        // await twitterClient.v2.tweet(draft.caption)
        break;

      case "tiktok":
        // await tiktokClient.postVideo({ caption: draft.caption, videoUrl: draft.mediaUrl, accessToken })
        break;

      default:
        return res.status(400).json({ error: "Unsupported platform" });
    }

    const response: PublishPostResponse = {
      draftId: draft.draftId,
      success: true,
      publishedAt: new Date().toISOString(),
      mockPlatformPostId: null,
      errorMessage: null,
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
    return res.status(200).json(response);
  }
}
