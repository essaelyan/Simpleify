/**
 * POST /api/ai/hashtag-research
 *
 * Hashtag research and strategy agent.
 *
 * Given a niche, topic, and optional audience profile, Claude generates
 * optimal hashtag sets for each platform with strategic reasoning:
 * volume tier (niche / medium / broad), relevance rationale, and
 * a recommended posting mix (niche-heavy for discovery, broad for reach).
 *
 * Body:
 *   {
 *     topic: string;
 *     niche: string;
 *     targetAudience: string;
 *     targetPlatforms?: Platform[];   // defaults to all 5
 *     excludeHashtags?: string[];     // hashtags to avoid (banned, overused, etc.)
 *   }
 *
 * Response:
 *   {
 *     platformHashtags: Array<{
 *       platform: Platform;
 *       recommended: Array<{
 *         tag: string;
 *         volumeTier: "niche" | "medium" | "broad";
 *         relevanceReason: string;
 *       }>;
 *       strategy: string;             // 1-sentence mix rationale
 *       avoidList: string[];          // platform-specific tags that hurt reach
 *     }>;
 *     crossPlatformCore: string[];    // hashtags worth using on every platform
 *     strategyNotes: string;
 *   }
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Platform } from "@/types/autoPosting";
import { PLATFORMS, PLATFORM_META } from "@/types/autoPosting";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

interface HashtagResearchRequest {
  topic: string;
  niche: string;
  targetAudience: string;
  targetPlatforms?: Platform[];
  excludeHashtags?: string[];
}

interface HashtagEntry {
  tag: string;
  volumeTier: "niche" | "medium" | "broad";
  relevanceReason: string;
}

interface PlatformHashtags {
  platform: Platform;
  recommended: HashtagEntry[];
  strategy: string;
  avoidList: string[];
}

interface HashtagResearchResponse {
  platformHashtags: PlatformHashtags[];
  crossPlatformCore: string[];
  strategyNotes: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HashtagResearchResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      platformHashtags: [],
      crossPlatformCore: [],
      strategyNotes: "",
      error: "Method not allowed",
    });
  }

  const { topic, niche, targetAudience, targetPlatforms, excludeHashtags } =
    req.body as HashtagResearchRequest;

  if (!topic?.trim() || !niche?.trim() || !targetAudience?.trim()) {
    return res.status(400).json({
      platformHashtags: [],
      crossPlatformCore: [],
      strategyNotes: "",
      error: "topic, niche, and targetAudience are required",
    });
  }

  const platforms = targetPlatforms?.length ? targetPlatforms : PLATFORMS;

  const platformLimits = platforms
    .map((p) => `- ${PLATFORM_META[p].label}: max ${PLATFORM_META[p].hashtagLimit} hashtags`)
    .join("\n");

  const excludeClause =
    excludeHashtags?.length
      ? `\nEXCLUDE these hashtags entirely: ${excludeHashtags.join(", ")}`
      : "";

  const prompt = `You are a social media hashtag strategist with deep knowledge of platform-specific hashtag behaviour.

TOPIC: ${topic}
NICHE: ${niche}
TARGET AUDIENCE: ${targetAudience}
${excludeClause}

PLATFORM HASHTAG LIMITS:
${platformLimits}

YOUR TASK:
For each platform, generate an optimal hashtag set that balances discoverability and relevance.

Volume tier definitions:
- niche:  under ~100K posts — low competition, highly targeted audience
- medium: 100K–1M posts — good reach/relevance balance
- broad:  over 1M posts — high reach, high competition; use sparingly

Platform-specific guidance:
- instagram:  Mix of niche (60%), medium (30%), broad (10%). No banned/spammy tags.
- facebook:   Minimal hashtags; focus on 1–2 highly specific ones only.
- linkedin:   Professional industry hashtags. Prioritise terms decision-makers search.
- twitter:    Trending or conversation-joining tags. Short, punchy, searchable.
- tiktok:     Mix trending with niche. Include at least one "FYP-style" discovery tag.

Return ONLY valid JSON, no markdown fences:
{
  "platformHashtags": [
    {
      "platform": "<platform>",
      "recommended": [
        {
          "tag": "<hashtag without #>",
          "volumeTier": "niche" | "medium" | "broad",
          "relevanceReason": "<one sentence on why this tag is relevant>"
        }
      ],
      "strategy": "<one sentence on the volume mix strategy for this platform>",
      "avoidList": ["<tag to avoid>", "<another to avoid>"]
    }
  ],
  "crossPlatformCore": [
    "<tag that works well across all platforms>",
    "<second cross-platform tag>"
  ],
  "strategyNotes": "<2–3 sentences on the overall hashtag strategy across all platforms>"
}

Include one entry per platform: ${platforms.join(", ")}.
Each recommended array must respect the platform's hashtag limit.
avoidList should include any tags that are banned, shadowbanned-risk, or genuinely spam-associated in this niche.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
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

    const parsed = JSON.parse(cleaned) as HashtagResearchResponse;

    if (!Array.isArray(parsed.platformHashtags) || parsed.platformHashtags.length === 0) {
      throw new Error("No platform hashtags returned");
    }

    return res.status(200).json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Hashtag research failed";
    return res.status(500).json({
      platformHashtags: [],
      crossPlatformCore: [],
      strategyNotes: "",
      error: message,
    });
  }
}
