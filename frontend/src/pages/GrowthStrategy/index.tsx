/**
 * Growth Strategy page
 *
 * Previously broken: treated the /api/growth-strategy response as
 * ContentBlock[] and rendered nothing.
 *
 * Fixed: uses the typed GrowthStrategy shape from src/api/agents.ts.
 * Renders structured sections: content strategy, paid strategy, audience
 * expansion, experiments, priority order, and executive summary.
 *
 * Added: URL query-param pre-fill so Analytics page can link here with
 * bestTrafficSource, topAudience, and topContent already populated.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  getGrowthStrategy,
  type GrowthStrategy,
  type GrowthStrategyInsightsInput,
} from "@/api/agents";

const SAMPLE_INSIGHTS: GrowthStrategyInsightsInput = {
  bestTrafficSource: "email — highest conversion rate at 14%",
  topConvertingAudience: "25-34 female, 280 conversions",
  topContent: "Product Launch Story — 310 conversions",
};

export default function GrowthStrategyPage() {
  const router = useRouter();
  const [insights, setInsights] = useState<GrowthStrategyInsightsInput>(SAMPLE_INSIGHTS);
  const [strategy, setStrategy] = useState<GrowthStrategy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from Analytics page query params
  useEffect(() => {
    const { bestTrafficSource, topAudience, topContent } = router.query;
    if (bestTrafficSource || topAudience || topContent) {
      setInsights((prev) => ({
        ...prev,
        bestTrafficSource: typeof bestTrafficSource === "string" ? bestTrafficSource : prev.bestTrafficSource,
        topConvertingAudience: typeof topAudience === "string" ? topAudience : prev.topConvertingAudience,
        topContent: typeof topContent === "string" ? topContent : prev.topContent,
      }));
    }
  }, [router.query]);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setStrategy(null);
    try {
      const result = await getGrowthStrategy(insights);
      setStrategy(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(key: keyof GrowthStrategyInsightsInput, value: string | number | undefined) {
    setInsights((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-8 text-gray-100">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Growth Strategy</h1>
        <p className="text-gray-400 mb-8">
          Fill in your marketing insights and get a structured growth playbook built around your
          actual data.
        </p>

        {/* ── Input form ── */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              label="Best Traffic Source"
              value={insights.bestTrafficSource ?? ""}
              onChange={(v) => updateField("bestTrafficSource", v || undefined)}
              placeholder="e.g. email at 14% conversion"
            />
            <InputField
              label="Top Converting Audience"
              value={insights.topConvertingAudience ?? ""}
              onChange={(v) => updateField("topConvertingAudience", v || undefined)}
              placeholder="e.g. 25-34 female, 280 conversions"
            />
            <InputField
              label="Top Performing Content"
              value={insights.topContent ?? ""}
              onChange={(v) => updateField("topContent", v || undefined)}
              placeholder="e.g. Product Launch Story"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Monthly Budget ($)
                </label>
                <input
                  type="number"
                  value={insights.currentMonthlyBudget ?? ""}
                  onChange={(e) =>
                    updateField(
                      "currentMonthlyBudget",
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  placeholder="5000"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">
                  Monthly Revenue ($)
                </label>
                <input
                  type="number"
                  value={insights.currentMonthlyRevenue ?? ""}
                  onChange={(e) =>
                    updateField(
                      "currentMonthlyRevenue",
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                  placeholder="25000"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Generating Strategy…" : "Get Growth Strategy"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {/* ── Structured Results ── */}
        {strategy && (
          <div className="space-y-5">
            <h2 className="text-xl font-semibold">Growth Playbook</h2>

            {/* Executive summary */}
            <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-5">
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">
                Executive Summary
              </p>
              <p className="text-sm text-gray-200 leading-relaxed">
                {strategy.executiveSummary}
              </p>
            </div>

            {/* Priority order */}
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-3">
                Priority Order
              </p>
              <ol className="space-y-1.5">
                {strategy.priorityOrder.map((item, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-300">
                    <span className="text-emerald-500 font-bold shrink-0 w-5">
                      {i + 1}.
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>

            {/* Three strategy pillars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StrategyPillar
                icon="✍️"
                color="text-indigo-400"
                label="Content Strategy"
                headline={strategy.contentStrategy.headline}
                tactics={strategy.contentStrategy.tactics}
              />
              <StrategyPillar
                icon="💰"
                color="text-yellow-400"
                label="Paid Strategy"
                headline={strategy.paidStrategy.headline}
                tactics={strategy.paidStrategy.tactics}
              />
              <StrategyPillar
                icon="📡"
                color="text-violet-400"
                label="Audience Expansion"
                headline={strategy.audienceExpansion.headline}
                tactics={strategy.audienceExpansion.tactics}
              />
            </div>

            {/* Experiments */}
            {strategy.experiments.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide mb-4">
                  30-Day Experiments
                </p>
                <div className="space-y-4">
                  {strategy.experiments.map((exp, i) => (
                    <div key={i} className="border-l-2 border-orange-800/60 pl-4 space-y-1">
                      <p className="text-sm font-semibold text-gray-200">{exp.name}</p>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        <span className="text-gray-500 font-medium">Hypothesis: </span>
                        {exp.hypothesis}
                      </p>
                      <p className="text-xs text-orange-400">
                        <span className="font-medium">Success metric: </span>
                        {exp.successMetric}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
      />
    </div>
  );
}

function StrategyPillar({
  icon,
  color,
  label,
  headline,
  tactics,
}: {
  icon: string;
  color: string;
  label: string;
  headline: string;
  tactics: string[];
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</span>
      </div>
      <p className="text-sm text-gray-200 leading-snug">{headline}</p>
      <ul className="space-y-1.5">
        {tactics.map((t, i) => (
          <li key={i} className="flex gap-2 text-xs text-gray-400 leading-relaxed">
            <span className={`shrink-0 font-bold ${color}`}>→</span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}
