import Link from "next/link";
import { useRouter } from "next/router";

const MODULES = [
  {
    label: "AI Content Creator",
    icon: "✏️",
    href: "/ContentCreator",
  },
  {
    label: "AI SEO Engine",
    icon: "🔍",
    href: "/SEOEngine",
  },
  {
    label: "AI Social Media Manager",
    icon: "📱",
    href: "/SocialMedia",
    subLinks: [
      { label: "Overview", href: "/SocialMedia" },
      { label: "Auto Posting", href: "/SocialMedia/AutoPosting" },
      { label: "Feedback Loop", href: "/SocialMedia/FeedbackLoop" },
    ],
  },
  {
    label: "AI Media Buyer",
    icon: "💰",
    href: "/MediaBuyer",
  },
  {
    label: "AI Growth Engine",
    icon: "📈",
    href: "/Dashboard",
    subLinks: [
      { label: "Dashboard", href: "/Dashboard" },
      { label: "Analytics", href: "/Analytics" },
      { label: "Growth Strategy", href: "/GrowthStrategy" },
    ],
  },
];

export default function Sidebar() {
  const router = useRouter();

  function isActive(href: string) {
    return router.pathname.startsWith(href);
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      {/* Wordmark */}
      <div className="px-5 py-6 border-b border-gray-800">
        <Link href="/" className="block">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-0.5">
            AI Marketing
          </p>
          <p className="text-lg font-bold text-gray-100 leading-tight">Operating System</p>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {MODULES.map((mod) => {
          const active = isActive(mod.href);
          return (
            <div key={mod.href}>
              <Link
                href={mod.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-600/20 text-indigo-300"
                    : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                }`}
              >
                <span className="text-base w-5 text-center">{mod.icon}</span>
                {mod.label}
              </Link>

              {/* Sub-links (only shown when module is active) */}
              {active && mod.subLinks && (
                <div className="ml-8 mt-1 space-y-1">
                  {mod.subLinks.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={`block px-3 py-1.5 rounded-md text-xs transition-colors ${
                        router.pathname === sub.href || router.pathname.startsWith(sub.href + "/")
                          ? "text-indigo-300 font-semibold"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-800">
        <p className="text-xs text-gray-600">AI Marketing OS v1.0</p>
      </div>
    </aside>
  );
}
