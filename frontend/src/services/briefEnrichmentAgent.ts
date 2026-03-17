/**
 * briefEnrichmentAgent.ts — Brief Enrichment Agent (Agent C).
 *
 * Responsibility: transform a thin user-supplied ContentBrief into a richer,
 * strategically-grounded brief before content generation runs.
 *
 * Architecture:
 *   Called by pipeline/run.ts immediately after brand voice load and before
 *   generateContentForBrief(). The output is attached to the brief as
 *   `enrichment` and injected into the content generation prompt.
 *
 * Failure behaviour:
 *   If enrichment fails for any reason (API error, bad JSON, validation error),
 *   the function returns { success: false, enrichment: null }. The pipeline
 *   falls back to the original brief without interruption — enrichment is
 *   enhancement-only, never a hard dependency.
 *
 * Server-side only.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ContentBrief } from "@/types/autoPosting";
import type { BrandVoiceProfile } from "@/types/brandVoice";
import type { ContentOptimizationHints } from "@/types/feedbackLoop";
import type {
  BriefEnrichmentInput,
  BriefEnrichmentOutput,
  EnrichmentResult,
  ContentAngle,
  HookSuggestion,
  CTAOption,
} from "@/types/briefEnrichment";
import { brandVoiceToPromptText } from "@/services/brandVoiceService";
import { buildEnrichmentPrompt } from "@/prompts/briefEnrichment";

// ─── Response validator ────────────────────────────────────────────────────────

function validateEnrichmentOutput(raw: unknown): BriefEnrichmentOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Enrichment response is not an object");
  }
  const r = raw as Record<string, unknown>;

  const requiredStrings = ["enrichedTopic", "refinedAudience", "enrichmentSummary"];
  for (const key of requiredStrings) {
    if (typeof r[key] !== "string" || !(r[key] as string).trim()) {
      throw new Error(`Missing or empty field: ${key}`);
    }
  }

  const requireArray = (key: string, minLen: number) => {
    if (!Array.isArray(r[key]) || (r[key] as unknown[]).length < minLen) {
      throw new Error(`${key} must be an array with at least ${minLen} items`);
    }
  };

  requireArray("contentAngles", 3);
  requireArray("suggestedHooks", 3);
  requireArray("ctaOptions", 3);
  requireArray("toneRefinements", 1);
  requireArray("riskFlags", 0); // can be empty

  const angles = (r.contentAngles as unknown[]).slice(0, 3).map((a) => {
    const obj = a as Record<string, unknown>;
    if (typeof obj.angle !== "string" || typeof obj.rationale !== "string") {
      throw new Error("contentAngles entries must have angle and rationale strings");
    }
    return { angle: obj.angle, rationale: obj.rationale } as ContentAngle;
  });

  const VALID_PLATFORMS = new Set(["instagram", "facebook", "linkedin", "twitter", "tiktok", null]);
  const hooks = (r.suggestedHooks as unknown[]).slice(0, 3).map((h) => {
    const obj = h as Record<string, unknown>;
    if (typeof obj.hook !== "string") {
      throw new Error("suggestedHooks entries must have a hook string");
    }
    const platform = obj.platform ?? null;
    if (!VALID_PLATFORMS.has(platform as string | null)) {
      throw new Error(`Invalid platform in suggestedHooks: ${String(platform)}`);
    }
    return { hook: obj.hook, platform: platform ?? null } as HookSuggestion;
  });

  const ctas = (r.ctaOptions as unknown[]).slice(0, 3).map((c) => {
    const obj = c as Record<string, unknown>;
    if (typeof obj.cta !== "string" || typeof obj.context !== "string") {
      throw new Error("ctaOptions entries must have cta and context strings");
    }
    return { cta: obj.cta, context: obj.context } as CTAOption;
  });

  return {
    enrichedTopic: r.enrichedTopic as string,
    contentAngles: angles as [ContentAngle, ContentAngle, ContentAngle],
    refinedAudience: r.refinedAudience as string,
    suggestedHooks: hooks as [HookSuggestion, HookSuggestion, HookSuggestion],
    ctaOptions: ctas as [CTAOption, CTAOption, CTAOption],
    toneRefinements: (r.toneRefinements as unknown[]).map(String),
    riskFlags: (r.riskFlags as unknown[]).map(String),
    enrichmentSummary: r.enrichmentSummary as string,
  };
}

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Enriches a ContentBrief using Claude Opus before content generation.
 *
 * Always resolves — never throws. Returns { success: false, enrichment: null }
 * on any failure so the pipeline can fall back to the original brief safely.
 */
export async function enrichBrief(
  anthropic: Anthropic,
  brief: ContentBrief,
  brandVoice: BrandVoiceProfile | null = null,
  optimizationHints: ContentOptimizationHints | null = null
): Promise<EnrichmentResult> {
  const input: BriefEnrichmentInput = {
    topic: brief.topic,
    tone: brief.tone,
    targetAudience: brief.targetAudience,
    callToAction: brief.callToAction,
    selectedPlatforms: brief.selectedPlatforms,
    brandVoiceText: brandVoice ? brandVoiceToPromptText(brandVoice) : null,
    optimizationHints,
  };

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: buildEnrichmentPrompt(input) }],
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
    const enrichment = validateEnrichmentOutput(parsed);

    return { success: true, enrichment };
  } catch (err) {
    const failReason = err instanceof Error ? err.message : "Unknown enrichment error";
    return { success: false, enrichment: null, failReason };
  }
}
