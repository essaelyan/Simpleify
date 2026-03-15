import type { Platform } from "@/types/autoPosting";

// ─── Google Analytics 4 Types ─────────────────────────────────────────────────

export interface GATopPage {
  pagePath: string;
  pageTitle: string;
  sessions: number;
  conversions: number;
  conversionRate: number;            // percent, e.g. 7.02
  avgEngagementTimeSeconds: number;
}

export interface GATrafficSource {
  source: string;                    // e.g. "google", "instagram"
  medium: string;                    // e.g. "organic", "social"
  sessions: number;
  conversions: number;
  conversionRate: number;
}

export interface GAPerformanceData {
  propertyId: string;                // "MOCK" when no GA4_PROPERTY_ID env var
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  totalConversions: number;
  overallConversionRate: number;
  topPages: GATopPage[];             // top 5, sorted by sessions desc
  trafficSources: GATrafficSource[]; // top 5, sorted by sessions desc
  isMock: boolean;
}

// ─── Instagram Insights Types ─────────────────────────────────────────────────

export interface InstagramTopPost {
  id: string;
  caption: string;                   // first 200 chars
  mediaType: "IMAGE" | "CAROUSEL_ALBUM" | "VIDEO" | "REEL";
  timestamp: string;                 // ISO datetime
  likes: number;
  comments: number;
  reach: number;
  impressions: number;
  engagementRate: number;            // (likes + comments) / reach * 100
  saves: number;
}

export interface InstagramBestTime {
  dayOfWeek: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  hourUTC: number;                   // 0–23
  avgEngagementRate: number;
}

export interface InstagramInsightsData {
  accountId: string;                 // "MOCK" when no INSTAGRAM_ACCESS_TOKEN env var
  dateRange: { startDate: string; endDate: string };
  totalPosts: number;
  avgEngagementRate: number;
  avgReach: number;
  avgLikes: number;
  avgComments: number;
  topPosts: InstagramTopPost[];      // top 5, sorted by engagementRate desc
  bestTimes: InstagramBestTime[];    // top 3 best posting times
  topMediaType: "IMAGE" | "CAROUSEL_ALBUM" | "VIDEO" | "REEL";
  isMock: boolean;
}

// ─── Optimization Hints ───────────────────────────────────────────────────────

export interface HookPattern {
  pattern: string;                   // e.g. "Open with a bold claim or surprising statistic"
  example: string;                   // e.g. "Most marketers waste 80% of their budget..."
  avgEngagementRate: number;
}

export interface FormatRecommendation {
  format: "carousel" | "single_image" | "video" | "reel" | "long_caption" | "short_caption";
  platform: Platform;
  reasoning: string;
  confidence: "high" | "medium" | "low";
}

export interface PostingTimeRecommendation {
  platform: Platform;
  dayOfWeek: string;
  hourLocal: number;                 // 0–23
  reasoning: string;
}

export interface ContentOptimizationHints {
  topHooks: HookPattern[];                        // exactly 3
  bestFormats: FormatRecommendation[];            // one per platform (5 total)
  bestPostingTimes: PostingTimeRecommendation[];  // one per platform (5 total)
  toneInsight: string;
  audienceInsight: string;
  claudeSummary: string;                          // 2–3 sentences
  generatedAt: string;                            // ISO datetime
  sourceDataSummary: {
    gaAvailable: boolean;
    instagramAvailable: boolean;
    dateRange: string;                            // e.g. "last 30 days"
  };
}

// ─── API Request / Response Types ─────────────────────────────────────────────

export interface FetchGAInsightsRequest {
  dateRangeDays: number;
}

export interface FetchGAInsightsResponse {
  data: GAPerformanceData;
}

export interface FetchInstagramInsightsRequest {
  dateRangeDays: number;
}

export interface FetchInstagramInsightsResponse {
  data: InstagramInsightsData;
}

export interface OptimizeContentRequest {
  ga: GAPerformanceData;
  instagram: InstagramInsightsData;
}

export interface OptimizeContentResponse {
  hints: ContentOptimizationHints;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export type DataSourceStatus = "idle" | "loading" | "connected" | "error";
