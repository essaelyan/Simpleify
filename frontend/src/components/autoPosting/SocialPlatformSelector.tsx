/**
 * SocialPlatformSelector
 *
 * Features:
 *  - Displays all 5 platforms with live connection status (fetched from /api/social/accounts)
 *  - Multi-select: any connected platform can be toggled; disconnected ones are disabled
 *  - Works in controlled mode (value + onChange) or uncontrolled (defaultSelected)
 *  - Optional publish integration: when publishContent is supplied, renders a publish
 *    button that calls /api/social/publish for every selected platform in parallel and
 *    shows per-platform status (publishing, published, failed, safety_blocked)
 */

import { useState, useEffect, useCallback } from "react";
import type { Platform } from "@/types/autoPosting";
import { PLATFORMS, PLATFORM_META } from "@/types/autoPosting";
import { fetchConnectedAccounts, publishToPlatform } from "@/api/social";
import type { ConnectedAccount } from "@/api/social";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface PublishContent {
  caption: string;
  hashtags: string[];
  mediaUrl: string;
}

export type PlatformPublishStatus =
  | "idle"
  | "publishing"
  | "published"
  | "failed"
  | "safety_blocked";

export interface PlatformResult {
  status: PlatformPublishStatus;
  platformPostId?: string;
  flagReason?: string;
  error?: string;
}

