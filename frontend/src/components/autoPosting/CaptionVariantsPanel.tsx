/**
 * CaptionVariantsPanel.tsx
 *
 * Inline panel rendered inside a completed PipelineStatusCard.
 * Calls /api/ai/caption-variants and shows 3 scored alternatives.
 * The "Publish this variant" button calls /api/social/publish directly —
 * it bypasses regeneration since the user has already reviewed the content.
 */

import { useState } from "react";
import type { PlatformDraft, ContentBrief } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";
import { getCaptionVariants, type CaptionVariant } from "@/api/agents";
import { publishPost } from "@/api/autoPosting";

interface CaptionVariantsPanelProps {
  draft: PlatformDraft;
  brief: ContentBrief;
  onClose: () => void;
}

const SCORE_COLOR = (n: number) =>
  n >= 8 ? "text-emerald-400" : n >= 6 ? "text-yellow-400" : "text-red-400";

export default function CaptionVariantsPanel({
  draft,
  brief,
  onClose,
}: CaptionVariantsPanelProps) {
  const [variants, setVariants] = useState<CaptionVariant[] | null>(null);
  const [recommendation, setRecommendation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-variant publish state
  const [publishingIdx, setPublishingIdx] = useState<number | null>(null);
  const [publishedIdx, setPublishedIdx] = useState<number | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const meta = PLATFORM_META[draft.platform];

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setVariants(null);
    setPublishedIdx(null);
    setPublishError(null);
    try {
      const result = await getCaptionVariants(
        draft.platform,
        draft.caption,
        draft.hashtags,
        {
          topic: brief.topic,
          tone: brief.tone,
          targetAudience: brief.targetAudience,
          callToAction: brief.callToAction,
        }
      );
      setVariants(result.variants);
      setRecommendation(result.recommendation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Variant generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePublishVariant(variant: CaptionVariant, idx: number) {
    setPublishingIdx(idx);
    setPublishError(null);
    try {
      const result = await publishPost({
        draftId: `${draft.id}-variant-${idx}`,
        platform: draft.platform,
        caption: variant.caption,
        hashtags: variant.hashtags,
        scheduledAt: null,
        mediaUrl: draft.mediaUrl,
      });
      if (result.success) {
        setPublishedIdx(idx);
      } else {
        setPublishError(result.errorMessage ?? "Publish failed");
      }
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setPublishingIdx(null);
    }
  }

  return (
    <div className="mt-3 border-t border-gray-700 pt-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">
          Caption Variants (A/B)
        </span>
        <button
          onClick={onClose}
          className="text-gray-600 hover:text-gray-400 text-xs transition-colors"
        >
          Close
        </button>
      </div>

      {!variants && !loading && (
        <button
          onClick={handleGenerate}
          className="w-full text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg transition-colors"
        >
          Generate 3 Variants
        </button>
      )}

      {loading && (
        <div className="space-y-2 py-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {variants && (
        <div className="space-y-3">
          {/* Recommendation banner */}
          {recommendation && (
            <div className="text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 rounded-lg px-3 py-2 leading-relaxed">
              <span className="font-semibold">Recommended: </span>{recommendation}
            </div>
          )}

          {variants.map((v, idx) => (
            <div
              key={idx}
              className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-2"
            >
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">
                  Variant {idx + 1} — {v.angle}
                </span>
                <span className={`text-xs font-bold ${SCORE_COLOR(v.scores.overall)}`}>
                  {v.scores.overall}/10
                </span>
              </div>

              {/* Hook */}
              <p className="text-xs text-gray-500 italic">{v.hook}</p>

              {/* Caption preview */}
              <p className="text-xs text-gray-200 leading-relaxed line-clamp-4">
                {v.caption}
              </p>

              {/* Hashtags */}
              {v.hashtags.length > 0 && (
                <p className="text-xs text-gray-600 truncate">
                  {v.hashtags.map((h) => `#${h}`).join(" ")}
                </p>
              )}

              {/* Scores */}
              <div className="flex gap-3 text-xs">
                <span>
                  Engage{" "}
                  <span className={SCORE_COLOR(v.scores.engagementPotential)}>
                    {v.scores.engagementPotential}
                  </span>
                </span>
                <span>
                  Clarity{" "}
                  <span className={SCORE_COLOR(v.scores.clarity)}>
                    {v.scores.clarity}
                  </span>
                </span>
                <span>
                  CTA{" "}
                  <span className={SCORE_COLOR(v.scores.ctaStrength)}>
                    {v.scores.ctaStrength}
                  </span>
                </span>
              </div>

              {/* Reasoning */}
              <p className="text-xs text-gray-500 leading-relaxed">{v.reasoning}</p>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {publishedIdx === idx ? (
                  <span className="text-xs text-emerald-400 font-medium">
                    ✓ Published to {meta.label}
                  </span>
                ) : (
                  <button
                    onClick={() => handlePublishVariant(v, idx)}
                    disabled={publishingIdx !== null || publishedIdx !== null}
                    className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-3 py-1 rounded-lg transition-colors"
                  >
                    {publishingIdx === idx ? "Publishing…" : "Publish this variant"}
                  </button>
                )}
                <button
                  onClick={() => navigator.clipboard.writeText(v.caption)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1"
                >
                  Copy
                </button>
              </div>
            </div>
          ))}

          {publishError && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
              {publishError}
            </p>
          )}

          <button
            onClick={handleGenerate}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Regenerate variants
          </button>
        </div>
      )}
    </div>
  );
}
