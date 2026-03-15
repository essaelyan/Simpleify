import Link from "next/link";

const FEATURES = [
  "Visual content calendar with drag-and-drop scheduling",
  "Auto-publish to Instagram, TikTok, LinkedIn, and X",
  "AI caption and hashtag generation",
  "Best-time-to-post recommendations",
  "Engagement tracking and reply suggestions",
];

export default function SocialMediaPage() {
  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400 mb-2">Module</p>
        <h1 className="text-3xl font-bold text-gray-100 mb-2">AI Social Media Manager</h1>
        <p className="text-gray-400 mb-10">
          Schedule, optimize, and auto-publish content across every platform — hands-free.
        </p>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Coming Soon
          </p>
          <ul className="space-y-3">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-pink-500 mt-0.5">→</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6">
          <Link
            href="/SocialMedia/AutoPosting"
            className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            Try Auto Posting →
          </Link>
        </div>
      </div>
    </div>
  );
}
