import type { PlatformDraft, PostStatus } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";

interface PipelineStatusCardProps {
  draft: PlatformDraft;
}

// ─── Step indicator helpers ───────────────────────────────────────────────────

type StepState = "pending" | "active" | "done" | "error" | "skipped";

interface PipelineSteps {
  generate: StepState;
  safety: StepState;
  publish: StepState;
}

function getSteps(status: PostStatus): PipelineSteps {
  switch (status) {
    case "generating":
    case "regenerating":
      return { generate: "active", safety: "pending", publish: "pending" };
    case "safety_checking":
      return { generate: "done", safety: "active", publish: "pending" };
    case "publishing":
      return { generate: "done", safety: "done", publish: "active" };
    case "published":
      return { generate: "done", safety: "done", publish: "done" };
    case "blocked":
      return { generate: "done", safety: "error", publish: "skipped" };
    case "failed":
      return { generate: "done", safety: "done", publish: "error" };
  }
}

function StepDot({ state, label }: { state: StepState; label: string }) {
  const dotClass =
    state === "active"
      ? "w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"
      : state === "done"
      ? "w-2.5 h-2.5 rounded-full bg-emerald-400"
      : state === "error"
      ? "w-2.5 h-2.5 rounded-full bg-red-400"
      : state === "skipped"
      ? "w-2.5 h-2.5 rounded-full bg-gray-700"
      : "w-2.5 h-2.5 rounded-full border-2 border-gray-600";

  const labelClass =
    state === "active"
      ? "text-indigo-400"
      : state === "done"
      ? "text-emerald-400"
      : state === "error"
      ? "text-red-400"
      : "text-gray-600";

  const icon =
    state === "done" ? "✓ " : state === "error" ? "✗ " : state === "skipped" ? "— " : "";

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <div className={dotClass} />
      <span className={`text-xs font-medium whitespace-nowrap ${labelClass}`}>
        {icon}{label}
      </span>
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_PILL: Record<PostStatus, string> = {
  generating:      "bg-gray-800 text-gray-400",
  regenerating:    "bg-violet-900/40 text-violet-300",
  safety_checking: "bg-yellow-900/40 text-yellow-400",
  publishing:      "bg-amber-900/40 text-amber-300",
  published:       "bg-emerald-900/40 text-emerald-400",
  blocked:         "bg-red-900/40 text-red-400",
  failed:          "bg-red-900/40 text-red-400",
};

const STATUS_LABEL: Record<PostStatus, string> = {
  generating:      "Generating…",
  regenerating:    "Regenerating…",
  safety_checking: "Safety Check…",
  publishing:      "Publishing…",
  published:       "Published",
  blocked:         "Blocked",
  failed:          "Failed",
};

const SEVERITY_BADGE: Record<"low" | "medium" | "high", string> = {
  low:    "bg-yellow-900/40 text-yellow-300 border border-yellow-800/50",
  medium: "bg-orange-900/40 text-orange-300 border border-orange-800/50",
  high:   "bg-red-900/40 text-red-300 border border-red-800/50",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelineStatusCard({ draft }: PipelineStatusCardProps) {
  const meta = PLATFORM_META[draft.platform];
  const steps = getSteps(draft.status);
  const isActive =
    draft.status === "generating" ||
    draft.status === "regenerating" ||
    draft.status === "safety_checking" ||
    draft.status === "publishing";

  return (
    <div
      className={`bg-gray-900 border rounded-xl p-5 flex flex-col gap-4 transition-colors ${
        isActive ? "border-indigo-800/60" : "border-gray-700"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.icon}</span>
          <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_PILL[draft.status]}`}
        >
          {isActive && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          )}
          {STATUS_LABEL[draft.status]}
        </span>
      </div>

      {/* Step progress bar */}
      <div className="flex items-center gap-2">
        <StepDot state={steps.generate} label="Generating" />
        <div
          className={`flex-1 h-px ${
            steps.safety === "pending" || steps.safety === "skipped"
              ? "bg-gray-700"
              : steps.safety === "active"
              ? "bg-indigo-700"
              : steps.safety === "error"
              ? "bg-red-700"
              : "bg-emerald-700"
          }`}
        />
        <StepDot state={steps.safety} label="Safety Check" />
        <div
          className={`flex-1 h-px ${
            steps.publish === "pending" || steps.publish === "skipped"
              ? "bg-gray-700"
              : steps.publish === "active"
              ? "bg-indigo-700"
              : steps.publish === "error"
              ? "bg-red-700"
              : "bg-emerald-700"
          }`}
        />
        <StepDot state={steps.publish} label="Publishing" />
      </div>

      {/* Caption preview (shown once generated, hidden while regenerating) */}
      {draft.caption && draft.status !== "generating" && draft.status !== "regenerating" && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Caption</p>
          <p className="text-sm text-gray-300 line-clamp-3 leading-relaxed">
            {draft.caption}
          </p>
          {draft.hashtags.length > 0 && (
            <p className="text-xs text-gray-600 mt-1.5 truncate">
              {draft.hashtags.map((t) => `#${t}`).join(" ")}
            </p>
          )}
        </div>
      )}

      {/* Generating / Regenerating skeleton */}
      {(draft.status === "generating" || draft.status === "regenerating") && (
        <div className="space-y-2">
          <div className="h-3 bg-gray-800 rounded animate-pulse w-full" />
          <div className="h-3 bg-gray-800 rounded animate-pulse w-4/5" />
          <div className="h-3 bg-gray-800 rounded animate-pulse w-3/5" />
        </div>
      )}

      {/* Blocked state */}
      {draft.status === "blocked" && draft.safetyFlagReason && (
        <div className="bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-400 text-sm">🛡️</span>
            <span className="text-xs font-semibold text-red-300 uppercase tracking-wide">
              Content Blocked
            </span>
            {draft.safetySeverity && (
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${SEVERITY_BADGE[draft.safetySeverity]}`}
              >
                {draft.safetySeverity.toUpperCase()}
              </span>
            )}
          </div>
          <p className="text-xs text-red-300 leading-relaxed">{draft.safetyFlagReason}</p>
        </div>
      )}

      {/* Failed state */}
      {draft.status === "failed" && draft.errorMessage && (
        <div className="bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2 text-xs text-red-400">
          {draft.errorMessage}
        </div>
      )}

      {/* Published state */}
      {draft.status === "published" && draft.publishedAt && (
        <p className="text-xs text-emerald-400">
          Published {new Date(draft.publishedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
