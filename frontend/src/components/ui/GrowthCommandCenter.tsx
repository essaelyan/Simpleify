const STATS = [
  { label: "Revenue", value: "$48,200", trend: "+12%", up: true },
  { label: "Traffic", value: "9,400 sessions", trend: "+8%", up: true },
  { label: "Conversions", value: "784", trend: "+21%", up: true },
  { label: "AI Recommendations", value: "6 active", trend: null, up: null },
];

const AI_RECOMMENDATIONS = [
  "Scale Instagram Story ads — 3.1% CTR above benchmark",
  "Re-engage 25–34 female segment with email sequence",
  "Promote Product Launch Story — highest conversion rate this month",
];

export default function GrowthCommandCenter() {
  return (
    <div className="mb-10">
      <h2 className="text-2xl font-bold mb-1">Growth Command Center</h2>
      <p className="text-gray-400 text-sm mb-6">Live performance snapshot with AI-powered recommendations.</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-100">{stat.value}</p>
            {stat.trend && (
              <span
                className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  stat.up
                    ? "bg-emerald-900/50 text-emerald-400"
                    : "bg-red-900/50 text-red-400"
                }`}
              >
                {stat.up ? "▲" : "▼"} {stat.trend}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* AI Recommendations panel */}
      <div className="bg-gray-900 border border-indigo-800/50 rounded-xl p-5">
        <p className="text-sm font-semibold text-indigo-400 mb-3">AI Recommendations</p>
        <ul className="space-y-2">
          {AI_RECOMMENDATIONS.map((rec, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="mt-0.5 text-indigo-500">•</span>
              {rec}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
