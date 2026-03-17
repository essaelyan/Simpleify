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
import { buildGrowthStrategyPrompt } from "@/prompts/growthStrategy";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, maxRetries: 4 });

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

  const prompt = buildGrowthStrategyPrompt(insights as Record<string, unknown>);

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
