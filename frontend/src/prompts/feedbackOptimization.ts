/**
 * feedbackOptimization.ts — Feedback loop optimization prompt.
 *
 * Analyzes Google Analytics + Instagram Insights data and extracts
 * actionable content creation insights (hook patterns, best formats,
 * posting times, tone/audience insights) for the pipeline feedback loop.
 *
 * Used by: services/feedbackLoop.ts
 */

import type {
  GAPerformanceData,
  InstagramInsightsData,
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
