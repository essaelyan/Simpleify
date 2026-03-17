/**
 * growthStrategy.ts — Growth strategy agent prompt.
 *
 * Accepts business insights and returns a structured growth strategy
 * with content, paid, audience, and experiment recommendations.
 *
 * Used by: pages/api/growth-strategy.ts
 */

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildGrowthStrategyPrompt(
  insights: Record<string, unknown>
): string {
  return `You are a growth marketing strategist. Using the following business insights, build a practical growth strategy.

INSIGHTS:
${JSON.stringify(insights, null, 2)}

Return ONLY valid JSON with no markdown fences, exactly this shape:
{
  "contentStrategy": {
    "headline": "<one sentence describing the content approach>",
    "tactics": [
      "<specific content tactic 1>",
      "<specific content tactic 2>",
      "<specific content tactic 3>"
    ]
  },
  "paidStrategy": {
    "headline": "<one sentence describing the paid media approach>",
    "tactics": [
      "<paid tactic 1>",
      "<paid tactic 2>",
      "<paid tactic 3>"
    ]
  },
  "audienceExpansion": {
    "headline": "<one sentence describing audience expansion approach>",
    "tactics": [
      "<audience tactic 1>",
      "<audience tactic 2>",
      "<audience tactic 3>"
    ]
  },
  "experiments": [
    {
      "name": "<experiment name>",
      "hypothesis": "<if we do X, we expect Y because Z>",
      "successMetric": "<specific, measurable metric>"
    },
    {
      "name": "<experiment name>",
      "hypothesis": "<hypothesis>",
      "successMetric": "<metric>"
    }
  ],
  "priorityOrder": [
    "<highest ROI action first>",
    "<second priority>",
    "<third priority>"
  ],
  "executiveSummary": "<2–3 sentences summarizing the overall growth strategy and expected impact>"
}

Rules:
- All tactics must be specific and immediately actionable, not generic
- Experiments must be testable within 30 days
- If budget data is present, size recommendations accordingly
- priorityOrder should reflect expected ROI and ease of execution`;
}
