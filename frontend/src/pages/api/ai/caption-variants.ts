/**
 * POST /api/ai/caption-variants
 *
 * A/B test caption generator.
 *
 * Takes a single platform caption + its brief context and generates 3
 * meaningfully different variants (different hook, angle, or tone).
 * Each variant is scored on predicted engagement, clarity, and CTA
 * strength so marketers can pick the best one before publishing.
 *
 * Body:
 *   {
 *     platform: Platform;
 *     originalCaption: string;
 *     hashtags: string[];
 *     brief: { topic: string; tone: string; targetAudience: string; callToAction: string };
 *   }
 *
 * Response:
 *   {
 *     variants: Array<{
 *       caption: string;
 *       hashtags: string[];
 *       hook: string;           // one-line description of the opening approach
 *       angle: string;          // strategic angle (e.g. "problem-agitate-solve")
 *       scores: {
 *         engagementPotential: number;  // 1–10
 *         clarity: number;              // 1–10
 *         ctaStrength: number;          // 1–10
 *         overall: number;              // average
 *       };
 *       reasoning: string;      // why this variant was written this way
 *     }>;
 *     recommendation: string;   // which variant to use and why
 *   }
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Platform } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

interface CaptionVariantsRequest {
  platform: Platform;
  originalCaption: string;
  hashtags: string[];
  brief: {
    topic: string;
    tone: string;
    targetAudience: string;
    callToAction: string;
  };
}

interface CaptionVariant {
  caption: string;
  hashtags: string[];
  hook: string;
  angle: string;
  scores: {
    engagementPotential: number;
    clarity: number;
    ctaStrength: number;
    overall: number;
  };
  reasoning: string;
}

interface CaptionVariantsResponse {
  variants: CaptionVariant[];
  recommendation: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CaptionVariantsResponse>
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ variants: [], recommendation: "", error: "Method not allowed" });
  }

  const { platform, originalCaption, hashtags, brief } =
    req.body as CaptionVariantsRequest;

  if (!platform || !originalCaption || !brief?.topic) {
    return res.status(400).json({
      variants: [],
      recommendation: "",
      error: "platform, originalCaption, and brief.topic are required",
    });
  }

  const meta = PLATFORM_META[platform];
  if (!meta) {
    return res.status(400).json({
      variants: [],
      recommendation: "",
      error: `Unknown platform: ${platform}`,
    });
  }

  const prompt = `You are a world-class social media copywriter specialising in A/B testing.

ORIGINAL CAPTION (${meta.label}):
"${originalCaption}"

HASHTAGS: ${hashtags.map((h) => `#${h}`).join(" ")}

BRIEF:
- Topic: ${brief.topic}
- Tone: ${brief.tone}
- Target audience: ${brief.targetAudience}
- Call to action: ${brief.callToAction}

PLATFORM CONSTRAINTS:
- Max characters: ${meta.maxChars}
- Max hashtags: ${meta.hashtagLimit}

YOUR TASK:
Generate exactly 3 caption variants for ${meta.label}. Each variant must:
1. Use a distinctly different hook, angle, or structural approach from the original AND from each other
2. Serve the same CTA and audience
3. Stay within the platform character and hashtag limits
4. Be genuinely different — not just word swaps

Angle options to draw from (use a different one per variant):
- Problem-agitate-solve
- Curiosity gap / open loop
- Bold claim + proof
- Story / personal anecdote opener
- Data-led / statistic first
- Contrarian / myth-busting
- Direct benefit statement
- Social proof / authority

Score each variant honestly (1–10) on:
- engagementPotential: likelihood of likes, comments, saves
- clarity: how instantly understandable the message is
- ctaStrength: how compelling the call to action is

Respond ONLY with valid JSON, no markdown fences:
{
  "variants": [
    {
      "caption": "<full caption text>",
      "hashtags": ["tag1", "tag2"],
      "hook": "<one sentence describing the opening hook approach>",
      "angle": "<angle name from the list above>",
      "scores": {
        "engagementPotential": <1-10>,
        "clarity": <1-10>,
        "ctaStrength": <1-10>,
        "overall": <average of the three, rounded to 1 decimal>
      },
      "reasoning": "<2 sentences on why this variant was written this way>"
    }
  ],
  "recommendation": "<which variant number (1/2/3) to publish first and why in 1–2 sentences>"
}`;

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

    const parsed = JSON.parse(cleaned) as {
      variants: CaptionVariant[];
      recommendation: string;
    };

    if (!Array.isArray(parsed.variants) || parsed.variants.length !== 3) {
      throw new Error(`Expected 3 variants, got ${parsed.variants?.length ?? 0}`);
    }

    return res.status(200).json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Variant generation failed";
    return res.status(500).json({ variants: [], recommendation: "", error: message });
  }
}
