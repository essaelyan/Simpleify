/**
 * builder.ts — Prompt building utilities for the AI Marketing OS.
 *
 * Provides:
 *  - PromptContext: typed context for dynamic prompt builders
 *  - buildPrompt: simple {{variable}} template interpolation
 *  - injectBrandVoice: converts BrandVoiceProfile → prompt block
 *  - injectOptimizationHints: formats ContentOptimizationHints → prompt block (generation)
 *  - injectEnrichment: formats BriefEnrichmentOutput → prompt block
 *
 * Server-side only. Import from @/prompts or @/prompts/builder.
 */

import type { Platform } from "@/types/autoPosting";
import type { BrandVoiceProfile } from "@/types/brandVoice";
import type { ContentOptimizationHints } from "@/types/feedbackLoop";
import type { BriefEnrichmentOutput } from "@/types/briefEnrichment";
import { brandVoiceToPromptText } from "@/services/brandVoiceService";

// ─── Context Type ─────────────────────────────────────────────────────────────

/**
 * Generic context object passed to dynamic prompt builders.
 * Each builder declares its own required subset.
 */
export interface PromptContext {
  platform?: Platform;
  audience?: string;
  brandVoice?: BrandVoiceProfile | null;
  optimizationHints?: ContentOptimizationHints | null;
  [key: string]: unknown;
}

// ─── Template Interpolation ───────────────────────────────────────────────────

/**
 * Replaces {{key}} placeholders in a template with values from vars.
 * Missing keys produce an empty string — never throws.
 *
 * @example
 *   buildPrompt("Hello {{name}}, platform: {{platform}}", { name: "Ada", platform: "linkedin" })
 *   // → "Hello Ada, platform: linkedin"
 */
export function buildPrompt(
  template: string,
  vars: Record<string, string | number | boolean | null | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

// ─── Injection Helpers ────────────────────────────────────────────────────────

/**
 * Converts a BrandVoiceProfile into a ready-to-inject prompt block.
 * Returns empty string when profile is null/undefined.
 */
export function injectBrandVoice(
  profile: BrandVoiceProfile | null | undefined,
  header = "BRAND VOICE (strict — all captions must match this profile):"
): string {
  if (!profile) return "";
  return `\n\n${header}\n${brandVoiceToPromptText(profile)}`;
}

/**
 * Formats ContentOptimizationHints as a detailed prompt block for content
 * generation. Includes hooks, tone/audience insights, and per-platform formats.
 * Returns empty string when hints is null/undefined.
 */
export function injectOptimizationHints(
  hints: ContentOptimizationHints | null | undefined
): string {
  if (!hints) return "";
  return `\n\nPERFORMANCE OPTIMIZATION INSIGHTS (apply to ALL captions):
These are derived from real analytics data. Use them to optimize content quality.

TOP PERFORMING HOOKS — Open with one of these patterns:
${hints.topHooks
  .map(
    (x, i) =>
      `${i + 1}. Pattern: "${x.pattern}" — Example: "${x.example}" (${x.avgEngagementRate.toFixed(1)}% avg engagement)`
  )
  .join("\n")}

TONE INSIGHT: ${hints.toneInsight}
AUDIENCE INSIGHT: ${hints.audienceInsight}

BEST FORMATS PER PLATFORM:
${hints.bestFormats
  .map((f) => `- ${f.platform}: ${f.format.replace(/_/g, " ")} — ${f.reasoning}`)
  .join("\n")}

CONTEXT: ${hints.claudeSummary}

RULES: Open each caption using a hook pattern that fits the topic. Do not mention these insights explicitly in the caption text.`;
}

/**
 * Formats BriefEnrichmentOutput as a prompt block for content generation.
 * Returns empty string when enrichment is null/undefined.
 */
export function injectEnrichment(
  e: BriefEnrichmentOutput | null | undefined
): string {
  if (!e) return "";
  return `\n\nBRIEF ENRICHMENT (strategic context — use to elevate content quality):
Enriched topic framing: ${e.enrichedTopic}
Refined audience: ${e.refinedAudience}

Content angles to choose from (pick the most relevant per platform):
${e.contentAngles.map((a, i) => `${i + 1}. ${a.angle} — ${a.rationale}`).join("\n")}

Suggested opening hooks (adapt to platform — do not copy verbatim):
${e.suggestedHooks
  .map(
    (h, i) =>
      `${i + 1}. "${h.hook}"${h.platform ? ` (best for ${h.platform})` : ""}`
  )
  .join("\n")}

CTA options (choose the best fit per platform):
${e.ctaOptions.map((c, i) => `${i + 1}. "${c.cta}" — ${c.context}`).join("\n")}

Tone refinements: ${e.toneRefinements.join("; ")}${
    e.riskFlags.length > 0 ? `\nRisk flags to avoid: ${e.riskFlags.join("; ")}` : ""
  }

Rules: Use the enriched framing and hooks as inspiration — adapt them, do not copy. Each platform caption must still feel native to that platform.`;
}