export interface SocialPlatformSelectorProps {
  /** Controlled selection. Omit to use uncontrolled mode. */
  value?: Platform[];
  /** Pre-selected platforms in uncontrolled mode. */
  defaultSelected?: Platform[];
  /** Fired on every selection change (both modes). */
  onChange?: (platforms: Platform[]) => void;
  /** When supplied, renders a "Publish" button wired to /api/social/publish. */
  publishContent?: PublishContent;
  /** Fired once all platforms have settled (published, failed, or blocked). */
  onPublishComplete?: (results: Record<string, PlatformResult>) => void;
  className?: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const STATUS_UI: Record<
  PlatformPublishStatus,
  { label: string; dot: string; badge: string }
> = {
  idle:           { label: "",             dot: "",                               badge: "" },
  publishing:     { label: "Publishing…",  dot: "bg-indigo-400 animate-pulse",    badge: "text-indigo-400 bg-indigo-900/40 border-indigo-800/50" },
  published:      { label: "Published",    dot: "bg-emerald-400",                 badge: "text-emerald-400 bg-emerald-900/40 border-emerald-800/50" },
  failed:         { label: "Failed",       dot: "bg-red-400",                     badge: "text-red-400 bg-red-900/40 border-red-800/50" },
  safety_blocked: { label: "Blocked",      dot: "bg-yellow-400",                  badge: "text-yellow-400 bg-yellow-900/40 border-yellow-800/50" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SocialPlatformSelector({
  value,
  defaultSelected = ["instagram", "facebook", "linkedin"],
  onChange,
  publishContent,
  onPublishComplete,
  className = "",
}: SocialPlatformSelectorProps) {
  // ── Account state ────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  // ── Selection state (uncontrolled fallback) ───────────────────────────────────
  const [internalSelected, setInternalSelected] = useState<Platform[]>(defaultSelected);
  const selected: Platform[] = value ?? internalSelected;

  // ── Publish state ─────────────────────────────────────────────────────────────
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<Partial<Record<Platform, PlatformResult>>>({});

  const accountByPlatform: Record<string, ConnectedAccount> = Object.fromEntries(
    accounts.map((a) => [a.platform, a])
  );

  const connectedCount = PLATFORMS.filter((p) => accountByPlatform[p]).length;
  const selectedConnected = selected.filter((p) => accountByPlatform[p]);
  const hasResults = Object.keys(results).length > 0;

  const publishedCount = Object.values(results).filter((r) => r?.status === "published").length;
  const failedCount = Object.values(results).filter(
    (r) => r?.status === "failed" || r?.status === "safety_blocked"
  ).length;

  // ── Load accounts on mount ────────────────────────────────────────────────────
  useEffect(() => {
    fetchConnectedAccounts()
      .then(setAccounts)
      .catch((err) =>
        setAccountsError(err instanceof Error ? err.message : "Failed to load accounts")
      )
      .finally(() => setLoadingAccounts(false));
  }, []);

  // ── Toggle platform selection ────────────────────────────────────────────────
  const togglePlatform = useCallback(
    (platform: Platform) => {
      if (!accountByPlatform[platform] || publishing) return;
      const next = selected.includes(platform)
        ? selected.filter((p) => p !== platform)
        : [...selected, platform];
      if (value === undefined) setInternalSelected(next);
      onChange?.(next);
    },
    [selected, value, accountByPlatform, onChange, publishing]
  );

  // ── Publish to all selected connected platforms ───────────────────────────────
  const handlePublish = useCallback(async () => {
    if (!publishContent || selectedConnected.length === 0 || publishing) return;

    setPublishing(true);
    // Optimistically mark all as publishing
    setResults(
      Object.fromEntries(selectedConnected.map((p) => [p, { status: "publishing" as const }]))
    );

    const finalResults: Record<string, PlatformResult> = {};

    await Promise.all(
      selectedConnected.map(async (platform) => {
        let result: PlatformResult;
        try {
          const res = await publishToPlatform({
            platform,
            caption: publishContent.caption,
            hashtags: publishContent.hashtags,
            media_url: publishContent.mediaUrl,
          });
          // publishToPlatform throws on error; if we reach here it succeeded.
          const status: PlatformPublishStatus = res.safetyBlocked
            ? "safety_blocked"
            : "published";
          result = {
            status,
            platformPostId: res.platform_post_id ?? undefined,
            flagReason: res.flagReason ?? undefined,
          };
        } catch (err) {
          result = {
            status: "failed",
            error: err instanceof Error ? err.message : "Publish failed",
          };
        }
        finalResults[platform] = result;
        // Progressive update — each card flips as soon as its request settles
        setResults((prev) => ({ ...prev, [platform]: result }));
      })
    );

    setPublishing(false);
    onPublishComplete?.(finalResults);
  }, [publishContent, selectedConnected, publishing, onPublishComplete]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={`bg-gray-900 border border-gray-700 rounded-xl p-5 ${className}`}>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Platforms</h3>
          {loadingAccounts ? (
            <p className="text-xs text-gray-500 mt-0.5">Loading accounts…</p>
          ) : accountsError ? (
            <p className="text-xs text-red-400 mt-0.5">{accountsError}</p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">
              {connectedCount} of {PLATFORMS.length} connected
              {selectedConnected.length > 0 && (
                <> · <span className="text-indigo-400">{selectedConnected.length} selected</span></>
              )}
            </p>
          )}
        </div>

        {/* Post-publish summary */}
        {hasResults && !publishing && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {publishedCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-800/50">
                {publishedCount} published
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-800/50">
                {failedCount} failed
              </span>
            )}
          </div>
        )}
      </div>

      {/* Platform grid */}
      {loadingAccounts ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PLATFORMS.map((p) => (
            <div key={p} className="h-[3.75rem] bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PLATFORMS.map((platform) => {
            const meta = PLATFORM_META[platform];
            const account = accountByPlatform[platform];
            const isConnected = Boolean(account);
            const isSelected = selected.includes(platform);
            const result = results[platform];
            const hasResult = result && result.status !== "idle";
            const statusUi = result ? STATUS_UI[result.status] : null;

            return (
              <button
                key={platform}
                type="button"
                onClick={() => togglePlatform(platform)}
                disabled={!isConnected || publishing}
                aria-pressed={isSelected}
                className={[
                  "relative flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border text-left transition-all duration-150 select-none",
                  isConnected && !publishing
                    ? "cursor-pointer"
                    : "cursor-not-allowed opacity-40",
                  isSelected && isConnected
                    ? "bg-indigo-950/60 border-indigo-600"
                    : "bg-gray-800 border-gray-700 hover:border-gray-600",
                ].join(" ")}
              >
                {/* Platform name row */}
                <div className="flex items-center gap-1.5">
                  <span className="text-base leading-none">{meta.icon}</span>
                  <span
                    className={`text-xs font-medium flex-1 ${
                      isConnected ? "text-gray-200" : "text-gray-500"
                    }`}
                  >
                    {meta.label}
                  </span>
                  {isSelected && isConnected && !hasResult && (
                    <span className="text-indigo-400 text-xs font-bold">✓</span>
                  )}
                  {hasResult && statusUi && statusUi.dot && (
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusUi.dot}`} />
                  )}
                </div>

                {/* Status / account handle row */}
                {hasResult && statusUi ? (
                  <span
                    className={`text-xs font-medium px-1.5 py-0.5 rounded-full border w-fit ${statusUi.badge}`}
                  >
                    {statusUi.label}
                  </span>
                ) : isConnected ? (
                  <span className="text-xs text-emerald-400 truncate">
                    {account.accountHandle ?? "Connected"}
                  </span>
                ) : (
                  <span className="text-xs text-gray-600">Not connected</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* No accounts banner */}
      {!loadingAccounts && !accountsError && connectedCount === 0 && (
        <p className="mt-3 text-xs text-gray-500 text-center py-2.5 border border-dashed border-gray-700 rounded-lg">
          No accounts connected — go to Settings to link your platforms.
        </p>
      )}

      {/* Publish button (only rendered when publishContent is provided) */}
      {publishContent && (
        <button
          type="button"
          onClick={handlePublish}
          disabled={selectedConnected.length === 0 || publishing || hasResults}
          className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          {publishing
            ? `Publishing to ${selectedConnected.length} platform${selectedConnected.length !== 1 ? "s" : ""}…`
            : hasResults
              ? "Done"
              : selectedConnected.length === 0
                ? "Select a platform to publish"
                : `Publish to ${selectedConnected.length} platform${selectedConnected.length !== 1 ? "s" : ""}`}
        </button>
      )}

      {/* Per-platform flag / error messages */}
      {hasResults && !publishing && (
        <div className="mt-3 space-y-1.5">
          {(Object.entries(results) as [Platform, PlatformResult][]).map(([platform, result]) => {
            const msg = result.flagReason ?? result.error;
            if (!msg) return null;
            return (
              <div
                key={platform}
                className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/50 rounded-lg px-3 py-2"
              >
                <span>{PLATFORM_META[platform].icon}</span>
                <span>
                  <span className="font-medium text-gray-300">{PLATFORM_META[platform].label}:</span>{" "}
                  {msg}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
