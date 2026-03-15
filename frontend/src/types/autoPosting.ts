// ─── Platforms ────────────────────────────────────────────────────────────────

export type Platform = "instagram" | "facebook" | "linkedin" | "twitter" | "tiktok";

export const PLATFORMS: Platform[] = [
  "instagram",
  "facebook",
  "linkedin",
  "twitter",
  "tiktok",
];

export const PLATFORM_META: Record<
  Platform,
  { label: string; maxChars: number; hashtagLimit: number; color: string; icon: string }
> = {
  instagram: { label: "Instagram",   maxChars: 2200,  hashtagLimit: 30, color: "text-pink-400",  icon: "📸" },
  facebook:  { label: "Facebook",    maxChars: 63206, hashtagLimit: 10, color: "text-blue-400",  icon: "📘" },
  linkedin:  { label: "LinkedIn",    maxChars: 3000,  hashtagLimit: 5,  color: "text-sky-400",   icon: "💼" },
  twitter:   { label: "X (Twitter)", maxChars: 280,   hashtagLimit: 3,  color: "text-gray-300",  icon: "𝕏" },
  tiktok:    { label: "TikTok",      maxChars: 2200,  hashtagLimit: 20, color: "text-rose-400",  icon: "🎵" },
};

// ─── Post Lifecycle ───────────────────────────────────────────────────────────

export type PostStatus =
  | "generating"       // Claude is writing the caption
  | "regenerating"     // Claude rewriting after a safety failure (with hints)
  | "safety_checking"  // Safety filter API call in flight
  | "publishing"       // Publish API call in flight
  | "published"        // Successfully published
  | "blocked"          // Safety filter rejected the content
  | "failed";          // Generation or publish API errored

// ─── Domain Objects ───────────────────────────────────────────────────────────

export interface PlatformDraft {
  id: string;
  platform: Platform;
  caption: string;
  hashtags: string[];
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  errorMessage: string | null;
  safetyFlagReason: string | null;
  safetySeverity: "low" | "medium" | "high" | null;
  // ContentCreator integration hooks (null until ContentCreator module is built)
  mediaUrl: string | null;
  mediaType: "image" | "video" | "carousel" | null;
}

export interface ContentBrief {
  id: string;
  topic: string;
  tone: "professional" | "casual" | "humorous" | "inspirational" | "educational";
  targetAudience: string;
  callToAction: string;
  selectedPlatforms: Platform[];
  sourceContentId: string | null;
  safetyFeedback: string | null;   // populated on retry; null on first attempt
  optimizationHints: import("@/types/feedbackLoop").ContentOptimizationHints | null;
}

export interface PostBrief extends ContentBrief {
  drafts: PlatformDraft[];
  createdAt: string;
}

// ─── API Shapes ───────────────────────────────────────────────────────────────

export interface GenerateContentRequest {
  brief: ContentBrief;
}

export interface GeneratedPlatformContent {
  platform: Platform;
  caption: string;
  hashtags: string[];
}

export interface GenerateContentResponse {
  briefId: string;
  platforms: GeneratedPlatformContent[];
}

export interface PublishPostRequest {
  draftId: string;
  platform: Platform;
  caption: string;
  hashtags: string[];
  scheduledAt: string | null;
  mediaUrl: string | null;
}

export interface PublishPostResponse {
  draftId: string;
  success: boolean;
  publishedAt: string | null;
  mockPlatformPostId: string | null;
  errorMessage: string | null;
}

export interface SafetyFilterRequest {
  draftId: string;
  platform: Platform;
  caption: string;
  hashtags: string[];
}

export interface SafetyFilterResponse {
  draftId: string;
  safe: boolean;
  flagReason: string | null;
  severity: "low" | "medium" | "high" | null;
}

// ─── Advanced Safety Filter (5-category) ─────────────────────────────────────

export type SafetyCheckCategory =
  | "profanity"
  | "brand_voice"
  | "duplicate_content"
  | "spam"
  | "platform_rules";

export interface SafetyCheckResult {
  category: SafetyCheckCategory;
  passed: boolean;
  reason: string | null;
  severity: "low" | "medium" | "high" | null;
}

export interface AdvancedSafetyRequest {
  draftId: string;
  platform: Platform;
  caption: string;
  hashtags: string[];
  brandVoice: string | null;       // e.g. "professional, friendly, no slang"
  recentCaptions: string[];         // last N captions for duplicate detection
}

export interface AdvancedSafetyResponse {
  draftId: string;
  safe: boolean;
  checks: SafetyCheckResult[];      // one entry per category
  flagReason: string | null;
  severity: "low" | "medium" | "high" | null;
  regenerationHints: string | null; // ready-to-append prompt fragment for retry
}

// ─── Reducer Actions ──────────────────────────────────────────────────────────

export type AutoPostingAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_ACTIVE_TAB"; payload: "setup" | "pipeline" | "history" }
  | { type: "PIPELINE_STARTED"; payload: PostBrief }
  | { type: "CONTENT_GENERATED"; payload: { draftId: string; caption: string; hashtags: string[] } }
  | { type: "SAFETY_CHECK_STARTED"; payload: { draftId: string } }
  | { type: "SAFETY_CHECK_PASSED"; payload: { draftId: string } }
  | { type: "SAFETY_CHECK_BLOCKED"; payload: { draftId: string; flagReason: string; severity: "low" | "medium" | "high" } }
  | { type: "REGENERATION_STARTED"; payload: { draftId: string } }
  | { type: "PUBLISHING_STARTED"; payload: { draftId: string } }
  | { type: "PUBLISHING_SUCCESS"; payload: { draftId: string; publishedAt: string; mockPlatformPostId: string } }
  | { type: "PUBLISHING_FAILED"; payload: { draftId: string; errorMessage: string } }
  | { type: "CLEAR_BRIEF" };

export interface AutoPostingState {
  loading: boolean;
  error: string | null;
  activeTab: "setup" | "pipeline" | "history";
  currentBrief: PostBrief | null;
  history: PlatformDraft[];
}
