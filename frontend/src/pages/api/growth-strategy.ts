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
 * Response: ApiResponse<GrowthStrategyData>
 *   meta: { agent: "growth-strategy" }
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";

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

export interface GrowthStrategyTactic {
  headline: string;
  tactics: string[];
}

export interface GrowthExperiment {
  name: string;
  hypothesis: string;
  successMetric: string;
}

export interface GrowthStrategyData {
  contentStrategy: GrowthStrategyTactic;
  paidStrategy: GrowthStrategyTactic;
  audienceExpansion: GrowthStrategyTactic;
  experiments: GrowthExperiment[];
  priorityOrder: string[];
  executiveSummary: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<GrowthStrategyData>>
) {
  if (req.method !== "POST") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const { insights } = req.body as GrowthStrategyRequest;

  if (!insights || typeof insights !== "object") {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "insights object is required");
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

    const strategy = JSON.parse(cleaned) as GrowthStrategyData;
    return ok(res, strategy, { agent: "growth-strategy" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Strategy generation failed";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
