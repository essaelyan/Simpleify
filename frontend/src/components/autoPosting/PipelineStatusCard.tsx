import { useState } from "react";
import type { PlatformDraft, PostStatus, ContentBrief } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";
import CaptionVariantsPanel from "./CaptionVariantsPanel";
import HashtagResearchPanel from "./HashtagResearchPanel";

interface PipelineStatusCardProps {
  draft: PlatformDraft;
  brief?: ContentBrief;
}

// ─── Step types ───────────────────────────────────────────────────────────────

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
      return { generate: "done",   safety: "active",  publish: "pending" };
    case "publishing":
      return { generate: "done",   safety: "done",    publish: "active"  };
    case "published":
      return { generate: "done",   safety: "done",    publish: "done"    };
    case "blocked":
      return { generate: "done",   safety: "error",   publish: "skipped" };
    // QA rejected before safety ran — safety and publish are both skipped
    case "qa_rejected":
      return { generate: "done",   safety: "skipped", publish: "skipped" };
    // No account — content cleared QA and safety; publish was never attempted
    case "no_account":
      return { generate: "done",   safety: "done",    publish: "skipped" };
    case "failed":
      return { generate: "done",   safety: "done",    publish: "error"   };
  }
}

// ─── Step dot + label ─────────────────────────────────────────────────────────

function Step({ state, label }: { state: StepState; label: string }) {
  const dotCls: Record<StepState, string> = {
    pending: "w-2 h-2 rounded-full border border-gray-700",
    active:  "w-2 h-2 rounded-full bg-indigo-500 animate-pulse",
    done:    "w-2 h-2 rounded-full bg-emerald-500",
    error:   "w-2 h-2 rounded-full bg-red-500",
    skipped: "w-2 h-2 rounded-full bg-gray-800 border border-gray-700",
  };

  const labelCls: Record<StepState, string> = {
    pending: "text-gray-700",
    active:  "text-indigo-400 font-semibold",
    done:    "text-emerald-500",
    error:   "text-red-400",
    skipped: "text-gray-700",
  };

  const prefix = { done: "✓ ", error: "✗ ", skipped: "— ", pending: "", active: "" }[state];

  return (
    <div className="flex flex-col items-center gap-1 min-w-[48px]">
      <div className={dotCls[state]} />
      <span className={`text-[10px] font-medium whitespace-nowrap ${labelCls[state]}`}>
        {prefix}{label}
      </span>
    </div>
  );
}

function Connector({ lit, error }: { lit: boolean; error?: boolean }) {
  return (
    <div
      className={`flex-1 h-px self-start mt-1 transition-colors ${
        error ? "bg-red-900/60" : lit ? "bg-emerald-900/60" : "bg-gray-800"
      }`}
    />
  );
}

// ─── Card border / background by status ──────────────────────────────────────

function cardStyles(status: PostStatus): string {
  switch (status) {
    case "published":
      return "border-emerald-800/40 bg-emerald-950/10";
    case "blocked":
      // Safety blocked → amber/orange, NOT red
      return "border-amber-800/40 bg-amber-950/10";
    case "qa_rejected":
      return "border-purple-800/40 bg-purple-950/10";
    case "no_account":
      return "border-sky-800/40 bg-sky-950/10";
    case "failed":
      return "border-red-800/40 bg-red-950/10";
    case "generating":
    case "regenerating":
    case "safety_checking":
    case "publishing":
      return "border-indigo-800/35 bg-indigo-950/15";
    default:
      return "border-gray-800/60 bg-gray-900";
  }
}

// ─── Status pill ──────────────────────────────────────────────────────────────

