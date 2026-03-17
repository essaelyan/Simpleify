/**
 * briefEnrichment.ts — Brief enrichment agent prompt.
 *
 * Transforms a thin user-supplied ContentBrief into a richer, strategically-
 * grounded brief before content generation runs.
 *
 * Used by: services/briefEnrichmentAgent.ts
 */

import type { BriefEnrichmentInput } from "@/types/briefEnrichment";

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildEnrichmentPrompt(input: BriefEnrichmentInput): string {
  const platformList = input.selectedPlatforms.join(", ");

  const brandVoiceBlock = input.brandVoiceText
    ? `\n\nBRAND VOICE (must be respected throughout enrichment):\n${input.brandVoiceText}`
    : "";

  // Lightweight hint injection — only top hooks + tone/audience for enrichment context.
  // (The detailed injectOptimizationHints is reserved for the generation step.)
  const hintsBlock = input.optimizationHints
    ? `\n\nPERFORMANCE INSIGHTS (from recent analytics — use to inform angle and hook recommendations):\n` +
      `Top hooks: ${input.optimizationHints.topHooks.map((h) => `"${h.pattern}"`).join(", ")}\n` +
      `Tone insight: ${input.optimizationHints.toneInsight}\n` +
      `Audience insight: ${input.optimizationHints.audienceInsight}`
    : "";

  return `You are a senior content strategist. Enrich the following thin content brief into a stronger, more actionable brief before content creation begins.

ORIGINAL BRIEF:
Topic: ${input.topic}
Tone: ${input.tone}
Target Audience: ${input.targetAudience}
Call to Action: ${input.callToAction}
Platforms: ${platformList}${brandVoiceBlock}${hintsBlock}

TASK:
Analyze this brief and return an enriched version. Return ONLY valid JSON, no markdown fences, in exactly this shape:
{
  "enrichedTopic": "A reframed, more specific and compelling version of the topic (1–2 sentences that give a copywriter a clear angle to work from)",
  "contentAngles": [
    { "angle": "Short angle title (≤ 10 words)", "rationale": "Why this angle resonates with the target audience" },
    { "angle": "...", "rationale": "..." },
    { "angle": "...", "rationale": "..." }
  ],
  "refinedAudience": "A more specific, psychographic-rich audience description (2–3 sentences — what they care about, their pain points, their decision context)",
  "suggestedHooks": [
    { "hook": "A ready-to-use opening line — a real sentence, not a template", "platform": "instagram" },
    { "hook": "...", "platform": null },
    { "hook": "...", "platform": "linkedin" }
  ],
  "ctaOptions": [
    { "cta": "Soft, informative CTA phrase", "context": "When / which use-case this CTA fits best" },
    { "cta": "...", "context": "..." },
    { "cta": "...", "context": "..." }
  ],
  "toneRefinements": [
    "Specific tone adjustment for this brief (not generic writing advice)",
    "..."
  ],
  "riskFlags": [
    "Real risk: brand sensitivity, audience mismatch, or platform-specific issue — empty array if none"
  ],
  "enrichmentSummary": "2–3 sentence plain-English summary of what was improved and why it will produce better content"
}

Rules:
- enrichedTopic must be more specific and compelling than the original, not just a paraphrase
- contentAngles must be meaningfully different — not variations of the same idea
- suggestedHooks must be ready to use as opening lines, not abstract patterns
- ctaOptions must be soft and informative, never pushy or urgent
- toneRefinements must reference the specific topic and audience, not generic advice
- riskFlags: flag only real, concrete risks — return an empty array [] if the brief is clean
- Exactly 3 contentAngles, 3 suggestedHooks, 3 ctaOptions
- platform in suggestedHooks must be one of: instagram, facebook, linkedin, twitter, tiktok, or null`;
}
