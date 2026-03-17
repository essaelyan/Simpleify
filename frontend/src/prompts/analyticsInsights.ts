/**
 * analyticsInsights.ts — Analytics insights agent prompt.
 *
 * Accepts flexible user-supplied analytics data (any shape) and returns
 * structured, human-readable insights for the analytics dashboard.
 *
 * Used by: pages/api/analytics-insights.ts
 */

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildAnalyticsInsightsPrompt(
  analyticsData: Record<string, unknown>
): string {
  return `You are a senior marketing data analyst. Analyze the following analytics data and return structured, actionable insights.

DATA:
${JSON.stringify(analyticsData, null, 2)}

Return ONLY valid JSON with no markdown fences, exactly this shape:
{
  "bestTrafficSource": {
    "source": "<source name>",
    "reasoning": "<1–2 sentences on why this source is best>"
  },
  "highestConvertingAudience": {
    "segment": "<segment name>",
    "reasoning": "<1–2 sentences on why this segment converts best>"
  },
  "topPerformingContent": {
    "title": "<content title>",
    "reasoning": "<1–2 sentences on what makes it top performing>"
  },
  "quickWins": [
    "<actionable tactic 1 based on the data>",
    "<actionable tactic 2>",
    "<actionable tactic 3>"
  ],
  "summary": "<2–3 sentence plain-English summary of the single biggest optimization opportunity>"
}

Rules:
- Every recommendation must be grounded in the provided data
- quickWins must be specific and actionable, not generic
- If a data category is missing, skip it gracefully rather than inventing numbers`;
}
