const OPPORTUNITIES = [
  {
    metric: "Instagram ads CTR = 2.8%",
    suggestions: [
      "Increase budget 25%",
      "Duplicate winning ad",
      "Launch retargeting campaign",
    ],
  },
  {
    metric: "Email open rate dropped to 18%",
    suggestions: [
      "A/B test subject lines",
      "Segment inactive subscribers",
      "Send at 9am local time",
    ],
  },
  {
    metric: "Google organic traffic +34% this week",
    suggestions: [
      "Double down on top keyword",
      "Create 3 supporting blog posts",
      "Add internal links from homepage",
    ],
  },
];

export default function AIOpportunityFeed() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">AI Opportunity Feed</h2>
      <p className="text-gray-400 text-sm mb-6">Real-time signals with actionable AI suggestions.</p>

      <div className="space-y-4">
        {OPPORTUNITIES.map((opp, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-700 rounded-xl p-5"
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🔎</span>
              <span className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">
                Opportunity Detected
              </span>
            </div>

            {/* Metric */}
            <p className="text-gray-100 font-medium mb-3">{opp.metric}</p>

            {/* Suggestions */}
            <div className="border-t border-gray-700 pt-3">
              <p className="text-xs font-semibold text-indigo-400 mb-2">AI Suggestion:</p>
              <ul className="space-y-1">
                {opp.suggestions.map((s, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="mt-0.5 text-indigo-500">→</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
