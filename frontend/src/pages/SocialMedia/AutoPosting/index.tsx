// /api/pipeline/run is now the single source of truth for the Auto Posting workflow.
// The UI is a pure presentation layer over the PipelineRunData it returns.
import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/router";
import type {
  AutoPostingAction,
  AutoPostingState,
  ContentBrief,
  PipelineCompletedPayload,
  PipelinePlatformResult,
  PlatformDraft,
  PostBrief,
  PostStatus,
} from "@/types/autoPosting";
import { runPipeline, fetchPostHistory } from "@/api/autoPosting";
import { fetchLatestHints, processFeedbackRun } from "@/api/feedbackLoop";
import { fetchConnectedAccounts } from "@/api/socialAccounts";
import type { ConnectedAccount } from "@/pages/api/social/accounts";
import { useOptimizationStore } from "@/store/optimizationStore";
import BriefForm from "@/components/autoPosting/BriefForm";
import PipelineStatusCard from "@/components/autoPosting/PipelineStatusCard";
import PostHistoryFeed from "@/components/autoPosting/PostHistoryFeed";

// ─── Pipeline status mapper ────────────────────────────────────────────────────
// Maps server-side PlatformStatus values to UI PostStatus values.

function mapPipelineStatus(s: PipelinePlatformResult["status"]): PostStatus {
  if (s === "safety_blocked") return "blocked";
  // "published" | "qa_rejected" | "no_account" | "scheduled" | "failed" pass through unchanged
  return s;
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

const initialState: AutoPostingState = {
  loading: false,
  error: null,
  activeTab: "setup",
  currentBrief: null,
  history: [],
};

function mutateDraft(
  brief: PostBrief,
  draftId: string,
  updates: Partial<PlatformDraft>
): PostBrief {
  return {
    ...brief,
    drafts: brief.drafts.map((d) =>
      d.id === draftId ? { ...d, ...updates } : d
    ),
  };
}

function reducer(state: AutoPostingState, action: AutoPostingAction): AutoPostingState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };

    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.payload };

    case "PIPELINE_STARTED":
      return {
        ...state,
        loading: true,
        error: null,
        currentBrief: action.payload,
        activeTab: "pipeline",
      };

    case "CONTENT_GENERATED":
      if (!state.currentBrief) return state;
      return {
        ...state,
        currentBrief: mutateDraft(state.currentBrief, action.payload.draftId, {
          caption: action.payload.caption,
          hashtags: action.payload.hashtags,
        }),
      };

    case "SAFETY_CHECK_STARTED":
      if (!state.currentBrief) return state;
      return {
        ...state,
        currentBrief: mutateDraft(state.currentBrief, action.payload.draftId, {
          status: "safety_checking",
        }),
      };

    case "SAFETY_CHECK_PASSED":
      if (!state.currentBrief) return state;
      return {
        ...state,
        currentBrief: mutateDraft(state.currentBrief, action.payload.draftId, {
          status: "publishing",
        }),
      };

    case "REGENERATION_STARTED":
      if (!state.currentBrief) return state;
      return {
        ...state,
        currentBrief: mutateDraft(state.currentBrief, action.payload.draftId, {
          status: "regenerating",
        }),
      };

    case "SAFETY_CHECK_BLOCKED": {
      if (!state.currentBrief) return state;
      const updatedBrief = mutateDraft(state.currentBrief, action.payload.draftId, {
        status: "blocked",
        safetyFlagReason: action.payload.flagReason,
        safetySeverity: action.payload.severity,
      });
      const blockedDraft = updatedBrief.drafts.find((d) => d.id === action.payload.draftId)!;
      return {
        ...state,
        currentBrief: updatedBrief,
        history: [blockedDraft, ...state.history],
      };
    }

    case "PUBLISHING_STARTED":
      if (!state.currentBrief) return state;
      return {
        ...state,
        currentBrief: mutateDraft(state.currentBrief, action.payload.draftId, {
          status: "publishing",
        }),
      };

    case "PUBLISHING_SUCCESS": {
      if (!state.currentBrief) return state;
      const updatedBrief = mutateDraft(state.currentBrief, action.payload.draftId, {
        status: "published",
        publishedAt: action.payload.publishedAt,
        mockPlatformPostId: action.payload.mockPlatformPostId || null,
      });
      const publishedDraft = updatedBrief.drafts.find(
        (d) => d.id === action.payload.draftId
      )!;
      return {
        ...state,
        currentBrief: updatedBrief,
        history: [publishedDraft, ...state.history],
      };
    }

    case "PUBLISHING_FAILED": {
      if (!state.currentBrief) return state;
      const updatedBrief = mutateDraft(state.currentBrief, action.payload.draftId, {
        status: "failed",
        errorMessage: action.payload.errorMessage,
      });
      const failedDraft = updatedBrief.drafts.find(
        (d) => d.id === action.payload.draftId
      )!;
      return {
        ...state,
        currentBrief: updatedBrief,
        history: [failedDraft, ...state.history],
      };
    }

    // ── Single-call pipeline result ────────────────────────────────────────
    // /api/pipeline/run returned — map each PlatformPipelineResult to a
    // PlatformDraft update and push terminal drafts into history.
    case "PIPELINE_RESULT_RECEIVED": {
      if (!state.currentBrief) return state;
      let updatedBrief = state.currentBrief;
      const newHistory: PlatformDraft[] = [];

      for (const result of action.payload.platforms) {
        const existing = updatedBrief.drafts.find((d) => d.platform === result.platform);
        if (!existing) continue;

        const uiStatus = mapPipelineStatus(result.status);
        updatedBrief = mutateDraft(updatedBrief, existing.id, {
          caption: result.caption ?? existing.caption,
          hashtags: result.hashtags ?? existing.hashtags,
          status: uiStatus,
          publishedAt: result.status === "published" ? new Date().toISOString() : null,
          scheduledAt: result.status === "scheduled" ? (result.scheduledFor ?? null) : null,
          mockPlatformPostId: result.publish?.isMock ? (result.publish.platformPostId ?? null) : null,
          errorMessage: result.reason,
          safetyFlagReason: result.safety?.flagReason ?? null,
          qaScore: result.qa?.overallScore ?? null,
          qaVerdict: result.qa?.verdict ?? null,
        });

        // All terminal states go into history
        const updated = updatedBrief.drafts.find((d) => d.id === existing.id)!;
        newHistory.push(updated);
      }

      return {
        ...state,
        currentBrief: updatedBrief,
        history: [...newHistory, ...state.history],
      };
    }

    // ── DB history hydration on mount ─────────────────────────────────────
    // Populates history from social_posts so a browser refresh doesn't wipe
    // visible history.  No-ops when session history already has items so an
    // in-progress pipeline run is never overwritten.
    case "HISTORY_LOADED":
      if (state.history.length > 0) return state;
      return { ...state, history: action.payload };

    case "CLEAR_BRIEF":
      return { ...state, currentBrief: null, activeTab: "setup" };

    default:
      return state;
  }
}

