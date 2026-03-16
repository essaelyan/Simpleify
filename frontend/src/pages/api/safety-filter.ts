import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { Platform, SafetyFilterRequest, SafetyFilterResponse } from "@/types/autoPosting";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import { PLATFORM_META } from "@/types/autoPosting";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

function buildSafetyPrompt(platform: Platform, caption: string, hashtags: string[]): string {
  const meta = PLATFORM_META[platform];
  return `You are a content safety moderator for a social media scheduling platform.
Evaluate the following ${meta.label} post caption for policy violations.

CAPTION:
${caption}

HASHTAGS:
${hashtags.length > 0 ? hashtags.join(", ") : "(none)"}

Check for the following issues:
1. Hate speech or discrimination targeting protected groups (race, gender, religion, etc.)
2. Explicit, adult, or graphic content
3. Demonstrably false medical, financial, or safety claims (misinformation)
4. Deceptive or unsubstantiated promotional claims (e.g. "guaranteed results", "100% risk-free", "cure")
5. Harassment, threats, or personal attacks

Respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "safe": true,
  "flagReason": null,
  "severity": null
}

If the content is safe set safe=true, flagReason=null, severity=null.
If the content violates any policy set safe=false, flagReason to a concise user-readable explanation (max 120 characters), and severity to "low", "medium", or "high" based on the seriousness of the violation.`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<SafetyFilterResponse>>
) {
  if (req.method !== "POST") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const { draftId, platform, caption, hashtags } = req.body as SafetyFilterRequest;

  if (!draftId || !platform || !caption) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "draftId, platform, and caption are required");
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: buildSafetyPrompt(platform, caption, hashtags ?? []) }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    let parsed: { safe: boolean; flagReason: string | null; severity: "low" | "medium" | "high" | null };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return fail(res, 422, API_ERRORS.PARSE_ERROR, "Safety filter returned non-JSON output. Please try again.", rawText);
    }

    const result: SafetyFilterResponse = {
      draftId,
      safe: parsed.safe,
      flagReason: parsed.flagReason ?? null,
      severity: parsed.severity ?? null,
    };

    return ok(res, result, { agent: "safety-filter", platform });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Safety check failed";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
