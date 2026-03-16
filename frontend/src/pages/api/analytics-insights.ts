/**
 * POST /api/analytics-insights
 *
 * Architecture decision: KEEP as a standalone analytics dashboard endpoint.
 *
 * This route is intentionally distinct from POST /api/feedback/optimize-content:
 *
 *   /api/feedback/optimize-content
 *     - Input: strongly-typed GAPerformanceData + InstagramInsightsData structs
 *     - Output: ContentOptimizationHints — feeds directly into the pipeline
 *     - Purpose: automated feedback loop (runs after every pipeline execution)
 *
 *   /api/analytics-insights  ← this file
 *     - Input: flexible, user-supplied analytics data in any shape
 *     - Output: human-readable insights for the analytics dashboard
 *     - Purpose: manual analysis tool; accepts data from any source the user
 *       pastes in (GA4 export, a spreadsheet, third-party analytics, etc.)
 *
 * The two routes serve different UIs and different data shapes. Merging them
 * would couple the pipeline's type contract to the flexible dashboard input.
 *
 * Response: ApiResponse<AnalyticsInsightsData>
 *   meta: { agent: "analytics-insights" }
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

interface AnalyticsInsightsRequest {
  analyticsData: {
    trafficSources?: Record<string, number>;
    conversionRates?: Record<string, number>;
    topContent?: Array<{ title: string; views: number; conversions: number }>;
    audienceSegments?: Array<{
      segment: string;
      sessions: number;
      conversionRate: number;
    }>;
    dateRange?: string;
  };
}

export interface AnalyticsInsightsData {
  bestTrafficSource: { source: string; reasoning: string };
  highestConvertingAudience: { segment: string; reasoning: string };
  topPerformingContent: { title: string; reasoning: string };
  quickWins: string[];
  summary: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<AnalyticsInsightsData>>
) {
  if (req.method !== "POST") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const { analyticsData } = req.body as AnalyticsInsightsRequest;

  if (!analyticsData || typeof analyticsData !== "object") {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "analyticsData is required");
  }

  const prompt = `You are a senior marketing data analyst. Analyze the following analytics data and return structured, actionable insights.

DATA:
${JSON.stringify(analyticsData, null, 2)}

Return ONLY valid JSON with no markdown fences, exactly this shape:
{
  "bestTrafficSource": {
    "source": "<source name>",
    "reasoning": "<1–2 sentences on why this source is best>"
  },
  "highestConvertingAudience": {
    "segment": "<segment name>",
    "reasoning": "<1–2 sentences on why this segment converts best>"
  },
  "topPerformingContent": {
    "title": "<content title>",
    "reasoning": "<1–2 sentences on what makes it top performing>"
  },
  "quickWins": [
    "<actionable tactic 1 based on the data>",
    "<actionable tactic 2>",
    "<actionable tactic 3>"
  ],
  "summary": "<2–3 sentence plain-English summary of the single biggest optimization opportunity>"
}

Rules:
- Every recommendation must be grounded in the provided data
- quickWins must be specific and actionable, not generic
- If a data category is missing, skip it gracefully rather than inventing numbers`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
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

    const insights = JSON.parse(cleaned) as AnalyticsInsightsData;
    return ok(res, insights, { agent: "analytics-insights" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
