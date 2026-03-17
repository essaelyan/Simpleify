import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type {
  AdvancedSafetyRequest,
  AdvancedSafetyResponse,
} from "@/types/autoPosting";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import {
  buildSafetyCheckPrompt,
  parseSafetyCheckResponse,
  buildRegenerationHints,
} from "@/services/safetyFilter";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, maxRetries: 4 });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<AdvancedSafetyResponse>>
) {
  if (req.method !== "POST") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const {
    draftId,
    platform,
    caption,
    hashtags,
    brandVoice,
    recentCaptions,
  } = req.body as AdvancedSafetyRequest;

  if (!draftId || !platform || !caption) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "draftId, platform, and caption are required");
  }

  const safetyReq: AdvancedSafetyRequest = {
    draftId,
    platform,
    caption,
    hashtags: hashtags ?? [],
    brandVoice: brandVoice ?? null,
    recentCaptions: recentCaptions ?? [],
  };

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        { role: "user", content: buildSafetyCheckPrompt(safetyReq) },
      ],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    let parsed: ReturnType<typeof parseSafetyCheckResponse>;
    try {
      parsed = parseSafetyCheckResponse(rawText);
    } catch {
      return fail(res, 422, API_ERRORS.PARSE_ERROR, "Safety check returned non-JSON or invalid output. Please try again.", rawText);
    }

    const failedChecks = parsed.checks.filter((c) => !c.passed);
    const regenerationHints = buildRegenerationHints(failedChecks);

    const result: AdvancedSafetyResponse = {
      draftId,
      safe: parsed.safe,
      checks: parsed.checks,
      flagReason: parsed.flagReason,
      severity: parsed.severity,
      regenerationHints,
    };

    return ok(res, result, { agent: "safety-check", platform });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Safety check failed";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
