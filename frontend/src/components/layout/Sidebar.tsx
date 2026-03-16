import Link from "next/link";
import { useRouter } from "next/router";

const MODULES = [
  {
    label: "AI Content Creator",
    icon: "✏️",
    href: "/ContentCreator",
    accent: "indigo",
  },
  {
    label: "AI SEO Engine",
    icon: "🔍",
    href: "/SEOEngine",
    accent: "blue",
  },
  {
    label: "AI Social Media",
    icon: "📱",
    href: "/SocialMedia",
    accent: "pink",
    subLinks: [
      { label: "Overview",      href: "/SocialMedia" },
      { label: "Auto Posting",  href: "/SocialMedia/AutoPosting" },
      { label: "Feedback Loop", href: "/SocialMedia/FeedbackLoop" },
    ],
  },
  {
    label: "AI Media Buyer",
    icon: "💰",
    href: "/MediaBuyer",
    accent: "amber",
  },
  {
    label: "AI Growth Engine",
    icon: "📈",
    href: "/Dashboard",
    accent: "emerald",
    subLinks: [
      { label: "Dashboard",       href: "/Dashboard" },
      { label: "Analytics",       href: "/Analytics" },
      { label: "Growth Strategy", href: "/GrowthStrategy" },
    ],
  },
];

export default function Sidebar() {
  const router = useRouter();

  function isModuleActive(href: string) {
    if (href === "/SocialMedia") return router.pathname.startsWith("/SocialMedia");
    if (href === "/Dashboard")   return router.pathname === "/Dashboard" || router.pathname.startsWith("/Dashboard");
    return router.pathname.startsWith(href);
  }

  function isSubActive(href: string) {
    if (href === "/SocialMedia") return router.pathname === href;
    return router.pathname === href || router.pathname.startsWith(href + "/");
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800/70 flex flex-col min-h-screen">

      {/* Wordmark */}
      <div className="px-5 py-5 border-b border-gray-800/70">
        <Link href="/" className="block">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-400 mb-0.5">
            AI Marketing
          </p>
          <p className="text-[15px] font-bold text-gray-100 leading-snug tracking-tight">
            Operating System
          </p>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
        {MODULES.map((mod) => {
          const active = isModuleActive(mod.href);
          return (
            <div key={mod.href}>
              <Link
                href={mod.href}
                className={[
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-indigo-600/15 text-indigo-200 border border-indigo-700/30"
                    : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent",
                ].join(" ")}
              >
                <span className="text-[15px] w-4 text-center flex-shrink-0 leading-none">{mod.icon}</span>
                <span className="truncate text-[13px]">{mod.label}</span>
                {active && mod.subLinks && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                )}
              </Link>

              {/* Sub-links with indent line */}
              {active && mod.subLinks && (
                <div className="ml-[18px] mt-0.5 mb-0.5 border-l border-gray-700/60 pl-3 space-y-0.5">
                  {mod.subLinks.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className={[
                        "block px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                        isSubActive(sub.href)
                          ? "text-indigo-300 bg-indigo-600/10"
                          : "text-gray-600 hover:text-gray-300 hover:bg-gray-800/40",
                      ].join(" ")}
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
      <div className="px-4 py-4 border-t border-gray-800/70">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
          <p className="text-[11px] text-gray-600">v1.0 · System Active</p>
        </div>
      </div>
    </aside>
  );
}
