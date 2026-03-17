/**
 * contentQAAgent.ts — Content QA Agent (Agent D).
 *
 * Responsibility: evaluate generated captions for quality — hook strength,
 * CTA clarity, readability, platform fit, brand alignment, duplication risk,
 * and character-limit compliance — before the safety filter runs.
 *
 * Architecture:
 *   Called by pipeline/run.ts per draft, after generation and before safety.
 *   Returns a verdict of "pass" | "revise" | "reject".
 *   - pass   → proceed to safety check unchanged
 *   - revise → pipeline regenerates once with revisionGuidance injected, then
 *              re-runs QA; if still not rejected, proceeds to safety
 *   - reject → platform is skipped entirely (status = "qa_rejected")
 *
 * Model: claude-haiku-4-5-20251001 (fast, cost-effective — same tier as safety).
 *
 * Failure behaviour:
 *   Always resolves. Returns { success: false, result: null } on any error so
 *   the pipeline can fall back to treating the content as passing QA.
 *
 * Server-side only.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Platform } from "@/types/autoPosting";
import type { ContentBrief } from "@/types/autoPosting";
import type {
  ContentQAResult,
  QARunResult,
  QAIssue,
  QADimension,
  DuplicationRisk,
  QAVerdict,
} from "@/types/contentQA";
import { buildQAPrompt } from "@/prompts/contentQA";

// Re-export so existing callers that import buildQAPrompt from this
// module continue to work without changes.
export { buildQAPrompt };

// ─── Response Validator ────────────────────────────────────────────────────────

function validateQAResponse(raw: unknown): ContentQAResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("QA response is not an object");
  }
  const r = raw as Record<string, unknown>;

  const VALID_VERDICTS = new Set<string>(["pass", "revise", "reject"]);
  if (typeof r.verdict !== "string" || !VALID_VERDICTS.has(r.verdict)) {
    throw new Error(`Invalid verdict: ${String(r.verdict)}`);
  }

  const scoreFields = [
    "overallScore",
    "hookScore",
    "ctaScore",
    "readabilityScore",
    "platformFitScore",
    "brandAlignmentScore",
  ];
  for (const field of scoreFields) {
    const val = r[field];
    if (typeof val !== "number" || val < 0 || val > 100) {
      throw new Error(`${field} must be a number between 0 and 100`);
    }
  }

  const VALID_DUPLICATION = new Set<string>(["none", "low", "medium", "high"]);
  if (typeof r.duplicationRisk !== "string" || !VALID_DUPLICATION.has(r.duplicationRisk)) {
    throw new Error(`Invalid duplicationRisk: ${String(r.duplicationRisk)}`);
  }

  if (!Array.isArray(r.issues)) {
    throw new Error("issues must be an array");
  }

  const VALID_DIMENSIONS = new Set<string>([
    "hook",
    "cta",
    "readability",
    "platform_fit",
    "brand_alignment",
    "duplication",
    "character_limit",
  ]);
  const VALID_SEVERITIES = new Set<string>(["low", "medium", "high"]);

  const issues: QAIssue[] = (r.issues as unknown[]).map((item) => {
    const obj = item as Record<string, unknown>;
    if (typeof obj.dimension !== "string" || !VALID_DIMENSIONS.has(obj.dimension)) {
      throw new Error(`Invalid issue dimension: ${String(obj.dimension)}`);
    }
    if (typeof obj.description !== "string") {
      throw new Error("Issue description must be a string");
    }
    if (typeof obj.severity !== "string" || !VALID_SEVERITIES.has(obj.severity)) {
      throw new Error(`Invalid issue severity: ${String(obj.severity)}`);
    }
    return {
      dimension: obj.dimension as QADimension,
      description: obj.description,
      severity: obj.severity as "low" | "medium" | "high",
    };
  });

  const revisionGuidance =
    r.revisionGuidance === null || r.revisionGuidance === undefined
      ? null
      : typeof r.revisionGuidance === "string"
        ? r.revisionGuidance
        : null;

  return {
    verdict: r.verdict as QAVerdict,
    overallScore: r.overallScore as number,
    hookScore: r.hookScore as number,
    ctaScore: r.ctaScore as number,
    readabilityScore: r.readabilityScore as number,
    platformFitScore: r.platformFitScore as number,
    brandAlignmentScore: r.brandAlignmentScore as number,
    duplicationRisk: r.duplicationRisk as DuplicationRisk,
    issues,
    revisionGuidance,
  };
}

// ─── Main Export ───────────────────────────────────────────────────────────────

/**
 * Runs the Content QA Agent on a single platform draft.
 *
 * Always resolves — never throws. Returns { success: false, result: null }
 * on any failure so the pipeline can fall back to treating content as passing.
 */
export async function runContentQA(
  anthropic: Anthropic,
  platform: Platform,
  caption: string,
  hashtags: string[],
  brief: ContentBrief,
  brandVoiceText: string | null,
  recentGeneratedDrafts: string[]
): Promise<QARunResult> {
  try {
    const prompt = buildQAPrompt(
      platform,
      caption,
      hashtags,
      brief,
      brandVoiceText,
      recentGeneratedDrafts
    );

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
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

    const parsed: unknown = JSON.parse(cleaned);
    const result = validateQAResponse(parsed);

    return { success: true, result };
  } catch (err) {
    const failReason = err instanceof Error ? err.message : "Unknown QA error";
    return { success: false, result: null, failReason };
  }
}
