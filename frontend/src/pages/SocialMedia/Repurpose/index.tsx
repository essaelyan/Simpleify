/**
 * /SocialMedia/Repurpose
 *
 * Entry flow for turning long-form content into platform-native drafts.
 * Uses /api/ai/repurpose-content. Results are shown as draft cards and
 * can be published directly via /api/social/publish.
 *
 * This is a separate flow from the main pipeline (brief → generate → safety →
 * publish). Repurposed content is reviewed by the user before publish, so no
 * safety retry loop is needed — the single /api/social/publish call handles it.
 */

import { useState } from "react";
import type { Platform } from "@/types/autoPosting";
import { PLATFORMS, PLATFORM_META } from "@/types/autoPosting";
import {
  repurposeContent,
  SOURCE_TYPE_LABELS,
  type SourceType,
  type RepurposedPost,
} from "@/api/agents";
import { publishPost } from "@/api/autoPosting";

const SOURCE_TYPES: SourceType[] = [
  "blog",
  "youtube_transcript",
  "podcast",
  "article",
  "other",
];

// Per-post publish state
interface PostPublishState {
  loading: boolean;
  publishedAt: string | null;
  error: string | null;
}

export default function RepurposePage() {
  // ── Form state ────────────────────────────────────────────────────────────
  const [sourceContent, setSourceContent] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("blog");
  const [sourceTitle, setSourceTitle] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    "instagram",
    "linkedin",
    "twitter",
  ]);

  // ── Result state ──────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<RepurposedPost[] | null>(null);
  const [extractedHooks, setExtractedHooks] = useState<string[]>([]);
  const [repurposingNotes, setRepurposingNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Per-post publish tracking ─────────────────────────────────────────────
  const [publishState, setPublishState] = useState<Record<number, PostPublishState>>({});

  function togglePlatform(p: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function handleRepurpose() {
    if (!sourceContent.trim() || !targetAudience.trim() || !callToAction.trim()) return;
    setLoading(true);
    setError(null);
    setPosts(null);
    setPublishState({});
    try {
      const result = await repurposeContent({
        sourceContent,
        sourceType,
        targetAudience,
        callToAction,
        sourceTitle: sourceTitle.trim() || undefined,
        targetPlatforms: selectedPlatforms,
      });
      setPosts(result.posts);
      setExtractedHooks(result.extractedHooks);
      setRepurposingNotes(result.repurposingNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Repurposing failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(post: RepurposedPost, idx: number) {
    setPublishState((prev) => ({
      ...prev,
      [idx]: { loading: true, publishedAt: null, error: null },
    }));
    try {
      const result = await publishPost({
        draftId: `repurpose-${idx}-${Date.now()}`,
        platform: post.platform,
        caption: post.caption,
        hashtags: post.hashtags,
        scheduledAt: null,
        mediaUrl: null,
      });
      if (result.success && result.publishedAt) {
        setPublishState((prev) => ({
          ...prev,
          [idx]: { loading: false, publishedAt: result.publishedAt, error: null },
        }));
      } else {
        setPublishState((prev) => ({
          ...prev,
          [idx]: {
            loading: false,
            publishedAt: null,
            error: result.errorMessage ?? "Publish failed",
          },
        }));
      }
    } catch (err) {
      setPublishState((prev) => ({
        ...prev,
        [idx]: {
          loading: false,
          publishedAt: null,
          error: err instanceof Error ? err.message : "Publish failed",
        },
      }));
    }
  }

  const canSubmit =
    sourceContent.trim().length > 0 &&
    targetAudience.trim().length > 0 &&
    callToAction.trim().length > 0 &&
    selectedPlatforms.length > 0 &&
    !loading;

  return (
    <div className="p-8 text-gray-100">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <p className="text-xs font-semibold uppercase tracking-widest text-pink-400 mb-2">
          AI Social Media Manager
        </p>
        <h1 className="text-3xl font-bold mb-1">Repurpose Content</h1>
        <p className="text-gray-400 mb-8">
          Paste any long-form content and get platform-native posts — each adapted to the
          platform&apos;s format, not just truncated.
        </p>

        {/* ── Form ── */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 space-y-5">
          {/* Source type + title */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Content Type
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SOURCE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Title <span className="text-gray-500">(optional)</span>
              </label>
              <input
                type="text"
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
                placeholder="e.g. How We Grew 3x in 6 Months"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Source content */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Source Content <span className="text-red-400">*</span>
            </label>
            <textarea
              value={sourceContent}
              onChange={(e) => setSourceContent(e.target.value)}
              placeholder="Paste your blog post, transcript, article, or any long-form content here…"
              rows={10}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-y"
            />
            <p className="text-xs text-gray-600 mt-1">
              {sourceContent.length.toLocaleString()} chars
              {sourceContent.length > 6000 && (
                <span className="text-yellow-500 ml-2">
                  — will be truncated to first 6,000 chars
                </span>
              )}
            </p>
          </div>

          {/* Audience + CTA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Target Audience <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. Early-stage startup founders"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Call to Action <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
                placeholder="e.g. Read the full case study"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Platform toggles */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Platforms <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const m = PLATFORM_META[p];
                const active = selectedPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      active
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    <span>{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleRepurpose}
            disabled={!canSubmit}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Repurposing…" : "Repurpose Content"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {/* ── Results ── */}
        {posts && posts.length > 0 && (
          <div className="mt-8 space-y-6">
            {/* Extracted hooks */}
            {extractedHooks.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-3">
                  Top Hook-Worthy Ideas
                </p>
                <ol className="space-y-2">
                  {extractedHooks.map((hook, i) => (
                    <li key={i} className="flex gap-3 text-sm text-gray-300">
                      <span className="text-indigo-500 font-semibold shrink-0">{i + 1}.</span>
                      <span className="leading-relaxed">"{hook}"</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Strategy notes */}
            {repurposingNotes && (
              <p className="text-sm text-gray-400 leading-relaxed px-1">{repurposingNotes}</p>
            )}

            {/* Per-platform draft cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {posts.map((post, idx) => {
                const m = PLATFORM_META[post.platform];
                const ps = publishState[idx];
                return (
                  <div
                    key={idx}
                    className="bg-gray-900 border border-gray-700 rounded-xl p-5 flex flex-col gap-3"
                  >
                    {/* Platform header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{m.icon}</span>
                        <span className={`text-sm font-semibold ${m.color}`}>{m.label}</span>
                      </div>
                      {ps?.publishedAt ? (
                        <span className="text-xs text-emerald-400 font-medium">Published ✓</span>
                      ) : null}
                    </div>

                    {/* Angle + takeaway */}
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">
                        <span className="font-medium text-gray-400">Angle: </span>
                        {post.contentAngle}
                      </p>
                      <p className="text-xs text-gray-500">
                        <span className="font-medium text-gray-400">Key idea: </span>
                        {post.keyTakeaway}
                      </p>
                    </div>

                    {/* Caption */}
                    <p className="text-sm text-gray-200 leading-relaxed">{post.caption}</p>

                    {/* Hashtags */}
                    {post.hashtags.length > 0 && (
                      <p className="text-xs text-gray-600 truncate">
                        {post.hashtags.map((h) => `#${h}`).join(" ")}
                      </p>
                    )}

                    {/* Char count */}
                    <p className={`text-xs ${
                      post.caption.length > m.maxChars ? "text-red-400" : "text-gray-600"
                    }`}>
                      {post.caption.length} / {m.maxChars} chars
                    </p>

                    {/* Error */}
                    {ps?.error && (
                      <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-2 py-1.5">
                        {ps.error}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-auto pt-1">
                      {ps?.publishedAt ? (
                        <p className="text-xs text-emerald-400">
                          {new Date(ps.publishedAt).toLocaleString()}
                        </p>
                      ) : (
                        <button
                          onClick={() => handlePublish(post, idx)}
                          disabled={ps?.loading}
                          className="flex-1 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-1.5 rounded-lg transition-colors"
                        >
                          {ps?.loading ? "Publishing…" : "Publish"}
                        </button>
                      )}
                      <button
                        onClick={() => navigator.clipboard.writeText(post.caption)}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-3 py-1.5 bg-gray-800 rounded-lg border border-gray-700"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
