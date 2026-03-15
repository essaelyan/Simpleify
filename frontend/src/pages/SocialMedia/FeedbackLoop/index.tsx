import { useState } from "react";
import type {
  GAPerformanceData,
  InstagramInsightsData,
  DataSourceStatus,
} from "@/types/feedbackLoop";
import {
  fetchGAInsights,
  fetchInstagramInsights,
  optimizeContent,
} from "@/api/feedbackLoop";
import { useOptimizationStore } from "@/store/optimizationStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusPill({ status }: { status: DataSourceStatus }) {
  const styles: Record<DataSourceStatus, string> = {
    idle: "bg-gray-800 text-gray-500",
    loading: "bg-indigo-900/40 text-indigo-400",
    connected: "bg-emerald-900/40 text-emerald-400",
    error: "bg-red-900/40 text-red-400",
  };
  const labels: Record<DataSourceStatus, string> = {
    idle: "Not connected",
    loading: "Fetching…",
    connected: "Connected",
    error: "Error",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}
    >
      {status === "loading" && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {status === "connected" && <span>✓</span>}
      {labels[status]}
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

const CONFIDENCE_BADGE: Record<"high" | "medium" | "low", string> = {
  high: "bg-emerald-900/40 text-emerald-400 border border-emerald-800/50",
  medium: "bg-yellow-900/40 text-yellow-400 border border-yellow-800/50",
  low: "bg-gray-800 text-gray-500 border border-gray-700",
};

const PLATFORM_ICON: Record<string, string> = {
  instagram: "📸",
  facebook: "📘",
  linkedin: "💼",
  twitter: "𝕏",
  tiktok: "🎵",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FeedbackLoopPage() {
  const [dateRangeDays, setDateRangeDays] = useState<number>(30);
  const [gaStatus, setGaStatus] = useState<DataSourceStatus>("idle");
  const [instagramStatus, setInstagramStatus] = useState<DataSourceStatus>("idle");
  const [gaData, setGaData] = useState<GAPerformanceData | null>(null);
  const [instagramData, setInstagramData] = useState<InstagramInsightsData | null>(null);
  const [gaError, setGaError] = useState<string | null>(null);
  const [instagramError, setInstagramError] = useState<string | null>(null);
  const [optimizeStatus, setOptimizeStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<"hooks" | "formats" | "times" | null>("hooks");

  const { hints, lastFetchedAt, isEnabled, setHints, clearHints, toggleEnabled } =
    useOptimizationStore();

  async function handleFetchGA() {
    setGaStatus("loading");
    setGaError(null);
    try {
      const result = await fetchGAInsights({ dateRangeDays });
      setGaData(result.data);
      setGaStatus("connected");
    } catch (err) {
      setGaError(err instanceof Error ? err.message : "Failed to fetch GA data");
      setGaStatus("error");
    }
  }

  async function handleFetchInstagram() {
    setInstagramStatus("loading");
    setInstagramError(null);
    try {
      const result = await fetchInstagramInsights({ dateRangeDays });
      setInstagramData(result.data);
      setInstagramStatus("connected");
    } catch (err) {
      setInstagramError(err instanceof Error ? err.message : "Failed to fetch Instagram data");
      setInstagramStatus("error");
    }
  }

  async function handleOptimize() {
    if (!gaData || !instagramData) return;
    setOptimizeStatus("loading");
    setOptimizeError(null);
    try {
      const result = await optimizeContent({ ga: gaData, instagram: instagramData });
      setHints(result.hints);
      setOptimizeStatus("done");
      setExpandedSection("hooks");
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : "Optimization failed");
      setOptimizeStatus("error");
    }
  }

  function toggleSection(section: "hooks" | "formats" | "times") {
    setExpandedSection((prev) => (prev === section ? null : section));
  }

  const canOptimize = !!gaData && !!instagramData && optimizeStatus !== "loading";

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10">
        {/* Header */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-pink-400 mb-1">
            AI Social Media Manager
          </p>
          <h1 className="text-3xl font-bold text-gray-100 mb-2">
            Performance Feedback Loop
          </h1>
          <p className="text-sm text-gray-400 max-w-2xl">
            Connect your analytics to automatically learn from what's working. Insights are
            injected into every future content generation — so each post improves on the last.
          </p>
        </div>

        {/* Section 1 — Data Sources */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-200">Data Sources</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Date range:</label>
              <select
                value={dateRangeDays}
                onChange={(e) => setDateRangeDays(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1 text-xs text-gray-300 focus:outline-none focus:border-indigo-500"
              >
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* GA4 Card */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📊</span>
                  <span className="text-sm font-semibold text-blue-400">Google Analytics 4</span>
                </div>
                <div className="flex items-center gap-2">
                  {gaData?.isMock && (
                    <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-full">
                      Mock Data
                    </span>
                  )}
                  <StatusPill status={gaStatus} />
                </div>
              </div>
              {gaStatus === "connected" && gaData && (
                <div className="text-xs text-gray-500">
                  {gaData.dateRange.startDate} → {gaData.dateRange.endDate}
                </div>
              )}
              {gaError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-2 py-1.5">
                  {gaError}
                </p>
              )}
              <button
                onClick={handleFetchGA}
                disabled={gaStatus === "loading"}
                className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-gray-700"
              >
                {gaStatus === "loading" ? "Fetching…" : gaStatus === "connected" ? "Refresh Data" : "Fetch GA4 Data"}
              </button>
            </div>

            {/* Instagram Card */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📸</span>
                  <span className="text-sm font-semibold text-pink-400">Instagram Insights</span>
                </div>
                <div className="flex items-center gap-2">
                  {instagramData?.isMock && (
                    <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-800/50 px-2 py-0.5 rounded-full">
                      Mock Data
                    </span>
                  )}
                  <StatusPill status={instagramStatus} />
                </div>
              </div>
              {instagramStatus === "connected" && instagramData && (
                <div className="text-xs text-gray-500">
                  {instagramData.dateRange.startDate} → {instagramData.dateRange.endDate}
                </div>
              )}
              {instagramError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-2 py-1.5">
                  {instagramError}
                </p>
              )}
              <button
                onClick={handleFetchInstagram}
                disabled={instagramStatus === "loading"}
                className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors border border-gray-700"
              >
                {instagramStatus === "loading"
                  ? "Fetching…"
                  : instagramStatus === "connected"
                  ? "Refresh Data"
                  : "Fetch Instagram Data"}
              </button>
            </div>
          </div>
        </section>

        {/* Section 2 — Performance Summary */}
        {(gaData || instagramData) && (
          <section>
            <h2 className="text-base font-semibold text-gray-200 mb-4">Performance Summary</h2>
            <div className="space-y-4">
              {gaData && (
                <div>
                  <p className="text-xs font-medium text-blue-400 mb-2 uppercase tracking-wide">
                    Google Analytics
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard
                      label="Total Sessions"
                      value={gaData.totalSessions.toLocaleString()}
                      sub={`${gaData.dateRange.startDate} – ${gaData.dateRange.endDate}`}
                    />
                    <MetricCard
                      label="Total Conversions"
                      value={gaData.totalConversions.toLocaleString()}
                    />
                    <MetricCard
                      label="Conversion Rate"
                      value={`${gaData.overallConversionRate.toFixed(2)}%`}
                    />
                    <MetricCard
                      label="Top Source"
                      value={gaData.trafficSources[0]?.source ?? "—"}
                      sub={`${gaData.trafficSources[0]?.sessions.toLocaleString()} sessions`}
                    />
                  </div>
                </div>
              )}
              {instagramData && (
                <div>
                  <p className="text-xs font-medium text-pink-400 mb-2 uppercase tracking-wide">
                    Instagram
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard
                      label="Avg Engagement"
                      value={`${instagramData.avgEngagementRate.toFixed(2)}%`}
                      sub={`${instagramData.totalPosts} posts analysed`}
                    />
                    <MetricCard
                      label="Avg Reach"
                      value={instagramData.avgReach.toLocaleString()}
                    />
                    <MetricCard
                      label="Top Format"
                      value={instagramData.topMediaType.replace(/_/g, " ")}
                    />
                    <MetricCard
                      label="Best Day"
                      value={instagramData.bestTimes[0]?.dayOfWeek ?? "—"}
                      sub={`${instagramData.bestTimes[0]?.avgEngagementRate.toFixed(1)}% engagement`}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Section 3 — AI Optimization Insights */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-200">AI Optimization Insights</h2>
            {hints && lastFetchedAt && (
              <span className="text-xs text-gray-600">
                Updated {formatRelativeTime(lastFetchedAt)}
              </span>
            )}
          </div>

          {/* Analyze button */}
          <div className="mb-5">
            <button
              onClick={handleOptimize}
              disabled={!canOptimize}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm flex items-center gap-2"
            >
              {optimizeStatus === "loading" && (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {optimizeStatus === "loading"
                ? "Analyzing with Claude…"
                : hints
                ? "Re-analyze & Refresh Insights"
                : "Analyze & Generate Insights"}
            </button>
            {!canOptimize && optimizeStatus !== "loading" && (
              <p className="text-xs text-gray-600 mt-1.5">
                Fetch both GA4 and Instagram data first to run the analysis.
              </p>
            )}
            {optimizeError && (
              <p className="text-xs text-red-400 mt-1.5 bg-red-950/40 border border-red-800/40 rounded px-2 py-1.5">
                {optimizeError}
              </p>
            )}
          </div>

          {/* Accordion sections */}
          {hints && (
            <div className="space-y-3">
              {/* Top Hook Patterns */}
              <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSection("hooks")}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/40 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-200">
                    Top Hook Patterns
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      ({hints.topHooks.length} patterns)
                    </span>
                  </span>
                  <span className="text-gray-600 text-sm">
                    {expandedSection === "hooks" ? "▲" : "▼"}
                  </span>
                </button>
                {expandedSection === "hooks" && (
                  <div className="px-5 pb-5 space-y-3 border-t border-gray-800">
                    {hints.topHooks.map((hook, i) => (
                      <div key={i} className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="text-sm font-medium text-gray-200">{hook.pattern}</p>
                          <span className="shrink-0 text-xs bg-indigo-900/50 text-indigo-400 border border-indigo-800/50 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {hook.avgEngagementRate.toFixed(1)}% engagement
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 italic leading-relaxed mb-2">
                          "{hook.example}"
                        </p>
                        <div className="w-full bg-gray-700 rounded-full h-1.5">
                          <div
                            className="bg-indigo-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(hook.avgEngagementRate * 10, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Best Content Formats */}
              <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSection("formats")}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/40 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-200">
                    Best Content Formats
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      (per platform)
                    </span>
                  </span>
                  <span className="text-gray-600 text-sm">
                    {expandedSection === "formats" ? "▲" : "▼"}
                  </span>
                </button>
                {expandedSection === "formats" && (
                  <div className="px-5 pb-5 space-y-2 border-t border-gray-800">
                    {hints.bestFormats.map((fmt, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 bg-gray-800/50 rounded-lg px-4 py-3"
                      >
                        <span className="text-base shrink-0 mt-0.5">
                          {PLATFORM_ICON[fmt.platform] ?? "📱"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-gray-300 capitalize">
                              {fmt.platform}
                            </span>
                            <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                              {fmt.format.replace(/_/g, " ")}
                            </span>
                            <span
                              className={`text-xs font-medium px-1.5 py-0.5 rounded ${CONFIDENCE_BADGE[fmt.confidence]}`}
                            >
                              {fmt.confidence}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{fmt.reasoning}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Best Posting Times */}
              <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleSection("times")}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/40 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-200">
                    Best Posting Times
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      (per platform)
                    </span>
                  </span>
                  <span className="text-gray-600 text-sm">
                    {expandedSection === "times" ? "▲" : "▼"}
                  </span>
                </button>
                {expandedSection === "times" && (
                  <div className="px-5 pb-5 space-y-2 border-t border-gray-800">
                    {hints.bestPostingTimes.map((pt, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 bg-gray-800/50 rounded-lg px-4 py-3"
                      >
                        <span className="text-base shrink-0 mt-0.5">
                          {PLATFORM_ICON[pt.platform] ?? "📱"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-gray-300 capitalize">
                              {pt.platform}
                            </span>
                            <span className="text-xs bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded">
                              {pt.dayOfWeek}
                            </span>
                            <span className="text-xs bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded">
                              {pt.hourLocal}:00
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 leading-relaxed">{pt.reasoning}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Claude Summary */}
              <div className="bg-indigo-950/30 border border-indigo-800/40 rounded-xl px-5 py-4">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">
                  AI Summary
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">{hints.claudeSummary}</p>
                <div className="mt-3 flex gap-4 text-xs text-gray-600">
                  <span>Tone: {hints.toneInsight}</span>
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  Audience: {hints.audienceInsight}
                </div>
              </div>
            </div>
          )}

          {optimizeStatus === "idle" && !hints && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-8 text-center">
              <p className="text-sm text-gray-600">
                Fetch your analytics data above, then click{" "}
                <span className="text-gray-400">"Analyze & Generate Insights"</span> to let
                Claude extract optimization recommendations.
              </p>
            </div>
          )}
        </section>

        {/* Section 4 — Generation Status */}
        <section>
          <h2 className="text-base font-semibold text-gray-200 mb-4">Generation Status</h2>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
            {/* Toggle row */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-200">Apply insights to new content</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Injects performance data into Claude's generation prompt automatically
                </p>
              </div>
              <button
                onClick={toggleEnabled}
                disabled={!hints}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  isEnabled && hints ? "bg-indigo-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isEnabled && hints ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Status line */}
            <div className="border-t border-gray-800 pt-3">
              {isEnabled && hints ? (
                <p className="text-xs text-indigo-400">
                  ✓ Active — performance insights will be injected into your next content generation
                </p>
              ) : !hints ? (
                <p className="text-xs text-gray-600">
                  No insights loaded — fetch data and run analysis first
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Disabled — content generation uses default behavior
                </p>
              )}

              {hints && lastFetchedAt && (
                <p className="text-xs text-gray-600 mt-1">
                  Last updated: {formatRelativeTime(lastFetchedAt)}
                  {hints.sourceDataSummary.gaAvailable
                    ? " · GA4 connected"
                    : " · GA4 mock data"}
                  {hints.sourceDataSummary.instagramAvailable
                    ? " · Instagram connected"
                    : " · Instagram mock data"}
                </p>
              )}
            </div>

            {/* Clear button */}
            {hints && (
              <div className="border-t border-gray-800 pt-3">
                <button
                  onClick={clearHints}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Clear insights
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
