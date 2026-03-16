/**
 * Analytics Insights page
 *
 * Previously broken: treated the /api/analytics-insights response as
 * ContentBlock[] and tried to map over it, rendering nothing.
 *
 * Fixed: uses the typed AnalyticsInsights shape from src/api/agents.ts
 * and renders each insight section as a structured card.
 *
 * Added: "Build Growth Strategy" CTA — prefills /GrowthStrategy with the
 * best traffic source, top audience, and top content from the insights.
 */

import { useState } from "react";
import Link from "next/link";
import { getAnalyticsInsights, type AnalyticsInsights } from "@/api/agents";

const SAMPLE_DATA = {
  traffic: [
    { source: "google", sessions: 4200, conversions: 310 },
    { source: "instagram", sessions: 2800, conversions: 190 },
    { source: "email", sessions: 1500, conversions: 210 },
    { source: "direct", sessions: 900, conversions: 85 },
  ],
  audience: [
    { segment: "25-34 female", sessions: 2100, conversions: 280 },
    { segment: "18-24 male", sessions: 1800, conversions: 95 },
    { segment: "35-44 female", sessions: 1400, conversions: 175 },
  ],
  content: [
    { title: "Summer Sale Carousel", clicks: 3200, conversions: 240 },
    { title: "Behind the Scenes Reel", clicks: 5100, conversions: 180 },
    { title: "Product Launch Story", clicks: 2600, conversions: 310 },
  ],
};

export default function AnalyticsPage() {
  const [input, setInput] = useState(JSON.stringify(SAMPLE_DATA, null, 2));
  const [insights, setInsights] = useState<AnalyticsInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setInsights(null);
    try {
      const parsed = JSON.parse(input);
      const result = await getAnalyticsInsights(parsed);
      setInsights(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Build query string for Growth Strategy pre-fill
  const strategyHref = insights
    ? `/GrowthStrategy?bestTrafficSource=${encodeURIComponent(
        insights.bestTrafficSource.source
      )}&topAudience=${encodeURIComponent(
        insights.highestConvertingAudience.segment
      )}&topContent=${encodeURIComponent(insights.topPerformingContent.title)}`
    : "/GrowthStrategy";

  return (
    <div className="p-8 text-gray-100">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Analytics Insights</h1>
        <p className="text-gray-400 mb-8">
          Paste your traffic and conversion data below, then let AI surface what&apos;s working.
        </p>

        {/* Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Analytics Data (JSON)
          </label>
          <textarea
            className="w-full h-64 bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm font-mono text-gray-100 focus:outline-none focus:border-indigo-500 resize-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg transition-colors"
        >
          {loading ? "Analyzing…" : "Get AI Insights"}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-6 bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {/* ── Structured Results ── */}
        {insights && (
          <div className="mt-8 space-y-6">
            <h2 className="text-xl font-semibold">AI Insights</h2>

            {/* Three insight cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <InsightCard
                icon="📈"
                label="Best Traffic Source"
                value={insights.bestTrafficSource.source}
                reasoning={insights.bestTrafficSource.reasoning}
              />
              <InsightCard
                icon="🎯"
                label="Top Converting Audience"
                value={insights.highestConvertingAudience.segment}
                reasoning={insights.highestConvertingAudience.reasoning}
              />
              <InsightCard
                icon="🏆"
                label="Top Performing Content"
                value={insights.topPerformingContent.title}
                reasoning={insights.topPerformingContent.reasoning}
              />
            </div>

            {/* Quick wins */}
            {insights.quickWins.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                <p className="text-sm font-semibold text-indigo-400 mb-3">Quick Wins</p>
                <ol className="space-y-2">
                  {insights.quickWins.map((win, i) => (
                    <li key={i} className="flex gap-3 text-sm text-gray-300">
                      <span className="text-indigo-500 font-semibold shrink-0">{i + 1}.</span>
                      <span className="leading-relaxed">{win}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Summary */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <p className="text-sm font-semibold text-gray-400 mb-2">Summary</p>
              <p className="text-sm text-gray-300 leading-relaxed">{insights.summary}</p>
            </div>

            {/* CTA to Growth Strategy */}
            <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-800/40 rounded-xl px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-indigo-300">
                  Ready to act on these insights?
                </p>
                <p className="text-xs text-indigo-400/70 mt-0.5">
                  Generate a full growth strategy pre-filled with your top data points.
                </p>
              </div>
              <Link
                href={strategyHref}
                className="shrink-0 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-lg transition-colors ml-4"
              >
                Build Strategy →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InsightCard({
  icon,
  label,
  value,
  reasoning,
}: {
  icon: string;
  label: string;
  value: string;
  reasoning: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 leading-relaxed">{reasoning}</p>
    </div>
  );
}