// ─── Connected Accounts Panel ─────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, string> = {
  linkedin:  "in",
  instagram: "ig",
  facebook:  "fb",
  twitter:   "tw",
  tiktok:    "tt",
};

interface ConnectedAccountsPanelProps {
  accounts: ConnectedAccount[];
  oauthSuccess: boolean;
  oauthError: string | null;
}

function ConnectedAccountsPanel({
  accounts,
  oauthSuccess,
  oauthError,
}: ConnectedAccountsPanelProps) {
  const linkedIn = accounts.find((a) => a.platform === "linkedin");

  return (
    <div className="mb-6 bg-gray-900 border border-gray-800/70 rounded-xl px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
        Connected Accounts
      </p>

      {/* OAuth feedback banners */}
      {oauthSuccess && (
        <div className="mb-3 flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 rounded-lg px-3 py-2">
          <span className="text-emerald-400">✓</span>
          LinkedIn connected successfully.
        </div>
      )}
      {oauthError && (
        <div className="mb-3 flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
          <span>⚠</span>
          {oauthError}
        </div>
      )}

      {/* LinkedIn row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Platform badge */}
          <div className="w-8 h-8 rounded-lg bg-[#0077B5]/15 border border-[#0077B5]/30 flex items-center justify-center">
            <span className="text-[10px] font-bold text-[#0077B5]">
              {PLATFORM_ICONS["linkedin"]}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-200">LinkedIn</p>
            {linkedIn ? (
              <p className="text-xs text-emerald-400">
                ● Connected
                {linkedIn.accountHandle ? ` · ${linkedIn.accountHandle}` : ""}
              </p>
            ) : (
              <p className="text-xs text-gray-600">○ Not connected</p>
            )}
          </div>
        </div>

        <a
          href="/api/social/linkedin/start"
          className={[
            "flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors",
            linkedIn
              ? "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
              : "border-indigo-600/60 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 hover:text-indigo-300",
          ].join(" ")}
        >
          {linkedIn ? "Reconnect" : "Connect"}
        </a>
      </div>

      {/* Publishing mode note — only shown when connected */}
      {linkedIn && (
        <p className="mt-3 text-[11px] text-gray-600 leading-relaxed">
          To publish real posts, set{" "}
          <code className="text-gray-500 bg-gray-800 px-1 rounded">
            SOCIAL_PUBLISH_MOCK=false
          </code>{" "}
          in your environment. Until then, the pipeline runs in mock mode and
          returns a simulated post ID.
        </p>
      )}
    </div>
  );
}