const STATUS_PILL: Record<PostStatus, { bg: string; text: string; label: string }> = {
  generating:      { bg: "bg-gray-800",          text: "text-gray-400",    label: "Generating…"         },
  regenerating:    { bg: "bg-violet-900/30",     text: "text-violet-300",  label: "Regenerating…"       },
  safety_checking: { bg: "bg-amber-900/30",      text: "text-amber-400",   label: "Safety Check…"       },
  publishing:      { bg: "bg-indigo-900/30",     text: "text-indigo-300",  label: "Publishing…"         },
  published:       { bg: "bg-emerald-900/30",    text: "text-emerald-400", label: "Published"           },
  blocked:         { bg: "bg-amber-900/30",      text: "text-amber-400",   label: "Safety Blocked"      },
  qa_rejected:     { bg: "bg-purple-900/30",     text: "text-purple-400",  label: "QA Rejected"         },
  no_account:      { bg: "bg-sky-900/30",        text: "text-sky-400",     label: "No Account"          },
  failed:          { bg: "bg-red-900/30",        text: "text-red-400",     label: "Publish Failed"      },
};

const SEVERITY_COLORS: Record<"low" | "medium" | "high", string> = {
  low:    "bg-yellow-900/40 text-yellow-300 border border-yellow-800/50",
  medium: "bg-orange-900/40 text-orange-300 border border-orange-800/50",
  high:   "bg-red-900/40    text-red-300    border border-red-800/50",
};

