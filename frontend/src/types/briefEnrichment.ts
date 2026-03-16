/**
 * briefEnrichment.ts — Types for the Brief Enrichment Agent.
 *
 * The enrichment agent transforms a thin user-supplied ContentBrief into a
 * richer, strategically-grounded brief before content generation runs.
 *
 * Flow:
 *   ContentBrief (raw user input)
 *     → BriefEnrichmentAgent (Claude Opus)
 *     → BriefEnrichmentOutput (attached to brief as `enrichment`)
 *     → generateContentForBrief() (consumes enrichment via buildContentPrompt)
 */

import type { Platform } from "@/types/autoPosting";

// ─── Input ────────────────────────────────────────────────────────────────────

export interface BriefEnrichmentInput {
  topic: string;
  tone: string;
  targetAudience: string;
  callToAction: string;
  selectedPlatforms: Platform[];
  /** Serialized brand voice block (brandVoiceToPromptText output) — optional */
  brandVoiceText: string | null;
  /** Hints from the most recent feedback snapshot — optional */
  optimizationHints: import("@/types/feedbackLoop").ContentOptimizationHints | null;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface ContentAngle {
  /** Short angle title (≤ 10 words) */
  angle: string;
  /** Why this angle resonates with the target audience */
  rationale: string;
}

export interface HookSuggestion {
  /** Ready-to-use opening line — not a template, a real sentence */
  hook: string;
  /** Platform this hook is best suited for; null = works across all */
  platform: Platform | null;
}

export interface CTAOption {
  /** Soft, informative CTA phrase */
  cta: string;
  /** When / which use-case this CTA fits best */
  context: string;
}

export interface BriefEnrichmentOutput {
  /** Reframed, more specific and compelling version of the original topic */
  enrichedTopic: string;
  /** Three meaningfully distinct content angles */
  contentAngles: [ContentAngle, ContentAngle, ContentAngle];
  /** More specific, psychographic-rich audience description */
  refinedAudience: string;
  /** Three ready-to-use opening hooks */
  suggestedHooks: [HookSuggestion, HookSuggestion, HookSuggestion];
  /** Three soft, informative CTA options */
  ctaOptions: [CTAOption, CTAOption, CTAOption];
  /** Specific tone-adjustment suggestions for this brief */
  toneRefinements: string[];
  /** Potential sensitivities, audience mismatches, or platform issues (empty if clean) */
  riskFlags: string[];
  /** 2–3 sentence summary of what was improved and why */
  enrichmentSummary: string;
}

// ─── Service result wrapper ───────────────────────────────────────────────────

export interface EnrichmentResult {
  /** Null when enrichment failed — caller must fall back to original brief */
  enrichment: BriefEnrichmentOutput | null;
  /** True when enrichment ran successfully */
  success: boolean;
  /** Human-readable reason when success=false */
  failReason?: string;
}
