const EXPERIMENTS = [
  { test: "New headline", purpose: "Increase CTR", status: "Running" },
  { test: "New audience", purpose: "Reduce CPA", status: "Running" },
  { test: "New landing page", purpose: "Increase conversions", status: "Queued" },
];

const STATUS_STYLES: Record<string, string> = {
  Running: "bg-indigo-900/50 text-indigo-300",
  Queued: "bg-yellow-900/50 text-yellow-300",
  Complete: "bg-emerald-900/50 text-emerald-300",
};

export default function GrowthExperiments() {
  return (
    <div className="mt-10">
      <h2 className="text-2xl font-bold mb-1">Automated Growth Experiments</h2>
      <p className="text-gray-400 text-sm mb-6">AI runs these tests continuously to improve performance.</p>

      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-3 px-5 py-3 border-b border-gray-700">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Test</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Purpose</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Status</span>
        </div>

        {/* Rows */}
        {EXPERIMENTS.map((exp, i) => (
          <div
            key={i}
            className={`grid grid-cols-3 px-5 py-4 items-center ${
              i < EXPERIMENTS.length - 1 ? "border-b border-gray-800" : ""
            }`}
          >
            <span className="text-sm text-gray-100 font-medium">{exp.test}</span>
            <span className="text-sm text-gray-400">{exp.purpose}</span>
            <span>
              <span
                className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  STATUS_STYLES[exp.status] ?? "bg-gray-700 text-gray-300"
                }`}
              >
                {exp.status}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
