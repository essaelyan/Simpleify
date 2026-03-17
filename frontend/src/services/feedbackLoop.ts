import type {
  GAPerformanceData,
  InstagramInsightsData,
  ContentOptimizationHints,
} from "@/types/feedbackLoop";
import { buildOptimizationPrompt } from "@/prompts/feedbackOptimization";

// Re-export so existing callers that import buildOptimizationPrompt from this
// module continue to work without changes.
export { buildOptimizationPrompt };

// ─── Response Parser ──────────────────────────────────────────────────────────

export function parseOptimizationResponse(
  raw: string,
  ga: GAPerformanceData,
  instagram: InstagramInsightsData
): ContentOptimizationHints {
  let parsed: {
    topHooks: ContentOptimizationHints["topHooks"];
    bestFormats: ContentOptimizationHints["bestFormats"];
    bestPostingTimes: ContentOptimizationHints["bestPostingTimes"];
    toneInsight: string;
    audienceInsight: string;
    claudeSummary: string;
  };

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Claude returned non-JSON output");
  }

  if (!Array.isArray(parsed.topHooks) || parsed.topHooks.length !== 3) {
    throw new Error(`Expected 3 topHooks, got ${parsed.topHooks?.length ?? 0}`);
  }
  if (!Array.isArray(parsed.bestFormats) || parsed.bestFormats.length !== 5) {
    throw new Error(`Expected 5 bestFormats, got ${parsed.bestFormats?.length ?? 0}`);
  }
  if (!Array.isArray(parsed.bestPostingTimes) || parsed.bestPostingTimes.length !== 5) {
    throw new Error(`Expected 5 bestPostingTimes, got ${parsed.bestPostingTimes?.length ?? 0}`);
  }

  const dateRangeLabel = `last ${Math.round(
    (new Date(ga.dateRange.endDate).getTime() - new Date(ga.dateRange.startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  )} days`;

  return {
    ...parsed,
    generatedAt: new Date().toISOString(),
    sourceDataSummary: {
      gaAvailable: !ga.isMock,
      instagramAvailable: !instagram.isMock,
      dateRange: dateRangeLabel,
    },
  };
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

export function getMockGAData(dateRangeDays: number): GAPerformanceData {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - dateRangeDays * 24 * 60 * 60 * 1000);

  return {
    propertyId: "MOCK",
    dateRange: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
    totalSessions: 12480,
    totalConversions: 634,
    overallConversionRate: 5.08,
    topPages: [
      {
        pagePath: "/blog/instagram-growth-2026",
        pageTitle: "How to Grow on Instagram in 2026",
        sessions: 3210,
        conversions: 198,
        conversionRate: 6.17,
        avgEngagementTimeSeconds: 187,
      },
      {
        pagePath: "/pricing",
        pageTitle: "Pricing — AI Marketing OS",
        sessions: 2840,
        conversions: 241,
        conversionRate: 8.49,
        avgEngagementTimeSeconds: 94,
      },
      {
        pagePath: "/blog/email-marketing-roi",
        pageTitle: "Email Marketing ROI: The 2026 Benchmark Report",
        sessions: 1980,
        conversions: 89,
        conversionRate: 4.49,
        avgEngagementTimeSeconds: 263,
      },
      {
        pagePath: "/features",
        pageTitle: "Features — AI Marketing OS",
        sessions: 1640,
        conversions: 67,
        conversionRate: 4.09,
        avgEngagementTimeSeconds: 121,
      },
      {
        pagePath: "/blog/content-calendar-template",
        pageTitle: "Free Content Calendar Template for 2026",
        sessions: 1320,
        conversions: 39,
        conversionRate: 2.95,
        avgEngagementTimeSeconds: 312,
      },
    ],
    trafficSources: [
      { source: "google", medium: "organic", sessions: 5840, conversions: 312, conversionRate: 5.34 },
      { source: "instagram", medium: "social", sessions: 2210, conversions: 143, conversionRate: 6.47 },
      { source: "direct", medium: "none", sessions: 1980, conversions: 97, conversionRate: 4.90 },
      { source: "linkedin", medium: "social", sessions: 1340, conversions: 62, conversionRate: 4.63 },
      { source: "email", medium: "email", sessions: 1110, conversions: 20, conversionRate: 1.80 },
    ],
    isMock: true,
  };
}

export function getMockInstagramData(dateRangeDays: number): InstagramInsightsData {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - dateRangeDays * 24 * 60 * 60 * 1000);

  return {
    accountId: "MOCK",
    dateRange: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
    totalPosts: 28,
    avgEngagementRate: 4.73,
    avgReach: 8420,
    avgLikes: 312,
    avgComments: 47,
    topPosts: [
      {
        id: "mock_001",
        caption:
          "Most marketers waste 80% of their content budget because they never look at this one metric. Here's exactly what to track instead (save this for later)...",
        mediaType: "CAROUSEL_ALBUM",
        timestamp: "2026-02-28T18:00:00Z",
        likes: 892,
        comments: 134,
        reach: 15640,
        impressions: 19200,
        engagementRate: 6.56,
        saves: 421,
      },
      {
        id: "mock_002",
        caption:
          "The algorithm changed again. Here's what's actually working right now for organic reach (tested across 47 accounts this month)...",
        mediaType: "CAROUSEL_ALBUM",
        timestamp: "2026-03-04T17:30:00Z",
        likes: 743,
        comments: 98,
        reach: 12800,
        impressions: 16100,
        engagementRate: 6.57,
        saves: 389,
      },
      {
        id: "mock_003",
        caption:
          "I grew from 0 to 10k followers in 90 days using this exact content framework. No paid ads. No going viral. Just this system...",
        mediaType: "REEL",
        timestamp: "2026-02-19T19:00:00Z",
        likes: 1240,
        comments: 187,
        reach: 28900,
        impressions: 35400,
        engagementRate: 4.95,
        saves: 567,
      },
      {
        id: "mock_004",
        caption:
          "Stop writing captions that start with 'I'. Start with the problem your audience is already thinking about right now...",
        mediaType: "IMAGE",
        timestamp: "2026-03-07T12:00:00Z",
        likes: 612,
        comments: 89,
        reach: 9800,
        impressions: 11600,
        engagementRate: 7.15,
        saves: 298,
      },
      {
        id: "mock_005",
        caption:
          "5 content ideas for this week (steal these): 1/ Share a result... 2/ Debunk a myth in your niche... 3/ Behind the scenes...",
        mediaType: "CAROUSEL_ALBUM",
        timestamp: "2026-02-24T16:00:00Z",
        likes: 534,
        comments: 72,
        reach: 8900,
        impressions: 10800,
        engagementRate: 6.81,
        saves: 312,
      },
    ],
    bestTimes: [
      { dayOfWeek: "Wednesday", hourUTC: 17, avgEngagementRate: 7.2 },
      { dayOfWeek: "Tuesday", hourUTC: 12, avgEngagementRate: 6.8 },
      { dayOfWeek: "Friday", hourUTC: 18, avgEngagementRate: 6.4 },
    ],
    topMediaType: "CAROUSEL_ALBUM",
    isMock: true,
  };
}
