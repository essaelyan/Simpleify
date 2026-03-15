import type {
  GAPerformanceData,
  InstagramInsightsData,
  ContentOptimizationHints,
} from "@/types/feedbackLoop";

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildOptimizationPrompt(
  ga: GAPerformanceData,
  instagram: InstagramInsightsData
): string {
  const topPagesText = ga.topPages
    .map(
      (p, i) =>
        `${i + 1}. "${p.pageTitle}" (${p.pagePath}) — ${p.sessions.toLocaleString()} sessions, ${p.conversionRate.toFixed(1)}% CVR, ${p.avgEngagementTimeSeconds}s avg engagement`
    )
    .join("\n");

  const trafficSourcesText = ga.trafficSources
    .map(
      (s, i) =>
        `${i + 1}. ${s.source}/${s.medium} — ${s.sessions.toLocaleString()} sessions, ${s.conversionRate.toFixed(1)}% CVR`
    )
    .join("\n");

  const topPostsText = instagram.topPosts
    .map(
      (p, i) =>
        `${i + 1}. [${p.mediaType}] "${p.caption.slice(0, 120)}..." — ${p.engagementRate.toFixed(2)}% engagement, ${p.likes} likes, ${p.comments} comments, ${p.saves} saves`
    )
    .join("\n");

  const bestTimesText = instagram.bestTimes
    .map(
      (t, i) =>
        `${i + 1}. ${t.dayOfWeek} at ${t.hourUTC}:00 UTC — ${t.avgEngagementRate.toFixed(2)}% avg engagement`
    )
    .join("\n");

  return `You are a social media content optimization strategist with expertise in data-driven marketing.

Analyze the following performance data from two sources and extract actionable content creation insights.

═══ GOOGLE ANALYTICS DATA ═══
Property: ${ga.propertyId}
Date Range: ${ga.dateRange.startDate} → ${ga.dateRange.endDate}
Total Sessions: ${ga.totalSessions.toLocaleString()}
Total Conversions: ${ga.totalConversions.toLocaleString()}
Overall Conversion Rate: ${ga.overallConversionRate.toFixed(2)}%

Top Performing Pages:
${topPagesText}

Top Traffic Sources:
${trafficSourcesText}

═══ INSTAGRAM INSIGHTS DATA ═══
Account: ${instagram.accountId}
Date Range: ${instagram.dateRange.startDate} → ${instagram.dateRange.endDate}
Total Posts: ${instagram.totalPosts}
Avg Engagement Rate: ${instagram.avgEngagementRate.toFixed(2)}%
Avg Reach: ${instagram.avgReach.toLocaleString()}
Top Format: ${instagram.topMediaType}

Top 5 Posts by Engagement:
${topPostsText}

Best Posting Times:
${bestTimesText}

═══ YOUR TASK ═══
1. Extract exactly 3 hook patterns from the top Instagram captions. A hook is the opening line structure/pattern that drives engagement — not a copy of the caption, but an abstracted pattern.
2. Identify the best content format for each of the 5 platforms: instagram, facebook, linkedin, twitter, tiktok.
3. Recommend the single best posting time for each of the 5 platforms: instagram, facebook, linkedin, twitter, tiktok.
4. Synthesize one tone insight and one audience insight from the combined data.
5. Write a 2–3 sentence plain-English summary of the top optimization opportunity.

Respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "topHooks": [
    {
      "pattern": "Open with a bold claim or surprising statistic",
      "example": "Most marketers waste 80% of their budget because they never track this one metric.",
      "avgEngagementRate": 6.5
    }
  ],
  "bestFormats": [
    {
      "format": "carousel",
      "platform": "instagram",
      "reasoning": "Carousel posts drive 3x more saves in your top performing content",
      "confidence": "high"
    }
  ],
  "bestPostingTimes": [
    {
      "platform": "instagram",
      "dayOfWeek": "Wednesday",
      "hourLocal": 18,
      "reasoning": "Wednesday 18:00 shows highest engagement rate across your top posts"
    }
  ],
  "toneInsight": "Educational tone with data-backed claims drives highest engagement for your audience",
  "audienceInsight": "25–34 age group from organic search converts at 2.3x the overall site average",
  "claudeSummary": "Your audience responds strongly to educational carousels posted mid-week. Organic search drives your highest-quality traffic — create content that mirrors your top-performing blog topics on social media to create a compounding traffic loop."
}

Rules:
- topHooks must contain EXACTLY 3 entries, derived from actual patterns in the provided Instagram captions
- bestFormats must contain EXACTLY 5 entries, one per platform: instagram, facebook, linkedin, twitter, tiktok
- bestPostingTimes must contain EXACTLY 5 entries, one per platform: instagram, facebook, linkedin, twitter, tiktok
- format values must be one of: carousel, single_image, video, reel, long_caption, short_caption
- confidence must be one of: high, medium, low
- avgEngagementRate in topHooks must be a number (percent, not decimal)
- claudeSummary must be 2–3 sentences maximum
- Base ALL recommendations on the actual data provided — no generic advice`;
}

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
