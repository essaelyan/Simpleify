import { useState } from "react";
import type { ContentBrief, Platform } from "@/types/autoPosting";
import { PLATFORMS, PLATFORM_META } from "@/types/autoPosting";
import { useOptimizationStore } from "@/store/optimizationStore";

interface BriefFormProps {
  onGenerate: (brief: ContentBrief) => void;
  loading: boolean;
}

const TONE_OPTIONS: { value: ContentBrief["tone"]; label: string; emoji: string }[] = [
  { value: "professional",   label: "Professional",   emoji: "💼" },
  { value: "casual",         label: "Casual",         emoji: "😊" },
  { value: "humorous",       label: "Humorous",       emoji: "😄" },
  { value: "inspirational",  label: "Inspirational",  emoji: "✨" },
  { value: "educational",    label: "Educational",    emoji: "📚" },
];

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  num,
  title,
  aside,
  children,
}: {
  num: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800/80 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/60">
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] font-bold text-gray-600 tabular-nums tracking-widest">{num}</span>
          <span className="text-sm font-semibold text-gray-200">{title}</span>
        </div>
        {aside}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BriefForm({ onGenerate, loading }: BriefFormProps) {
  const [topic, setTopic]                     = useState("");
  const [tone, setTone]                       = useState<ContentBrief["tone"]>("professional");
  const [targetAudience, setTargetAudience]   = useState("");
  const [callToAction, setCallToAction]       = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    "instagram", "facebook", "linkedin",
  ]);
  const { hints, isEnabled, toggleEnabled } = useOptimizationStore();
  const activeHints = isEnabled ? hints : null;

  function togglePlatform(platform: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  }

  function handleSubmit() {
    if (!topic.trim() || selectedPlatforms.length === 0) return;
    const brief: ContentBrief = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      topic: topic.trim(),
      tone,
      targetAudience: targetAudience.trim(),
      callToAction: callToAction.trim(),
      selectedPlatforms,
      sourceContentId: null,
      safetyFeedback: null,
      optimizationHints: activeHints,
      enrichment: null,
      qaRevisionGuidance: null,
    };
    onGenerate(brief);
  }

  const canSubmit = topic.trim().length > 0 && selectedPlatforms.length > 0 && !loading;

  return (
    <div className="space-y-3">

      {/* ── 01 Content Brief ────────────────────────────────────────────────── */}
      <Section num="01" title="Content Brief">
        <div className="space-y-4">

          {/* Topic */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Topic <span className="text-red-400 normal-case tracking-normal font-normal">*</span>
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Summer sale — 30% off all products this weekend"
              rows={2}
              className="w-full bg-gray-800/60 border border-gray-700/80 rounded-lg px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 resize-none transition-colors"
            />
          </div>

          {/* Tone */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Tone
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TONE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTone(opt.value)}
                  className={[
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150",
                    tone === opt.value
                      ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300"
                      : "bg-gray-800/50 border-gray-700/60 text-gray-500 hover:border-gray-600 hover:text-gray-300",
                  ].join(" ")}
                >
                  <span>{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Audience + CTA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Audience
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. Women 25–34, fashion"
                className="w-full bg-gray-800/60 border border-gray-700/80 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Call to Action
              </label>
              <input
                type="text"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
                placeholder="e.g. Shop now, link in bio"
                className="w-full bg-gray-800/60 border border-gray-700/80 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ── 02 Platforms ────────────────────────────────────────────────────── */}
      <Section
        num="02"
        title="Platforms"
        aside={
          selectedPlatforms.length > 0 ? (
            <span className="text-xs text-indigo-400 font-semibold">
              {selectedPlatforms.length} selected
            </span>
          ) : (
            <span className="text-xs text-red-400/70 font-medium">Select at least one</span>
          )
        }
      >
        <div className="grid grid-cols-5 gap-2">
          {PLATFORMS.map((platform) => {
            const meta = PLATFORM_META[platform];
            const isSelected = selectedPlatforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                onClick={() => togglePlatform(platform)}
                className={[
                  "flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-all duration-150",
                  isSelected
                    ? "bg-indigo-600/15 border-indigo-500/40 shadow-inner"
                    : "bg-gray-800/50 border-gray-700/50 hover:border-gray-600 hover:bg-gray-800",
                ].join(" ")}
              >
                <span className="text-xl leading-none">{meta.icon}</span>
                <span className={`text-[10px] font-semibold leading-tight ${isSelected ? "text-indigo-300" : "text-gray-500"}`}>
                  {meta.label.split(" ")[0]}
                </span>
                {isSelected && (
                  <span className="text-[9px] font-bold text-indigo-400 leading-none">✓</span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── 03 AI Settings ──────────────────────────────────────────────────── */}
      <Section
        num="03"
        title="AI Settings"
        aside={
          <div className="flex items-center gap-2.5">
            {hints && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                isEnabled
                  ? "bg-indigo-900/40 text-indigo-400 border-indigo-800/50"
                  : "bg-gray-800 text-gray-600 border-gray-700"
              }`}>
                {isEnabled ? "On" : "Off"}
              </span>
            )}
            <button
              type="button"
              onClick={toggleEnabled}
              disabled={!hints}
              aria-label="Toggle AI Insights"
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                isEnabled && hints ? "bg-indigo-600" : "bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  isEnabled && hints ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${
            hints && isEnabled
              ? "bg-indigo-600/20 text-indigo-400"
              : "bg-gray-800 text-gray-600"
          }`}>
            ✦
          </div>
          <div>
            <p className={`text-sm font-semibold mb-0.5 ${hints && isEnabled ? "text-gray-200" : "text-gray-400"}`}>
              Feedback Loop Insights
            </p>
            <p className="text-xs text-gray-600 leading-relaxed">
              {hints
                ? isEnabled
                  ? "Performance data from your recent posts is being used to guide content generation."
                  : "AI insights available — toggle on to use them in the next generation."
                : "No performance data yet. Insights appear after your first campaign completes."}
            </p>
          </div>
        </div>
      </Section>

      {/* ── Generate button ─────────────────────────────────────────────────── */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={[
          "w-full flex items-center justify-center gap-2.5 font-semibold px-6 py-3 rounded-xl text-sm transition-all duration-150",
          canSubmit
            ? "bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-900/40"
            : "bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700/60",
        ].join(" ")}
      >
        {loading ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Running pipeline…</span>
          </>
        ) : (
          <>
            <span>Generate &amp; Auto-Post</span>
            <span className={canSubmit ? "text-indigo-300" : "text-gray-600"}>→</span>
          </>
        )}
      </button>
    </div>
  );
}