type ActivePanel = "variants" | "hashtags" | null;

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelineStatusCard({ draft, brief }: PipelineStatusCardProps) {
  const meta      = PLATFORM_META[draft.platform];
  const steps     = getSteps(draft.status);
  const pill      = STATUS_PILL[draft.status];
  const isActive  = (["generating", "regenerating", "safety_checking", "publishing"] as PostStatus[]).includes(draft.status);
  const canEnhance = !!brief && draft.status === "published";
  const isMock    = !!draft.mockPlatformPostId;

  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  function togglePanel(panel: ActivePanel) {
    setActivePanel((prev) => (prev === panel ? null : panel));
  }

  return (
    <div className={`border rounded-xl flex flex-col overflow-hidden transition-all duration-300 ${cardStyles(draft.status)}`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{meta.icon}</span>
          <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isMock && (
            <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border border-gray-700/80 text-gray-600 bg-gray-800/60">
              Mock
            </span>
          )}
          <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${pill.bg} ${pill.text}`}>
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse flex-shrink-0" />
            )}
            {pill.label}
          </span>
        </div>
      </div>

      {/* ── Step progress ──────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-b border-white/[0.04]">
        <div className="flex items-start gap-0">
          <Step
            state={steps.generate}
            label={draft.status === "regenerating" ? "Regen…" : "Generate"}
          />
          <Connector
            lit={steps.safety !== "pending"}
            error={steps.safety === "error"}
          />
          <Step state={steps.safety} label="Safety" />
          <Connector
            lit={steps.publish !== "pending" && steps.publish !== "skipped"}
            error={steps.publish === "error"}
          />
          <Step state={steps.publish} label="Publish" />
        </div>
      </div>

      {/* ── Content area ───────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex-1 space-y-3">

        {/* Skeleton while generating */}
        {(draft.status === "generating" || draft.status === "regenerating") && (
          <div className="space-y-2">
            <div className="h-3 rounded animate-shimmer" />
            <div className="h-3 rounded animate-shimmer w-5/6" />
            <div className="h-3 rounded animate-shimmer w-4/6" />
          </div>
        )}

        {/* Caption preview — mono font marks AI-generated text */}
        {draft.caption && !["generating", "regenerating"].includes(draft.status) && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">
              Caption
            </p>
            <p className="text-sm text-gray-300 line-clamp-3 leading-relaxed font-mono-ai">
              {draft.caption}
            </p>
            {draft.hashtags.length > 0 && (
              <p className="text-xs text-gray-700 mt-1.5 truncate">
                {draft.hashtags.slice(0, 5).map((t) => `#${t}`).join(" ")}
                {draft.hashtags.length > 5 && (
                  <span className="text-gray-800 ml-1">+{draft.hashtags.length - 5} more</span>
                )}
              </p>
            )}
          </div>
        )}

        {/* ── Safety blocked — amber treatment, clearly distinct from failure ── */}
        {draft.status === "blocked" && draft.safetyFlagReason && (
          <div className="bg-amber-950/40 border border-amber-800/40 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base leading-none">🛡️</span>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Safety Blocked
              </span>
              {draft.safetySeverity && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${SEVERITY_COLORS[draft.safetySeverity]}`}>
                  {draft.safetySeverity}
                </span>
              )}
            </div>
            <p className="text-xs text-amber-300/70 leading-relaxed">
              {draft.safetyFlagReason}
            </p>
            <p className="text-[10px] text-amber-900/80 mt-1.5 italic">
              The AI attempted to rewrite and re-check. Both attempts failed safety review.
            </p>
          </div>
        )}

        {/* ── QA rejected — purple, shows revision guidance ── */}
        {draft.status === "qa_rejected" && (
          <div className="bg-purple-950/40 border border-purple-800/40 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base leading-none">✦</span>
              <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                QA Rejected
              </span>
              {draft.qaScore !== undefined && draft.qaScore !== null && (
                <span className="text-[10px] text-purple-600 font-mono">
                  score {draft.qaScore}/100
                </span>
              )}
            </div>
            <p className="text-xs text-purple-300/70 leading-relaxed">
              {draft.errorMessage ?? "Content quality below threshold after revision attempt."}
            </p>
            <p className="text-[10px] text-purple-900/80 mt-1.5 italic">
              The AI attempted one rewrite. Both passes failed the quality bar.
            </p>
          </div>
        )}

        {/* ── No account — sky/blue, shows connect prompt ── */}
        {draft.status === "no_account" && (
          <div className="bg-sky-950/40 border border-sky-800/40 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base leading-none">🔗</span>
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                No Connected Account
              </span>
            </div>
            <p className="text-xs text-sky-300/70 leading-relaxed">
              Content passed QA and safety checks but no {draft.platform} account is connected.
              Connect an account in Settings → Social Accounts to publish.
            </p>
          </div>
        )}

        {/* ── Publish failed — red treatment, distinct from safety blocked ── */}
        {draft.status === "failed" && draft.errorMessage && (
          <div className="bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                ⚠ Publish Failed
              </span>
            </div>
            <p className="text-xs text-red-300/70 leading-relaxed">
              {draft.errorMessage}
            </p>
          </div>
        )}

        {/* Published — timestamp + mock/live + QA score */}
        {draft.status === "published" && draft.publishedAt && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 text-sm">✓</span>
              <p className="text-xs text-emerald-400/80">
                {new Date(draft.publishedAt).toLocaleString()}
              </p>
            </div>
            {draft.qaScore !== undefined && draft.qaScore !== null && (
              <span className="text-[10px] text-gray-600 font-mono">
                QA {draft.qaScore}/100
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Enhancement actions (published only) ───────────────────────────── */}
      {canEnhance && (
        <div className="border-t border-white/[0.04] px-4 py-2.5">
          <div className="flex gap-2">
            <button
              onClick={() => togglePanel("variants")}
              className={[
                "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all duration-150",
                activePanel === "variants"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-transparent border-gray-700/60 text-gray-500 hover:border-indigo-700/60 hover:text-indigo-400",
              ].join(" ")}
            >
              ✦ Variants
            </button>
            <button
              onClick={() => togglePanel("hashtags")}
              className={[
                "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all duration-150",
                activePanel === "hashtags"
                  ? "bg-violet-700 border-violet-600 text-white"
                  : "bg-transparent border-gray-700/60 text-gray-500 hover:border-violet-700/60 hover:text-violet-400",
              ].join(" ")}
            >
              # Hashtags
            </button>
          </div>
        </div>
      )}

      {/* ── Expansion panels ───────────────────────────────────────────────── */}
      {canEnhance && activePanel === "variants" && (
        <div className="border-t border-white/[0.04]">
          <CaptionVariantsPanel draft={draft} brief={brief} onClose={() => setActivePanel(null)} />
        </div>
      )}
      {canEnhance && activePanel === "hashtags" && (
        <div className="border-t border-white/[0.04]">
          <HashtagResearchPanel draft={draft} brief={brief} onClose={() => setActivePanel(null)} />
        </div>
      )}
    </div>
  );
}
