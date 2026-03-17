import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { ContentBrief, GenerateContentResponse } from "@/types/autoPosting";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import { generateContentForBrief } from "@/services/contentGenerator";
import { loadActiveBrandVoice } from "@/services/brandVoiceService";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, maxRetries: 4 });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<GenerateContentResponse>>
) {
  if (req.method !== "POST") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const { brief } = req.body as { brief: ContentBrief };

  if (!brief?.topic || !brief?.selectedPlatforms?.length) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "topic and selectedPlatforms are required");
  }

  try {
    const brandVoice = await loadActiveBrandVoice();
    const result: GenerateContentResponse = await generateContentForBrief(
      anthropic,
      brief,
      "claude-opus-4-6",
      brandVoice
    );
    return ok(res, result);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return fail(res, 422, API_ERRORS.PARSE_ERROR, "Claude returned non-JSON output. Please try again.");
    }
    const message = err instanceof Error ? err.message : "Generation failed";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
