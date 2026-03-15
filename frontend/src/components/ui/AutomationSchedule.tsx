const SCHEDULE = [
  { interval: "Every 6 hours", task: "Monitor ads", icon: "⏱" },
  { interval: "Every 24 hours", task: "Optimize campaigns", icon: "⚙️" },
  { interval: "Every 3 days", task: "Generate new creatives", icon: "✦" },
  { interval: "Every week", task: "Adjust strategy", icon: "📈" },
];

export default function AutomationSchedule() {
  return (
    <div className="mt-10">
      <h2 className="text-2xl font-bold mb-1">Automation Schedule</h2>
      <p className="text-gray-400 text-sm mb-6">Your AI Growth Engine runs these tasks automatically.</p>

      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        {SCHEDULE.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-4 px-5 py-4 ${
              i < SCHEDULE.length - 1 ? "border-b border-gray-800" : ""
            }`}
          >
            {/* Icon */}
            <span className="text-xl w-7 text-center flex-shrink-0">{item.icon}</span>

            {/* Task */}
            <span className="text-sm text-gray-100 font-medium flex-1">{item.task}</span>

            {/* Interval pill */}
            <span className="text-xs font-semibold bg-gray-800 border border-gray-700 text-gray-300 px-3 py-1 rounded-full whitespace-nowrap">
              {item.interval}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
