import { useState } from "react";
import type { ContentBrief, Platform } from "@/types/autoPosting";
import { PLATFORMS, PLATFORM_META } from "@/types/autoPosting";
import { useOptimizationStore } from "@/store/optimizationStore";

interface BriefFormProps {
  onGenerate: (brief: ContentBrief) => void;
  loading: boolean;
}

const TONE_OPTIONS: ContentBrief["tone"][] = [
  "professional",
  "casual",
  "humorous",
  "inspirational",
  "educational",
];

export default function BriefForm({ onGenerate, loading }: BriefFormProps) {
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<ContentBrief["tone"]>("professional");
  const [targetAudience, setTargetAudience] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    "instagram",
    "facebook",
    "linkedin",
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
    };
    onGenerate(brief);
  }

  const canSubmit = topic.trim().length > 0 && selectedPlatforms.length > 0 && !loading;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
      <div className="space-y-5">
        {/* Topic */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Topic <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Summer sale — 30% off all products this weekend"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Tone */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Tone
          </label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as ContentBrief["tone"])}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
          >
            {TONE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Target Audience */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Target Audience
          </label>
          <input
            type="text"
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="e.g. Women aged 25–34 interested in fashion"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Call to Action */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Call to Action
          </label>
          <input
            type="text"
            value={callToAction}
            onChange={(e) => setCallToAction(e.target.value)}
            placeholder="e.g. Shop now, link in bio"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Platform Toggles */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Platforms <span className="text-red-400">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((platform) => {
              const meta = PLATFORM_META[platform];
              const selected = selectedPlatforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => togglePlatform(platform)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selected
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* AI Insights toggle */}
        <div className="flex items-center justify-between py-3 px-4 bg-gray-800/50 border border-gray-700 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">AI Insights</span>
            {hints ? (
              <span className="text-xs bg-indigo-900/50 text-indigo-400 border border-indigo-800/50 px-2 py-0.5 rounded-full">
                Active
              </span>
            ) : (
              <span className="text-xs bg-gray-800 text-gray-500 border border-gray-700 px-2 py-0.5 rounded-full">
                No data
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {hints && (
              <span className="text-xs text-gray-500">
                {isEnabled ? "Optimizing generation" : "Disabled"}
              </span>
            )}
            <button
              type="button"
              onClick={toggleEnabled}
              disabled={!hints}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                isEnabled && hints ? "bg-indigo-600" : "bg-gray-700"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  isEnabled && hints ? "translate-x-4" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
        >
          {loading ? "Running pipeline…" : "Generate & Auto-Post"}
        </button>
      </div>
    </div>
  );
}
