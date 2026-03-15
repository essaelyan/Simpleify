const FEATURES = [
  "AI-driven budget allocation across ad platforms",
  "Automated bid adjustments based on ROAS targets",
  "Audience lookalike expansion recommendations",
  "Creative performance scoring and rotation",
  "Cross-channel attribution reporting",
];

export default function MediaBuyerPage() {
  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400 mb-2">Module</p>
        <h1 className="text-3xl font-bold text-gray-100 mb-2">AI Media Buyer</h1>
        <p className="text-gray-400 mb-10">
          Allocate ad spend intelligently with AI-driven bidding, targeting, and attribution.
        </p>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Coming Soon
          </p>
          <ul className="space-y-3">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-yellow-500 mt-0.5">→</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
