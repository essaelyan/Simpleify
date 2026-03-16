import axios from "axios";
import type {
  AdvancedSafetyRequest,
  AdvancedSafetyResponse,
  ContentBrief,
  GenerateContentResponse,
  Platform,
  PlatformDraft,
  PostStatus,
  PublishPostRequest,
  PublishPostResponse,
  SafetyFilterRequest,
  SafetyFilterResponse,
} from "@/types/autoPosting";
import type { ApiResponse } from "@/types/api";
import type { SocialPublishData } from "@/pages/api/social/publish";
import type { PipelineRunData } from "@/pages/api/pipeline/run";
import type { HistoryPost } from "@/pages/api/social/posts";

export async function generateContent(
  brief: ContentBrief
): Promise<GenerateContentResponse> {
  const { data } = await axios.post<ApiResponse<GenerateContentResponse>>(
    "/api/generate-content",
    { brief }
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Content generation failed");
  }
  return data.data;
}

export async function checkSafety(
  req: SafetyFilterRequest
): Promise<SafetyFilterResponse> {
  const { data } = await axios.post<ApiResponse<SafetyFilterResponse>>(
    "/api/safety-filter",
    req
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Safety check failed");
  }
  return data.data;
}

/**
 * Publish a platform draft.
 *
 * Calls the canonical POST /api/social/publish and maps the response
 * back to PublishPostResponse for backward compatibility with existing
 * frontend components.
 */
export async function publishPost(
  draft: PublishPostRequest
): Promise<PublishPostResponse> {
  const { data } = await axios.post<ApiResponse<SocialPublishData>>(
    "/api/social/publish",
    {
      platform: draft.platform,
      media_url: draft.mediaUrl ?? "",
      caption: draft.caption,
      hashtags: draft.hashtags ?? [],
    }
  );

  // Publish failures can come back as success:false (publish API error) or
  // as an error envelope (validation / server error). Normalise both.
  if (!data.success) {
    return {
      draftId: draft.draftId,
      success: false,
      publishedAt: null,
      mockPlatformPostId: null,
      errorMessage: data.error?.message ?? "Publish failed",
    };
  }

  const payload = data.data!;
  const isMock = data.meta?.isMock === true;
  return {
    draftId: draft.draftId,
    success: true,
    publishedAt: new Date().toISOString(),
    mockPlatformPostId: isMock ? (payload.platform_post_id ?? null) : null,
    errorMessage: null,
  };
}

export async function checkSafetyAdvanced(
  req: AdvancedSafetyRequest
): Promise<AdvancedSafetyResponse> {
  const { data } = await axios.post<ApiResponse<AdvancedSafetyResponse>>(
    "/api/ai/safety-check",
    req
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Safety check failed");
  }
  return data.data;
}

/**
 * Runs the full production content pipeline via POST /api/pipeline/run.
 *
 * /api/pipeline/run is the single source of truth for the Auto Posting workflow.
 * It orchestrates: brand voice loading → feedback hints → brief enrichment →
 * content generation → per-platform QA → safety → publish → feedback snapshot.
 *
 * The UI is a pure presentation layer over the returned PipelineRunData.
 */
export async function runPipeline(req: {
  brief: ContentBrief;
  mediaUrl?: string;
  dateRangeDays?: number;
  /** ISO 8601 datetime string. When in the future, posts are queued as "scheduled". */
  publishAt?: string;
}): Promise<PipelineRunData> {
  const { data } = await axios.post<ApiResponse<PipelineRunData>>(
    "/api/pipeline/run",
    {
      brief: req.brief,
      mediaUrl: req.mediaUrl ?? "",
      dateRangeDays: req.dateRangeDays ?? 30,
      publishAt: req.publishAt,
    }
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Pipeline failed");
  }
  return data.data;
}

/**
 * Fetches recent post history from GET /api/social/posts and maps the
 * DB records to PlatformDraft objects suitable for the history panel.
 *
 * Returns an empty array on any error — history is non-critical UI state.
 */
export async function fetchPostHistory(): Promise<PlatformDraft[]> {
  const { data } = await axios.get<ApiResponse<{ posts: HistoryPost[] }>>(
    "/api/social/posts"
  );
  if (!data.success || !data.data) return [];

  return data.data.posts.map((p): PlatformDraft => ({
    id: p.id,
    platform: p.platform as Platform,
    caption: p.caption,
    hashtags: p.hashtags,
    status: p.status as PostStatus,
    scheduledAt: p.scheduledAt ?? null,
    publishedAt: p.publishedAt,
    mockPlatformPostId: null,
    errorMessage: p.errorMessage,
    safetyFlagReason: p.status === "blocked" ? (p.flagReason ?? null) : null,
    safetySeverity: null,   // not stored in DB
    qaScore: null,           // not stored in DB
    qaVerdict: null,         // not stored in DB
    mediaUrl: null,
    mediaType: null,
  }));
}