// ─── Live pipeline stage indicator ───────────────────────────────────────────

type PipelineStage = "idle" | "generate" | "safety" | "publish" | "done";

function getPipelineStage(drafts: PlatformDraft[]): PipelineStage {
  if (drafts.length === 0) return "idle";
  const statuses = drafts.map((d) => d.status);
  if (statuses.some((s) => s === "generating" || s === "regenerating")) return "generate";
  if (statuses.some((s) => s === "safety_checking"))                     return "safety";
  if (statuses.some((s) => s === "publishing"))                          return "publish";
  if (statuses.every((s) => ["published", "scheduled", "blocked", "qa_rejected", "no_account", "failed"].includes(s))) return "done";
  return "generate";
}

const STAGE_STEPS: Array<{ id: PipelineStage; label: string; icon: string }> = [
  { id: "generate", label: "Generate",   icon: "✦" },
  { id: "safety",   label: "Safety",     icon: "🛡" },
  { id: "publish",  label: "Publish",    icon: "↑" },
  { id: "done",     label: "Complete",   icon: "✓" },
];

function StageIndicator({ stage }: { stage: PipelineStage }) {
  const stageOrder: PipelineStage[] = ["idle", "generate", "safety", "publish", "done"];
  const currentIdx = stageOrder.indexOf(stage);

  return (
    <div className="flex items-center gap-1">
      {STAGE_STEPS.map((step, i) => {
        const stepIdx = stageOrder.indexOf(step.id);
        const isPast    = stepIdx < currentIdx;
        const isActive  = step.id === stage;
        const isFuture  = stepIdx > currentIdx;

        return (
          <div key={step.id} className="flex items-center gap-1">
            <div
              className={[
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-300",
                isActive
                  ? "bg-indigo-600/20 border border-indigo-600/40 text-indigo-300"
                  : isPast
                  ? "text-emerald-500/70"
                  : "text-gray-700",
              ].join(" ")}
            >
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
              )}
              {isPast && <span className="text-emerald-500">✓</span>}
              <span>{step.label}</span>
            </div>
            {i < STAGE_STEPS.length - 1 && (
              <span className={`text-xs ${isPast ? "text-emerald-800" : "text-gray-800"}`}>→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Terminal states ──────────────────────────────────────────────────────────

const TERMINAL_STATES: PostStatus[] = ["published", "scheduled", "blocked", "qa_rejected", "no_account", "failed"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AutoPostingPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [feedbackPending, setFeedbackPending] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
  const [oauthSuccess, setOauthSuccess] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const setHints = useOptimizationStore((s) => s.setHints);
  const lastFetchedAt = useOptimizationStore((s) => s.lastFetchedAt);
  // Prevent double-run of the accounts loader in strict mode
  const accountsLoaded = useRef(false);

  // ── On mount: sync latest DB snapshot into the store ─────────────────────
  useEffect(() => {
    async function syncLatestHints() {
      try {
        const hints = await fetchLatestHints();
        if (!hints) return;
        if (!lastFetchedAt || hints.generatedAt > lastFetchedAt) {
          setHints(hints);
        }
      } catch {
        // Non-critical
      }
    }
    syncLatestHints();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── On mount: hydrate history from DB so refresh doesn't clear it ─────────
  useEffect(() => {
    async function loadHistory() {
      try {
        const drafts = await fetchPostHistory();
        if (drafts.length > 0) {
          dispatch({ type: "HISTORY_LOADED", payload: drafts });
        }
      } catch {
        // Non-critical — history starts empty if the fetch fails
      }
    }
    loadHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load connected accounts + handle OAuth redirect result ────────────────
  useEffect(() => {
    if (!router.isReady) return;
    if (accountsLoaded.current) return;
    accountsLoaded.current = true;

    const { linkedin_connected, linkedin_error } = router.query;

    if (linkedin_connected) {
      setOauthSuccess(true);
      // Clear the query param so a refresh doesn't re-show the banner
      void router.replace("/SocialMedia/AutoPosting", undefined, { shallow: true });
    }
    if (typeof linkedin_error === "string" && linkedin_error) {
      setOauthError(linkedin_error);
      void router.replace("/SocialMedia/AutoPosting", undefined, { shallow: true });
    }

    async function loadAccounts() {
      try {
        const accounts = await fetchConnectedAccounts();
        setConnectedAccounts(accounts);
      } catch {
        // Non-critical
      }
    }
    void loadAccounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // ── Derive allTerminalInEffect for the pipeline "done" state ─────────────
  // Used only for UI: stage indicator, completion summary, in-progress count.
  // Feedback hints are now returned directly by /api/pipeline/run and updated
  // in the store from handleGenerateAndPost — no separate useEffect needed.
  const allDraftsInState = state.currentBrief?.drafts ?? [];
  const allTerminalInEffect =
    allDraftsInState.length > 0 &&
    allDraftsInState.every((d) => TERMINAL_STATES.includes(d.status));

  // ── Pipeline entry point ──────────────────────────────────────────────────
  // Single POST /api/pipeline/run replaces the old 3-step client-side loop.
  // All orchestration (brand voice, enrichment, QA, safety, publish, feedback)
  // happens server-side. The UI renders results from the returned payload.

  async function handleGenerateAndPost(brief: ContentBrief, publishAt?: string) {
    const briefId = Date.now().toString(36) + Math.random().toString(36).slice(2);

    // Create skeleton drafts so the pipeline tab shows "generating" immediately
    const skeletonDrafts: PlatformDraft[] = brief.selectedPlatforms.map((platform) => ({
      id: `${briefId}-${platform}`,
      platform,
      caption: "",
      hashtags: [],
      status: "generating" as PostStatus,
      scheduledAt: null,
      publishedAt: null,
      mockPlatformPostId: null,
      errorMessage: null,
      safetyFlagReason: null,
      safetySeverity: null,
      qaScore: null,
      qaVerdict: null,
      mediaUrl: null,
      mediaType: null,
    }));

    const postBrief: PostBrief = {
      ...brief,
      id: briefId,
      drafts: skeletonDrafts,
      createdAt: new Date().toISOString(),
    };

    dispatch({ type: "PIPELINE_STARTED", payload: postBrief });

    try {
      // ── Single server-side pipeline call ─────────────────────────────────
      // /api/pipeline/run orchestrates all agents: brand voice → enrichment →
      // content generation → QA → safety → account check → publish → feedback.
      const result = await runPipeline({ brief, dateRangeDays: 30, publishAt });

      // Map each platform result to the PIPELINE_RESULT_RECEIVED payload shape
      const completedPayload: PipelineCompletedPayload = {
        briefId: result.briefId,
        enrichment: result.enrichment
          ? { success: result.enrichment.success, summary: result.enrichment.summary }
          : null,
        platforms: result.platforms.map((p) => ({
          platform: p.platform,
          status: p.status,
          caption: p.caption,
          hashtags: p.hashtags,
          qa: p.qa
            ? { verdict: p.qa.verdict, overallScore: p.qa.overallScore, attempts: p.qa.attempts }
            : null,
          safety: p.safety,
          publish: p.publish,
          postId: p.postId,
          reason: p.reason,
          scheduledFor: p.scheduledFor,
        })),
        feedbackHints: result.feedbackHints,
      };

      dispatch({ type: "PIPELINE_RESULT_RECEIVED", payload: completedPayload });

      // ── Async feedback trigger ────────────────────────────────────────────
      // The pipeline no longer runs Steps 5–7. Trigger them now as a separate
      // non-blocking call. The UI shows "Feedback analysis running…" until done.
      if (result.feedbackScheduled) {
        setFeedbackPending(true);
        processFeedbackRun(30)
          .then((feedbackResult) => {
            setHints(feedbackResult.hints);
          })
          .catch(() => {
            // Non-critical — existing hints in the store are preserved
          })
          .finally(() => {
            setFeedbackPending(false);
          });
      }
    } catch (err) {
      // Catastrophic failure (network error, 500, etc.) — mark all platforms failed
      const message = err instanceof Error ? err.message : "Pipeline failed";
      for (const draft of skeletonDrafts) {
        dispatch({
          type: "PUBLISHING_FAILED",
          payload: { draftId: draft.id, errorMessage: message },
        });
      }
    }

    dispatch({ type: "SET_LOADING", payload: false });
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const allDrafts      = state.currentBrief?.drafts ?? [];
  const inProgressCount = allDrafts.filter((d) => !TERMINAL_STATES.includes(d.status)).length;
  const allTerminal    = allTerminalInEffect;
  const pipelineStage  = getPipelineStage(allDrafts);

  const publishedCount  = allDrafts.filter((d) => d.status === "published").length;
  const scheduledCount  = allDrafts.filter((d) => d.status === "scheduled").length;
  const blockedCount    = allDrafts.filter((d) => d.status === "blocked").length;
  const qaRejectedCount = allDrafts.filter((d) => d.status === "qa_rejected").length;
  const noAccountCount  = allDrafts.filter((d) => d.status === "no_account").length;
  const failedCount     = allDrafts.filter((d) => d.status === "failed").length;

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const tabs: { id: AutoPostingState["activeTab"]; label: string; badge?: number }[] = [
    { id: "setup",    label: "Setup"   },
    {
      id: "pipeline", label: "Pipeline",
      badge: inProgressCount > 0 ? inProgressCount : allDrafts.length > 0 ? allDrafts.length : undefined,
    },
    {
      id: "history",  label: "History",
      badge: state.history.length > 0 ? state.history.length : undefined,
    },
  ];

  return (
    <div className="p-8 text-gray-100 min-h-screen">
      <div className="max-w-5xl mx-auto">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-pink-400 mb-1.5">
            AI Social Media Manager
          </p>
          <h1 className="text-2xl font-bold text-gray-100 mb-1">Auto Posting</h1>
          <p className="text-sm text-gray-500 max-w-xl">
            Describe your content, choose platforms — the AI generates, safety-checks, and publishes automatically.
          </p>
        </div>

        {/* ── Pipeline stage indicator (only when pipeline running or done) ── */}
        {allDrafts.length > 0 && (
          <div className="mb-5">
            <StageIndicator stage={pipelineStage} />
          </div>
        )}

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="flex gap-0.5 mb-6 bg-gray-900/80 border border-gray-800/70 rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => dispatch({ type: "SET_ACTIVE_TAB", payload: tab.id })}
              className={[
                "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all duration-150",
                state.activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-200",
              ].join(" ")}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    state.activeTab === tab.id
                      ? "bg-indigo-500 text-white"
                      : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {state.error && (
          <div className="mb-5 bg-red-950/40 border border-red-800/50 text-red-300 rounded-xl px-4 py-3 text-sm flex items-start gap-2.5">
            <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>
            <span>{state.error}</span>
          </div>
        )}

        {/* ── SETUP TAB ───────────────────────────────────────────────────── */}
        {state.activeTab === "setup" && (
          <>
            <ConnectedAccountsPanel
              accounts={connectedAccounts}
              oauthSuccess={oauthSuccess}
              oauthError={oauthError}
            />
            <BriefForm onGenerate={handleGenerateAndPost} loading={state.loading} />
          </>
        )}

        {/* ── PIPELINE TAB ────────────────────────────────────────────────── */}
        {state.activeTab === "pipeline" && (
          <div>
            {allDrafts.length === 0 ? (
              // Empty pipeline state
              <div className="border border-dashed border-gray-800 rounded-xl p-10 text-center">
                <p className="text-gray-500 text-sm font-medium mb-1.5">No pipeline running</p>
                <p className="text-gray-700 text-xs mb-4">
                  Set up a brief to start generating content across your platforms.
                </p>
                <button
                  onClick={() => dispatch({ type: "SET_ACTIVE_TAB", payload: "setup" })}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Go to Setup
                </button>
              </div>
            ) : (
              <>
                {/* In-progress status */}
                {state.loading && inProgressCount > 0 && (
                  <div className="flex items-center gap-2 mb-4 text-sm text-indigo-300">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
                    Processing {inProgressCount} platform{inProgressCount !== 1 ? "s" : ""}…
                  </div>
                )}

                {/* Completion summary */}
                {allTerminal && (
                  <div className="mb-5 bg-gray-900 border border-gray-800/70 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-200 mb-1">Pipeline complete</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {publishedCount > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {publishedCount} published
                          </span>
                        )}
                        {scheduledCount > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-violet-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                            {scheduledCount} scheduled
                          </span>
                        )}
                        {blockedCount > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-amber-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            {blockedCount} safety blocked
                          </span>
                        )}
                        {qaRejectedCount > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-purple-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                            {qaRejectedCount} QA rejected
                          </span>
                        )}
                        {noAccountCount > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-sky-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                            {noAccountCount} no account
                            <a
                              href="/api/social/linkedin/start"
                              className="underline underline-offset-2 hover:text-sky-300 transition-colors"
                            >
                              → Connect
                            </a>
                          </span>
                        )}
                        {failedCount > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-red-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            {failedCount} failed
                          </span>
                        )}
                        {feedbackPending && (
                          <span className="flex items-center gap-1.5 text-xs text-indigo-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                            Feedback analysis running…
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => dispatch({ type: "CLEAR_BRIEF" })}
                      className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      + New Post
                    </button>
                  </div>
                )}

                {/* Platform cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {allDrafts.map((draft) => (
                    <PipelineStatusCard
                      key={draft.id}
                      draft={draft}
                      brief={state.currentBrief ?? undefined}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ─────────────────────────────────────────────────── */}
        {state.activeTab === "history" && (
          <PostHistoryFeed history={state.history} />
        )}
      </div>
    </div>
  );
}
