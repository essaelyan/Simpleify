import Link from "next/link";

const MODULES = [
  {
    icon: "✏️",
    name: "AI Content Creator",
    description: "Generate images, carousels, reels, and stories powered by AI.",
    href: "/ContentCreator",
    color: "border-purple-800/50 hover:border-purple-600",
  },
  {
    icon: "🔍",
    name: "AI SEO Engine",
    description: "Rank higher with AI-optimized keywords, content, and on-page strategies.",
    href: "/SEOEngine",
    color: "border-blue-800/50 hover:border-blue-600",
  },
  {
    icon: "📱",
    name: "AI Social Media Manager",
    description: "Schedule, optimize, and auto-publish content across all platforms.",
    href: "/SocialMedia",
    color: "border-pink-800/50 hover:border-pink-600",
  },
  {
    icon: "💰",
    name: "AI Media Buyer",
    description: "Allocate ad spend intelligently with AI-driven bidding and targeting.",
    href: "/MediaBuyer",
    color: "border-yellow-800/50 hover:border-yellow-600",
  },
  {
    icon: "📈",
    name: "AI Growth Engine",
    description: "Monitor signals, run experiments, and scale automatically.",
    href: "/Dashboard",
    color: "border-emerald-800/50 hover:border-emerald-600",
  },
];

export default function HomePage() {
  return (
    <div className="p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-2">
            Welcome to
          </p>
          <h1 className="text-4xl font-bold text-gray-100 mb-3">AI Marketing OS</h1>
          <p className="text-gray-400 text-lg max-w-xl">
            Your complete AI-powered marketing operating system. Choose a module to get started.
          </p>
        </div>

        {/* Module cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className={`group bg-gray-900 border rounded-xl p-6 transition-colors ${mod.color}`}
            >
              <span className="text-3xl block mb-4">{mod.icon}</span>
              <h2 className="text-base font-semibold text-gray-100 mb-2 group-hover:text-white">
                {mod.name}
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">{mod.description}</p>
              <span className="text-xs font-semibold text-indigo-400 group-hover:text-indigo-300">
                Open →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
