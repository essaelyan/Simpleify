import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type {
  OptimizeContentRequest,
  ContentOptimizationHints,
  GAPerformanceData,
  InstagramInsightsData,
} from "@/types/feedbackLoop";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import {
  buildOptimizationPrompt,
  parseOptimizationResponse,
} from "@/services/feedbackLoop";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, maxRetries: 4 });

export interface OptimizeContentData {
  hints: ContentOptimizationHints;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<OptimizeContentData>>
) {
  if (req.method !== "POST") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const { ga, instagram } = req.body as OptimizeContentRequest;

  if (!ga || !instagram) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "ga and instagram data are required");
  }

  if (!ga.propertyId || !instagram.accountId) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "Invalid ga or instagram data shape");
  }

  try {
    const prompt = buildOptimizationPrompt(
      ga as GAPerformanceData,
      instagram as InstagramInsightsData
    );

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    let hints: ContentOptimizationHints;
    try {
      hints = parseOptimizationResponse(rawText, ga, instagram);
    } catch (parseErr) {
      return fail(
        res,
        422,
        API_ERRORS.PARSE_ERROR,
        parseErr instanceof Error
          ? parseErr.message
          : "Claude returned non-JSON or invalid output. Please try again.",
        rawText
      );
    }

    return ok(res, { hints }, { agent: "feedback-optimizer" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Optimization failed";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
