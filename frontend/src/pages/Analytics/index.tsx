import { useState } from "react";
import { getAnalyticsInsights } from "@/api/analytics";

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

type ContentBlock = { type: string; text?: string };

export default function AnalyticsPage() {
  const [input, setInput] = useState(JSON.stringify(SAMPLE_DATA, null, 2));
  const [insights, setInsights] = useState<ContentBlock[] | null>(null);
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

        {/* Results */}
        {insights && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">AI Insights</h2>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
              {insights
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
