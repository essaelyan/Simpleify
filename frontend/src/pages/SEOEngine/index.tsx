const FEATURES = [
  "AI keyword research and clustering",
  "On-page SEO scoring and recommendations",
  "Auto-generated meta titles and descriptions",
  "Content gap analysis vs. competitors",
  "Internal linking suggestions",
];

export default function SEOEnginePage() {
  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-2">Module</p>
        <h1 className="text-3xl font-bold text-gray-100 mb-2">AI SEO Engine</h1>
        <p className="text-gray-400 mb-10">
          Rank higher with AI-optimized keywords, content briefs, and on-page strategies.
        </p>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Coming Soon
          </p>
          <ul className="space-y-3">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-blue-500 mt-0.5">→</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
