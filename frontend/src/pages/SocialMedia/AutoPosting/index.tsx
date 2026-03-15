import { useEffect, useReducer } from "react";
import type {
  AutoPostingAction,
  AutoPostingState,
  ContentBrief,
  PlatformDraft,
  PostBrief,
  PostStatus,
} from "@/types/autoPosting";
import { generateContent, checkSafetyAdvanced, publishPost } from "@/api/autoPosting";
import { fetchLatestHints, optimizeContent } from "@/api/feedbackLoop";
import { useOptimizationStore } from "@/store/optimizationStore";
import BriefForm from "@/components/autoPosting/BriefForm";
import PipelineStatusCard from "@/components/autoPosting/PipelineStatusCard";
import PostHistoryFeed from "@/components/autoPosting/PostHistoryFeed";

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

    case "CLEAR_BRIEF":
      return { ...state, currentBrief: null, activeTab: "setup" };

    default:
      return state;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TERMINAL_STATES: PostStatus[] = ["published", "blocked", "failed"];

export default function AutoPostingPage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const setHints = useOptimizationStore((s) => s.setHints);
  const lastFetchedAt = useOptimizationStore((s) => s.lastFetchedAt);

  // ── On mount: sync latest DB snapshot into the store ─────────────────────
  useEffect(() => {
    async function syncLatestHints() {
      try {
        const hints = await fetchLatestHints();
        if (!hints) return;
        // Only overwrite if DB snapshot is newer than what's in localStorage
        if (!lastFetchedAt || hints.generatedAt > lastFetchedAt) {
          setHints(hints);
        }
      } catch {
        // Non-critical — store keeps its last known value
      }
    }
    syncLatestHints();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ── After every pipeline run: regenerate optimization hints ──────────────
  const allDraftsInState = state.currentBrief?.drafts ?? [];
  const allTerminalInEffect =
    allDraftsInState.length > 0 &&
    allDraftsInState.every((d) => TERMINAL_STATES.includes(d.status));

  useEffect(() => {
    if (!allTerminalInEffect) return;
    async function runFeedbackLoop() {
      try {
        const result = await optimizeContent({ dateRangeDays: 30 });
        if (result.hints) setHints(result.hints);
      } catch {
        // Non-critical — generation still succeeded
      }
    }
    runFeedbackLoop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTerminalInEffect]);

  // ── Pipeline entry point ──────────────────────────────────────────────────

  async function handleGenerateAndPost(brief: ContentBrief) {
    const briefId = Date.now().toString(36) + Math.random().toString(36).slice(2);

    // Build skeleton PostBrief with all drafts at "generating"
    const skeletonDrafts: PlatformDraft[] = brief.selectedPlatforms.map((platform) => ({
      id: `${briefId}-${platform}`,
      platform,
      caption: "",
      hashtags: [],
      status: "generating",
      scheduledAt: null,
      publishedAt: null,
      errorMessage: null,
      safetyFlagReason: null,
      safetySeverity: null,
      mediaUrl: null,
      mediaType: null,
    }));

    const postBrief: PostBrief = {
      ...brief,
      id: briefId,
      drafts: skeletonDrafts,
      createdAt: new Date().toISOString(),
    };

    // Switch to pipeline tab immediately
    dispatch({ type: "PIPELINE_STARTED", payload: postBrief });

    // ── Step 1: Batch generate all platform captions ──────────────────────

    let generatedPlatforms: Array<{ draftId: string; caption: string; hashtags: string[] }>;
    try {
      const result = await generateContent(brief);
      generatedPlatforms = result.platforms.map((p) => ({
        draftId: `${briefId}-${p.platform}`,
        caption: p.caption,
        hashtags: p.hashtags,
      }));
      for (const gp of generatedPlatforms) {
        dispatch({ type: "CONTENT_GENERATED", payload: gp });
      }
    } catch (err) {
      // Fail all drafts if batch generation fails
      for (const draft of skeletonDrafts) {
        dispatch({
          type: "PUBLISHING_FAILED",
          payload: {
            draftId: draft.id,
            errorMessage: err instanceof Error ? err.message : "Content generation failed",
          },
        });
      }
      dispatch({ type: "SET_LOADING", payload: false });
      return;
    }

    // ── Step 2: Safety check (with 1-retry feedback loop) + publish ───────

    for (const gp of generatedPlatforms) {
      const draft = skeletonDrafts.find((d) => d.id === gp.draftId)!;

      let currentCaption = gp.caption;
      let currentHashtags = gp.hashtags;
      let safetyPassed = false;

      for (let attempt = 0; attempt < 2; attempt++) {
        dispatch({ type: "SAFETY_CHECK_STARTED", payload: { draftId: gp.draftId } });

        let safetyResult;
        try {
          safetyResult = await checkSafetyAdvanced({
            draftId: gp.draftId,
            platform: draft.platform,
            caption: currentCaption,
            hashtags: currentHashtags,
            brandVoice: null,
            recentCaptions: [],
          });
        } catch {
          dispatch({
            type: "PUBLISHING_FAILED",
            payload: {
              draftId: gp.draftId,
              errorMessage: "Safety check unavailable — please try again",
            },
          });
          break;
        }

        if (safetyResult.safe) {
          safetyPassed = true;
          break;
        }

        // Failed — try a 1-time regeneration with hints
        if (attempt === 0 && safetyResult.regenerationHints !== null) {
          dispatch({ type: "REGENERATION_STARTED", payload: { draftId: gp.draftId } });
          try {
            const retryBrief = {
              ...brief,
              selectedPlatforms: [draft.platform] as typeof brief.selectedPlatforms,
              safetyFeedback: safetyResult.regenerationHints,
            };
            const retryResult = await generateContent(retryBrief);
            const retryContent = retryResult.platforms[0];
            currentCaption = retryContent.caption;
            currentHashtags = retryContent.hashtags;
            dispatch({
              type: "CONTENT_GENERATED",
              payload: {
                draftId: gp.draftId,
                caption: currentCaption,
                hashtags: currentHashtags,
              },
            });
          } catch {
            // Regeneration failed → block immediately
            dispatch({
              type: "SAFETY_CHECK_BLOCKED",
              payload: {
                draftId: gp.draftId,
                flagReason: safetyResult.flagReason ?? "Content policy violation",
                severity: safetyResult.severity ?? "medium",
              },
            });
            break;
          }
          continue; // loop to re-run safety check on new content
        }

        // No hints or second attempt failed → block
        dispatch({
          type: "SAFETY_CHECK_BLOCKED",
          payload: {
            draftId: gp.draftId,
            flagReason: safetyResult.flagReason ?? "Content policy violation",
            severity: safetyResult.severity ?? "medium",
          },
        });
        break;
      }

      if (!safetyPassed) continue;

      // Safety passed → publish
      dispatch({ type: "SAFETY_CHECK_PASSED", payload: { draftId: gp.draftId } });
      dispatch({ type: "PUBLISHING_STARTED", payload: { draftId: gp.draftId } });

      try {
        const pubResult = await publishPost({
          draftId: gp.draftId,
          platform: draft.platform,
          caption: currentCaption,
          hashtags: currentHashtags,
          scheduledAt: null,
          mediaUrl: null,
        });

        if (pubResult.success && pubResult.publishedAt) {
          dispatch({
            type: "PUBLISHING_SUCCESS",
            payload: {
              draftId: gp.draftId,
              publishedAt: pubResult.publishedAt,
              mockPlatformPostId: pubResult.mockPlatformPostId ?? "",
            },
          });
        } else {
          dispatch({
            type: "PUBLISHING_FAILED",
            payload: {
              draftId: gp.draftId,
              errorMessage: pubResult.errorMessage ?? "Publish failed",
            },
          });
        }
      } catch (err) {
        dispatch({
          type: "PUBLISHING_FAILED",
          payload: {
            draftId: gp.draftId,
            errorMessage: err instanceof Error ? err.message : "Publish failed",
          },
        });
      }
    }

    dispatch({ type: "SET_LOADING", payload: false });
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const allDrafts = state.currentBrief?.drafts ?? [];
  const inProgressCount = allDrafts.filter(
    (d) => !TERMINAL_STATES.includes(d.status)
  ).length;
  const allTerminal = allTerminalInEffect;

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const tabs: { id: AutoPostingState["activeTab"]; label: string; badge?: number }[] = [
    { id: "setup", label: "Setup" },
    {
      id: "pipeline",
      label: "Pipeline",
      badge: inProgressCount > 0 ? inProgressCount : allDrafts.length > 0 ? allDrafts.length : undefined,
    },
    {
      id: "history",
      label: "History",
      badge: state.history.length > 0 ? state.history.length : undefined,
    },
  ];

  return (
    <div className="p-8 text-gray-100">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400 mb-2">
          AI Social Media Manager
        </p>
        <h1 className="text-3xl font-bold mb-1">Auto Posting</h1>
        <p className="text-gray-400 mb-8">
          AI generates content, runs a safety filter, and publishes automatically — no manual steps.
        </p>

        {/* Workflow diagram */}
        <div className="flex items-center gap-2 mb-8 text-xs text-gray-500 font-medium">
          <span className="bg-gray-900 border border-gray-700 px-3 py-1.5 rounded-lg">✏️ Brief</span>
          <span className="text-gray-700">→</span>
          <span className="bg-gray-900 border border-gray-700 px-3 py-1.5 rounded-lg">🤖 AI Generate</span>
          <span className="text-gray-700">→</span>
          <span className="bg-gray-900 border border-gray-700 px-3 py-1.5 rounded-lg">🛡️ Safety Filter</span>
          <span className="text-gray-700">→</span>
          <span className="bg-gray-900 border border-gray-700 px-3 py-1.5 rounded-lg">🚀 Auto-Post</span>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-8 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => dispatch({ type: "SET_ACTIVE_TAB", payload: tab.id })}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                state.activeTab === tab.id
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    state.activeTab === tab.id
                      ? "bg-indigo-500 text-white"
                      : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {state.error && (
          <div className="mb-6 bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-4 text-sm">
            {state.error}
          </div>
        )}

        {/* ── SETUP TAB ── */}
        {state.activeTab === "setup" && (
          <BriefForm onGenerate={handleGenerateAndPost} loading={state.loading} />
        )}

        {/* ── PIPELINE TAB ── */}
        {state.activeTab === "pipeline" && (
          <div>
            {allDrafts.length === 0 ? (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center">
                <p className="text-gray-400 text-sm mb-3">
                  No pipeline running. Go to Setup to start.
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
                {/* Status summary */}
                {state.loading && inProgressCount > 0 && (
                  <div className="flex items-center gap-2 mb-6 text-sm text-indigo-300">
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                    Processing {inProgressCount} platform{inProgressCount !== 1 ? "s" : ""}…
                  </div>
                )}
                {allTerminal && (
                  <div className="flex items-center gap-2 mb-6 text-sm text-emerald-400">
                    <span>✓</span>
                    Pipeline complete — {allDrafts.filter((d) => d.status === "published").length} published,{" "}
                    {allDrafts.filter((d) => d.status === "blocked").length} blocked,{" "}
                    {allDrafts.filter((d) => d.status === "failed").length} failed
                  </div>
                )}

                {/* Pipeline cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allDrafts.map((draft) => (
                    <PipelineStatusCard key={draft.id} draft={draft} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {state.activeTab === "history" && (
          <PostHistoryFeed history={state.history} />
        )}

        {/* New post CTA — only when pipeline is fully complete */}
        {allTerminal && state.activeTab !== "setup" && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={() => dispatch({ type: "CLEAR_BRIEF" })}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              + Start new post
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
