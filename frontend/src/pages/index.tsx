import Link from "next/link";

const MODULES = [
  {
    icon: "✏️",
    name: "AI Content Creator",
    description: "Generate images, carousels, reels, and stories powered by AI.",
    href: "/ContentCreator",
    accent: "border-purple-800/40 hover:border-purple-700/70",
    badge: "Coming soon",
    badgeStyle: "bg-gray-800 text-gray-500 border border-gray-700",
  },
  {
    icon: "🔍",
    name: "AI SEO Engine",
    description: "Rank higher with AI-optimized keywords, content, and on-page strategies.",
    href: "/SEOEngine",
    accent: "border-blue-800/40 hover:border-blue-700/70",
    badge: "Coming soon",
    badgeStyle: "bg-gray-800 text-gray-500 border border-gray-700",
  },
  {
    icon: "📱",
    name: "AI Social Media Manager",
    description: "Auto-generate, safety-check, and publish content across all platforms.",
    href: "/SocialMedia",
    accent: "border-pink-800/40 hover:border-pink-600/80",
    badge: "Active",
    badgeStyle: "bg-emerald-900/40 text-emerald-400 border border-emerald-800/50",
  },
  {
    icon: "💰",
    name: "AI Media Buyer",
    description: "Allocate ad spend intelligently with AI-driven bidding and targeting.",
    href: "/MediaBuyer",
    accent: "border-amber-800/40 hover:border-amber-700/70",
    badge: "Coming soon",
    badgeStyle: "bg-gray-800 text-gray-500 border border-gray-700",
  },
  {
    icon: "📈",
    name: "AI Growth Engine",
    description: "Monitor signals, run experiments, and scale automatically.",
    href: "/Dashboard",
    accent: "border-emerald-800/40 hover:border-emerald-700/70",
    badge: "Active",
    badgeStyle: "bg-emerald-900/40 text-emerald-400 border border-emerald-800/50",
  },
];

export default function HomePage() {
  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-400 mb-2">
            Welcome to
          </p>
          <h1 className="text-3xl font-bold text-gray-100 mb-2">AI Marketing OS</h1>
          <p className="text-gray-500 text-sm max-w-lg leading-relaxed">
            Your complete AI-powered marketing operating system. Choose a module to get started.
          </p>
        </div>

        {/* Module cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className={`group bg-gray-900 border rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30 ${mod.accent}`}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-2xl leading-none">{mod.icon}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${mod.badgeStyle}`}>
                  {mod.badge}
                </span>
              </div>
              <h2 className="text-sm font-semibold text-gray-200 mb-1.5 group-hover:text-white transition-colors">
                {mod.name}
              </h2>
              <p className="text-xs text-gray-600 leading-relaxed mb-4">{mod.description}</p>
              <span className="text-xs font-semibold text-indigo-500 group-hover:text-indigo-300 transition-colors">
                Open →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
