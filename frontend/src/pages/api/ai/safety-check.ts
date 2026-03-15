import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type {
  AdvancedSafetyRequest,
  AdvancedSafetyResponse,
} from "@/types/autoPosting";
import {
  buildSafetyCheckPrompt,
  parseSafetyCheckResponse,
  buildRegenerationHints,
} from "@/services/safetyFilter";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
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
    return res
      .status(400)
      .json({ error: "draftId, platform, and caption are required" });
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
      max_tokens: 512,
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
      return res.status(422).json({
        error: "Safety check returned non-JSON or invalid output. Please try again.",
        raw: rawText,
      });
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

    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Safety check failed";
    return res.status(500).json({ error: message });
  }
}
