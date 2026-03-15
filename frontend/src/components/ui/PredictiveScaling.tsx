const SIGNALS = [
  { label: "CPA dropping", positive: true },
  { label: "ROAS increasing", positive: true },
  { label: "CTR strong", positive: true },
];

const ACTIONS = [
  "Increase budget 20%",
  "Duplicate ad set",
  "Expand audience",
];

export default function PredictiveScaling() {
  return (
    <div className="mt-10">
      <h2 className="text-2xl font-bold mb-1">AI Predictive Scaling</h2>
      <p className="text-gray-400 text-sm mb-6">
        AI monitors key signals and automatically scales when conditions are met.
      </p>

      {/* Scaling triggered badge */}
      <div className="inline-flex items-center gap-2 bg-emerald-900/40 border border-emerald-700/50 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Scaling Triggered
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Signals panel */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
            Signals Detected
          </p>
          <ul className="space-y-3">
            {SIGNALS.map((sig, i) => (
              <li key={i} className="flex items-center gap-3">
                <span
                  className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    sig.positive ? "bg-emerald-400" : "bg-red-400"
                  }`}
                />
                <span className="text-sm text-gray-200">{sig.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions panel */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
            Actions Triggered
          </p>
          <ul className="space-y-3">
            {ACTIONS.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
                <span className="text-indigo-500 mt-0.5">→</span>
                {action}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
