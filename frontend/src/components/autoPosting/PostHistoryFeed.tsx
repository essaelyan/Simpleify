import type { PlatformDraft } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";

interface PostHistoryFeedProps {
  history: PlatformDraft[];
}

const STATUS_CONFIG = {
  published: {
    pill: "bg-emerald-900/40 text-emerald-400 border border-emerald-800/40",
    label: "Published",
    dot: "bg-emerald-500",
  },
  blocked: {
    // Safety blocked = amber, not red
    pill: "bg-amber-900/40 text-amber-400 border border-amber-800/40",
    label: "Safety Blocked",
    dot: "bg-amber-500",
  },
  qa_rejected: {
    pill: "bg-purple-900/40 text-purple-400 border border-purple-800/40",
    label: "QA Rejected",
    dot: "bg-purple-500",
  },
  no_account: {
    pill: "bg-sky-900/40 text-sky-400 border border-sky-800/40",
    label: "No Account",
    dot: "bg-sky-500",
  },
  failed: {
    pill: "bg-red-900/40 text-red-400 border border-red-800/40",
    label: "Failed",
    dot: "bg-red-500",
  },
} as const;

export default function PostHistoryFeed({ history }: PostHistoryFeedProps) {
  if (history.length === 0) {
    return (
      <div className="border border-dashed border-gray-800 rounded-xl p-10 text-center">
        <p className="text-gray-500 text-sm font-medium">No history yet</p>
        <p className="text-gray-700 text-xs mt-1.5">
          Published and safety-blocked posts will appear here after the pipeline runs.
        </p>
      </div>
    );
  }

  const publishedCount  = history.filter((d) => d.status === "published").length;
  const blockedCount    = history.filter((d) => d.status === "blocked").length;
  const qaRejectedCount = history.filter((d) => d.status === "qa_rejected").length;
  const noAccountCount  = history.filter((d) => d.status === "no_account").length;
  const failedCount     = history.filter((d) => d.status === "failed").length;

  return (
    <div className="bg-gray-900 border border-gray-800/80 rounded-xl overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-800/60 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-200">
          {history.length} post{history.length !== 1 ? "s" : ""} in history
        </p>
        <div className="flex items-center gap-2">
          {publishedCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-800/40">
              {publishedCount} published
            </span>
          )}
          {blockedCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-800/40">
              {blockedCount} blocked
            </span>
          )}
          {qaRejectedCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-400 border border-purple-800/40">
              {qaRejectedCount} QA rejected
            </span>
          )}
          {noAccountCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-900/40 text-sky-400 border border-sky-800/40">
              {noAccountCount} no account
            </span>
          )}
          {failedCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-800/40">
              {failedCount} failed
            </span>
          )}
        </div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-gray-800/60">
        {history.map((draft) => {
          const meta   = PLATFORM_META[draft.platform];
          const config = STATUS_CONFIG[draft.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.failed;
          const isMock = !!draft.mockPlatformPostId;

          return (
            <div key={draft.id} className="flex items-start gap-4 px-5 py-4">

              {/* Platform icon */}
              <div className="w-8 h-8 flex-shrink-0 bg-gray-800 rounded-full flex items-center justify-center text-base">
                {meta.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${config.pill}`}>
                    {config.label}
                  </span>
                  {isMock && (
                    <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border border-gray-700 text-gray-600 bg-gray-800/60">
                      Mock
                    </span>
                  )}
                </div>

                {draft.caption && (
                  <p className="text-sm text-gray-400 truncate font-mono-ai">
                    {draft.caption.slice(0, 120)}{draft.caption.length > 120 ? "…" : ""}
                  </p>
                )}

                {draft.hashtags.length > 0 && (
                  <p className="text-xs text-gray-700 mt-1 truncate">
                    {draft.hashtags.slice(0, 6).map((t) => `#${t}`).join(" ")}
                    {draft.hashtags.length > 6 && <span className="text-gray-800"> +{draft.hashtags.length - 6}</span>}
                  </p>
                )}

                {/* Safety blocked reason — amber */}
                {draft.status === "blocked" && draft.safetyFlagReason && (
                  <p className="text-xs text-amber-400/70 mt-1.5 flex items-center gap-1.5">
                    <span>🛡️</span>
                    <span>{draft.safetyFlagReason}</span>
                    {draft.safetySeverity && (
                      <span className="font-bold uppercase text-amber-500/80">
                        [{draft.safetySeverity}]
                      </span>
                    )}
                  </p>
                )}

                {/* QA rejected — purple */}
                {draft.status === "qa_rejected" && draft.errorMessage && (
                  <p className="text-xs text-purple-400/70 mt-1.5 flex items-center gap-1.5">
                    <span>✦</span>
                    <span>{draft.errorMessage}</span>
                  </p>
                )}

                {/* No account — sky */}
                {draft.status === "no_account" && (
                  <p className="text-xs text-sky-400/70 mt-1.5">
                    🔗 Content ready — connect a {draft.platform} account to publish
                  </p>
                )}

                {/* Publish error — red */}
                {draft.status === "failed" && draft.errorMessage && (
                  <p className="text-xs text-red-400/70 mt-1.5">⚠ {draft.errorMessage}</p>
                )}
              </div>

              {/* Timestamp */}
              {draft.publishedAt && (
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-gray-600">
                    {new Date(draft.publishedAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
