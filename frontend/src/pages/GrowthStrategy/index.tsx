import { useState } from "react";
import { getGrowthStrategy } from "@/api/analytics";

const SAMPLE_INSIGHTS = {
  bestTrafficSource: "email — highest conversion rate at 14%",
  highestConvertingAudience: "25-34 female, 280 conversions",
  topPerformingContent: "Product Launch Story — 310 conversions",
};

type ContentBlock = { type: string; text?: string };

export default function GrowthStrategyPage() {
  const [input, setInput] = useState(JSON.stringify(SAMPLE_INSIGHTS, null, 2));
  const [strategy, setStrategy] = useState<ContentBlock[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setStrategy(null);
    try {
      const parsed = JSON.parse(input);
      const result = await getGrowthStrategy(parsed);
      setStrategy(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 text-gray-100">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Growth Strategy</h1>
        <p className="text-gray-400 mb-8">
          Paste your marketing insights below and get an AI-generated growth playbook.
        </p>

        {/* Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Insights (JSON)
          </label>
          <textarea
            className="w-full h-56 bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm font-mono text-gray-100 focus:outline-none focus:border-indigo-500 resize-none"
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
          {loading ? "Generating…" : "Get Growth Strategy"}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-6 bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {/* Results */}
        {strategy && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Growth Recommendations</h2>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
              {strategy
                .filter((block) => block.type === "text" && block.text)
                .map((block, i) => (
                  <p key={i}>{block.text}</p>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
