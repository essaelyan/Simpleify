/**
 * POST /api/growth-strategy
 *
 * Accepts marketing insights and returns a structured growth strategy
 * with content, paid, audience, and experiment recommendations.
 *
 * Body:
 *   {
 *     insights: {
 *       bestTrafficSource?: string;
 *       topConvertingAudience?: string;
 *       topContent?: string;
 *       currentMonthlyBudget?: number;
 *       currentMonthlyRevenue?: number;
 *       goals?: string[];
 *     }
 *   }
 *
 * Response:
 *   {
 *     strategy: {
 *       contentStrategy: { headline: string; tactics: string[] };
 *       paidStrategy: { headline: string; tactics: string[] };
 *       audienceExpansion: { headline: string; tactics: string[] };
 *       experiments: Array<{ name: string; hypothesis: string; successMetric: string }>;
 *       priorityOrder: string[];
 *       executiveSummary: string;
 *     }
 *   }
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

interface GrowthStrategyRequest {
  insights: {
    bestTrafficSource?: string;
    topConvertingAudience?: string;
    topContent?: string;
    currentMonthlyBudget?: number;
    currentMonthlyRevenue?: number;
    goals?: string[];
  };
}

interface GrowthStrategyTactic {
  headline: string;
  tactics: string[];
}

interface GrowthExperiment {
  name: string;
  hypothesis: string;
  successMetric: string;
}

interface GrowthStrategyResponse {
  strategy: {
    contentStrategy: GrowthStrategyTactic;
    paidStrategy: GrowthStrategyTactic;
    audienceExpansion: GrowthStrategyTactic;
    experiments: GrowthExperiment[];
    priorityOrder: string[];
    executiveSummary: string;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GrowthStrategyResponse>
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ strategy: null as never, error: "Method not allowed" });
  }

  const { insights } = req.body as GrowthStrategyRequest;

  if (!insights || typeof insights !== "object") {
    return res
      .status(400)
      .json({ strategy: null as never, error: "insights object is required" });
  }

  const prompt = `You are a growth marketing strategist. Using the following business insights, build a practical growth strategy.

INSIGHTS:
${JSON.stringify(insights, null, 2)}

Return ONLY valid JSON with no markdown fences, exactly this shape:
{
  "contentStrategy": {
    "headline": "<one sentence describing the content approach>",
    "tactics": [
      "<specific content tactic 1>",
      "<specific content tactic 2>",
      "<specific content tactic 3>"
    ]
  },
  "paidStrategy": {
    "headline": "<one sentence describing the paid media approach>",
    "tactics": [
      "<paid tactic 1>",
      "<paid tactic 2>",
      "<paid tactic 3>"
    ]
  },
  "audienceExpansion": {
    "headline": "<one sentence describing audience expansion approach>",
    "tactics": [
      "<audience tactic 1>",
      "<audience tactic 2>",
      "<audience tactic 3>"
    ]
  },
  "experiments": [
    {
      "name": "<experiment name>",
      "hypothesis": "<if we do X, we expect Y because Z>",
      "successMetric": "<specific, measurable metric>"
    },
    {
      "name": "<experiment name>",
      "hypothesis": "<hypothesis>",
      "successMetric": "<metric>"
    }
  ],
  "priorityOrder": [
    "<highest ROI action first>",
    "<second priority>",
    "<third priority>"
  ],
  "executiveSummary": "<2–3 sentences summarizing the overall growth strategy and expected impact>"
}

Rules:
- All tactics must be specific and immediately actionable, not generic
- Experiments must be testable within 30 days
- If budget data is present, size recommendations accordingly
- priorityOrder should reflect expected ROI and ease of execution`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1500,
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

    const strategy = JSON.parse(cleaned);
    return res.status(200).json({ strategy });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Strategy generation failed";
    return res.status(500).json({ strategy: null as never, error: message });
  }
}
