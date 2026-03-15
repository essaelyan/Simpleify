import type { PlatformDraft } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";

interface PostHistoryFeedProps {
  history: PlatformDraft[];
}

export default function PostHistoryFeed({ history }: PostHistoryFeedProps) {
  if (history.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">No posts processed yet.</p>
        <p className="text-gray-600 text-xs mt-1">
          Published and blocked posts will appear here after the pipeline runs.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-800">
        <p className="text-sm font-semibold text-gray-200">
          {history.length} post{history.length !== 1 ? "s" : ""} in history
        </p>
      </div>
      <div className="divide-y divide-gray-800">
        {history.map((draft) => {
          const meta = PLATFORM_META[draft.platform];
          const isPublished = draft.status === "published";
          const isBlocked = draft.status === "blocked";

          return (
            <div key={draft.id} className="flex items-start gap-4 px-5 py-4">
              {/* Platform icon */}
              <div className="flex-shrink-0 w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center text-base">
                {meta.icon}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      isPublished
                        ? "bg-emerald-900/40 text-emerald-400"
                        : isBlocked
                        ? "bg-red-900/40 text-red-400"
                        : "bg-red-900/40 text-red-400"
                    }`}
                  >
                    {draft.status}
                  </span>
                </div>

                {draft.caption && (
                  <p className="text-sm text-gray-300 truncate">
                    {draft.caption.slice(0, 120)}{draft.caption.length > 120 ? "…" : ""}
                  </p>
                )}

                {draft.hashtags.length > 0 && (
                  <p className="text-xs text-gray-600 mt-1 truncate">
                    {draft.hashtags.map((t) => `#${t}`).join(" ")}
                  </p>
                )}

                {isBlocked && draft.safetyFlagReason && (
                  <p className="text-xs text-red-400 mt-1">
                    🛡️ {draft.safetyFlagReason}
                    {draft.safetySeverity && (
                      <span className="ml-1 text-red-500 uppercase font-semibold">
                        [{draft.safetySeverity}]
                      </span>
                    )}
                  </p>
                )}

                {draft.status === "failed" && draft.errorMessage && (
                  <p className="text-xs text-red-400 mt-1">{draft.errorMessage}</p>
                )}
              </div>

              {/* Timestamp */}
              <div className="flex-shrink-0 text-right">
                {draft.publishedAt && (
                  <p className="text-xs text-gray-500">
                    {new Date(draft.publishedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
