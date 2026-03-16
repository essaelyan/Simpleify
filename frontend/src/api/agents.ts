/**
 * agents.ts — Typed client functions for standalone AI agent API routes.
 *
 * Each function is a thin axios wrapper over an existing /api/ai/* or
 * /api/* route. No business logic lives here — prompts and response
 * shaping remain in the API route files.
 *
 * All routes now return ApiResponse<T>. Each function unwraps `data` and
 * throws on error so component code never touches the envelope directly.
 *
 * Consumers:
 *   - CaptionVariantsPanel  → getCaptionVariants()
 *   - HashtagResearchPanel  → getHashtagResearch()
 *   - Repurpose page        → repurposeContent()
 *   - Analytics page        → getAnalyticsInsights()
 *   - GrowthStrategy page   → getGrowthStrategy()
 */

import axios from "axios";
import type { Platform } from "@/types/autoPosting";
import type { ApiResponse } from "@/types/api";

// ─── Caption Variants ─────────────────────────────────────────────────────────

export interface CaptionVariantScores {
  engagementPotential: number;
  clarity: number;
  ctaStrength: number;
  overall: number;
}

export interface CaptionVariant {
  caption: string;
  hashtags: string[];
  hook: string;
  angle: string;
  scores: CaptionVariantScores;
  reasoning: string;
}

export interface CaptionVariantsResult {
  variants: CaptionVariant[];
  recommendation: string;
}

export async function getCaptionVariants(
  platform: Platform,
  originalCaption: string,
  hashtags: string[],
  brief: { topic: string; tone: string; targetAudience: string; callToAction: string }
): Promise<CaptionVariantsResult> {
  const { data } = await axios.post<ApiResponse<CaptionVariantsResult>>(
    "/api/ai/caption-variants",
    { platform, originalCaption, hashtags, brief }
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Variant generation failed");
  }
  return data.data;
}

// ─── Hashtag Research ─────────────────────────────────────────────────────────

export interface HashtagEntry {
  tag: string;
  volumeTier: "niche" | "medium" | "broad";
  relevanceReason: string;
}

export interface PlatformHashtagSet {
  platform: Platform;
  recommended: HashtagEntry[];
  strategy: string;
  avoidList: string[];
}

export interface HashtagResearchResult {
  platformHashtags: PlatformHashtagSet[];
  crossPlatformCore: string[];
  strategyNotes: string;
}

export async function getHashtagResearch(params: {
  topic: string;
  niche: string;
  targetAudience: string;
  targetPlatforms?: Platform[];
  excludeHashtags?: string[];
}): Promise<HashtagResearchResult> {
  const { data } = await axios.post<ApiResponse<HashtagResearchResult>>(
    "/api/ai/hashtag-research",
    params
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Hashtag research failed");
  }
  return data.data;
}

// ─── Content Repurposing ──────────────────────────────────────────────────────

export type SourceType = "blog" | "youtube_transcript" | "podcast" | "article" | "other";

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  blog: "Blog Post",
  youtube_transcript: "YouTube Transcript",
  podcast: "Podcast Episode",
  article: "Article",
  other: "Other Content",
};

export interface RepurposedPost {
  platform: Platform;
  caption: string;
  hashtags: string[];
  contentAngle: string;
  keyTakeaway: string;
}

export interface RepurposeResult {
  posts: RepurposedPost[];
  extractedHooks: string[];
  repurposingNotes: string;
}

export async function repurposeContent(params: {
  sourceContent: string;
  sourceType: SourceType;
  targetAudience: string;
  callToAction: string;
  sourceTitle?: string;
  targetPlatforms?: Platform[];
}): Promise<RepurposeResult> {
  const { data } = await axios.post<ApiResponse<RepurposeResult>>(
    "/api/ai/repurpose-content",
    params
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Repurposing failed");
  }
  return data.data;
}

// ─── Analytics Insights ───────────────────────────────────────────────────────

export interface AnalyticsInsights {
  bestTrafficSource: { source: string; reasoning: string };
  highestConvertingAudience: { segment: string; reasoning: string };
  topPerformingContent: { title: string; reasoning: string };
  quickWins: string[];
  summary: string;
}

export async function getAnalyticsInsights(analyticsData: object): Promise<AnalyticsInsights> {
  const { data } = await axios.post<ApiResponse<AnalyticsInsights>>(
    "/api/analytics-insights",
    { analyticsData }
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Analytics analysis failed");
  }
  return data.data;
}

// ─── Growth Strategy ──────────────────────────────────────────────────────────

export interface GrowthStrategyTactic {
  headline: string;
  tactics: string[];
}

export interface GrowthExperiment {
  name: string;
  hypothesis: string;
  successMetric: string;
}

export interface GrowthStrategy {
  contentStrategy: GrowthStrategyTactic;
  paidStrategy: GrowthStrategyTactic;
  audienceExpansion: GrowthStrategyTactic;
  experiments: GrowthExperiment[];
  priorityOrder: string[];
  executiveSummary: string;
}

export interface GrowthStrategyInsightsInput {
  bestTrafficSource?: string;
  topConvertingAudience?: string;
  topContent?: string;
  currentMonthlyBudget?: number;
  currentMonthlyRevenue?: number;
  goals?: string[];
}

export async function getGrowthStrategy(insights: GrowthStrategyInsightsInput): Promise<GrowthStrategy> {
  const { data } = await axios.post<ApiResponse<GrowthStrategy>>(
    "/api/growth-strategy",
    { insights }
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Strategy generation failed");
  }
  return data.data;
}
