/**
 * prompts/index.ts — Barrel re-export for the Prompt System Library.
 *
 * Import from "@/prompts" to access any prompt builder or utility.
 *
 * Module map:
 *   builder             — PromptContext, buildPrompt, injectBrandVoice,
 *                         injectOptimizationHints, injectEnrichment
 *   contentGeneration   — buildContentPrompt
 *   briefEnrichment     — buildEnrichmentPrompt
 *   contentQA           — buildQAPrompt
 *   safetyModeration    — buildSafetyCheckPrompt
 *   analyticsInsights   — buildAnalyticsInsightsPrompt
 *   growthStrategy      — buildGrowthStrategyPrompt
 *   feedbackOptimization— buildOptimizationPrompt
 */

export * from "./builder";
export * from "./contentGeneration";
export * from "./briefEnrichment";
export * from "./contentQA";
export * from "./safetyModeration";
export * from "./analyticsInsights";
export * from "./growthStrategy";
export * from "./feedbackOptimization";
