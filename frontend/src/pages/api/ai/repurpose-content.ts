/**
 * POST /api/ai/repurpose-content
 *
 * Long-form content repurposing agent.
 *
 * Takes a blog post, YouTube transcript, podcast summary, or any long-form
 * piece and produces platform-native posts for all 5 platforms in one call.
 * Each post is adapted to the platform's format, character limit, tone, and
 * audience expectations — not just truncated.
 *
 * Body:
 *   {
 *     sourceContent: string;        // The full text to repurpose
 *     sourceType: "blog" | "youtube_transcript" | "podcast" | "article" | "other";
 *     sourceTitle?: string;
 *     targetAudience: string;
 *     callToAction: string;
 *     targetPlatforms?: Platform[]; // defaults to all 5
 *   }
 *
 * Response:
 *   {
 *     posts: Array<{
 *       platform: Platform;
 *       caption: string;
 *       hashtags: string[];
 *       contentAngle: string;    // how the long-form was distilled for this platform
 *       keyTakeaway: string;     // the single insight extracted
 *     }>;
 *     extractedHooks: string[];  // top 3 hook-worthy lines from source content
 *     repurposingNotes: string;  // brief strategy notes
 *   }
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Platform } from "@/types/autoPosting";
import { PLATFORMS, PLATFORM_META } from "@/types/autoPosting";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

type SourceType = "blog" | "youtube_transcript" | "podcast" | "article" | "other";

interface RepurposeContentRequest {
  sourceContent: string;
  sourceType: SourceType;
  sourceTitle?: string;
  targetAudience: string;
  callToAction: string;
  targetPlatforms?: Platform[];
}

interface RepurposedPost {
  platform: Platform;
  caption: string;
  hashtags: string[];
  contentAngle: string;
  keyTakeaway: string;
}

interface RepurposeContentResponse {
  posts: RepurposedPost[];
  extractedHooks: string[];
  repurposingNotes: string;
  error?: string;
}

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  blog: "Blog post",
  youtube_transcript: "YouTube video transcript",
  podcast: "Podcast episode",
  article: "Article",
  other: "Content piece",
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RepurposeContentResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      posts: [],
      extractedHooks: [],
      repurposingNotes: "",
      error: "Method not allowed",
    });
  }

  const {
    sourceContent,
    sourceType,
    sourceTitle,
    targetAudience,
    callToAction,
    targetPlatforms,
  } = req.body as RepurposeContentRequest;

  if (!sourceContent?.trim()) {
    return res.status(400).json({
      posts: [],
      extractedHooks: [],
      repurposingNotes: "",
      error: "sourceContent is required",
    });
  }
  if (!targetAudience?.trim() || !callToAction?.trim()) {
    return res.status(400).json({
      posts: [],
      extractedHooks: [],
      repurposingNotes: "",
      error: "targetAudience and callToAction are required",
    });
  }

  const platforms = targetPlatforms?.length ? targetPlatforms : PLATFORMS;

  // Truncate source content to avoid hitting token limits (keep first 6000 chars)
  const truncatedSource =
    sourceContent.length > 6000
      ? sourceContent.slice(0, 6000) + "\n\n[... content truncated for length ...]"
      : sourceContent;

  const platformSpecs = platforms
    .map((p) => {
      const meta = PLATFORM_META[p];
      return `- ${meta.label}: max ${meta.maxChars} chars, max ${meta.hashtagLimit} hashtags`;
    })
    .join("\n");

  const prompt = `You are an expert content repurposing strategist. Your job is to transform long-form content into platform-native social posts that feel original — not copied or truncated.

SOURCE TYPE: ${SOURCE_TYPE_LABELS[sourceType ?? "other"]}
${sourceTitle ? `TITLE: ${sourceTitle}` : ""}
TARGET AUDIENCE: ${targetAudience}
CALL TO ACTION: ${callToAction}

PLATFORM LIMITS:
${platformSpecs}

SOURCE CONTENT:
---
${truncatedSource}
---

YOUR TASK:
1. Extract the 3 most hook-worthy, shareable ideas from the source content.
2. For each platform listed, write a post that:
   - Feels native to that platform's format and audience expectations
   - Highlights a DIFFERENT angle of the source content (don't repeat the same point across platforms)
   - Stays within character and hashtag limits
   - Uses the CTA naturally and softly
   - Captures the essence without requiring the audience to read the original

Platform-specific guidance:
- instagram: Visual hook in the first line. Story-driven. 5–8 hashtags.
- facebook: Conversational and warm. Full sentences. 0–2 hashtags.
- linkedin: Professional insight. Data or framework angle. 1–3 hashtags.
- twitter: One punchy idea or statistic. Max 280 chars including hashtags. 0–2 hashtags.
- tiktok: Energetic and trend-aware. Hook line that stops the scroll. 3–6 hashtags.

Respond ONLY with valid JSON, no markdown fences:
{
  "posts": [
    {
      "platform": "<platform>",
      "caption": "<full caption text>",
      "hashtags": ["tag1", "tag2"],
      "contentAngle": "<one sentence on which angle of the source was used>",
      "keyTakeaway": "<single sentence — the core insight this post communicates>"
    }
  ],
  "extractedHooks": [
    "<most compelling sentence or idea from the source>",
    "<second most shareable idea>",
    "<third hook-worthy moment>"
  ],
  "repurposingNotes": "<2–3 sentence strategy note on how the content was distributed across platforms>"
}

Include one post entry per platform: ${platforms.join(", ")}.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as RepurposeContentResponse;

    if (!Array.isArray(parsed.posts) || parsed.posts.length === 0) {
      throw new Error("No posts returned");
    }

    return res.status(200).json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Repurposing failed";
    return res.status(500).json({
      posts: [],
      extractedHooks: [],
      repurposingNotes: "",
      error: message,
    });
  }
}
