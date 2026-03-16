/**
 * HashtagResearchPanel.tsx
 *
 * Inline panel rendered inside a completed PipelineStatusCard.
 * Calls /api/ai/hashtag-research for the draft's platform and shows
 * recommended hashtags with volume tiers, the platform strategy, and
 * a list of tags to avoid. Designed to inform future posts; hashtags
 * can be copied individually or as a full set.
 */

import { useState } from "react";
import type { PlatformDraft, ContentBrief } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";
import { getHashtagResearch, type PlatformHashtagSet } from "@/api/agents";

interface HashtagResearchPanelProps {
  draft: PlatformDraft;
  brief: ContentBrief;
  onClose: () => void;
}

const TIER_STYLES: Record<string, string> = {
  niche:  "bg-emerald-900/40 text-emerald-400 border border-emerald-800/40",
  medium: "bg-yellow-900/40 text-yellow-400 border border-yellow-800/40",
  broad:  "bg-orange-900/40 text-orange-400 border border-orange-800/40",
};

export default function HashtagResearchPanel({
  draft,
  brief,
  onClose,
}: HashtagResearchPanelProps) {
  const [result, setResult] = useState<PlatformHashtagSet | null>(null);
  const [crossPlatform, setCrossPlatform] = useState<string[]>([]);
  const [strategyNotes, setStrategyNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const meta = PLATFORM_META[draft.platform];

  async function handleResearch() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const data = await getHashtagResearch({
        topic: brief.topic,
        niche: brief.topic, // use topic as niche fallback when no separate niche field exists
        targetAudience: brief.targetAudience || "general audience",
        targetPlatforms: [draft.platform],
        excludeHashtags: draft.hashtags, // exclude already-used hashtags
      });
      const platformData = data.platformHashtags.find(
        (p) => p.platform === draft.platform
      );
      if (platformData) {
        setResult(platformData);
        setCrossPlatform(data.crossPlatformCore);
        setStrategyNotes(data.strategyNotes);
      } else {
        throw new Error("No hashtags returned for this platform");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hashtag research failed");
    } finally {
      setLoading(false);
    }
  }

  function copyAll() {
    if (!result) return;
    const text = result.recommended.map((h) => `#${h.tag}`).join(" ");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-3 border-t border-gray-700 pt-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-violet-400 uppercase tracking-wide">
          Hashtag Research — {meta.label}
        </span>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-xs transition-colors"
        >
          Close
        </button>
      </div>

      {!result && !loading && (
        <button
          onClick={handleResearch}
          className="w-full text-sm bg-violet-700 hover:bg-violet-600 text-white font-medium py-2 rounded-lg transition-colors"
        >
          Research Hashtags for {meta.label}
        </button>
      )}

      {loading && (
        <div className="space-y-2 py-1">
          <div className="h-4 bg-gray-800 rounded animate-pulse w-3/4" />
          <div className="h-4 bg-gray-800 rounded animate-pulse w-full" />
          <div className="h-4 bg-gray-800 rounded animate-pulse w-2/3" />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-3">
          {/* Strategy sentence */}
          <p className="text-xs text-gray-400 leading-relaxed">{result.strategy}</p>

          {/* Recommended hashtags */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-400">
                Recommended ({result.recommended.length})
              </span>
              <button
                onClick={copyAll}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {copied ? "Copied!" : "Copy all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.recommended.map((h) => (
                <button
                  key={h.tag}
                  onClick={() => navigator.clipboard.writeText(`#${h.tag}`)}
                  title={h.relevanceReason}
                  className="group flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500 transition-colors"
                >
                  <span
                    className={`text-[10px] font-semibold px-1 py-0.5 rounded ${TIER_STYLES[h.volumeTier]}`}
                  >
                    {h.volumeTier[0].toUpperCase()}
                  </span>
                  #{h.tag}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">
              N = niche · M = medium · B = broad — click to copy
            </p>
          </div>

          {/* Cross-platform core */}
          {crossPlatform.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Cross-platform core</p>
              <div className="flex flex-wrap gap-1">
                {crossPlatform.map((t) => (
                  <span
                    key={t}
                    className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Avoid list */}
          {result.avoidList.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-500 mb-1">Avoid these tags</p>
              <div className="flex flex-wrap gap-1">
                {result.avoidList.map((t) => (
                  <span
                    key={t}
                    className="text-xs text-red-400/70 bg-red-950/30 px-2 py-0.5 rounded-full line-through"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Overall strategy note */}
          {strategyNotes && (
            <p className="text-xs text-gray-500 leading-relaxed border-t border-gray-700 pt-2">
              {strategyNotes}
            </p>
          )}

          <button
            onClick={handleResearch}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Re-research
          </button>
        </div>
      )}
    </div>
  );
}
