import axios from "axios";
import type {
  ContentOptimizationHints,
  FetchGAInsightsRequest,
  FetchGAInsightsResponse,
  FetchInstagramInsightsRequest,
  FetchInstagramInsightsResponse,
  OptimizeContentRequest,
  OptimizeContentResponse,
} from "@/types/feedbackLoop";
import type { ApiResponse } from "@/types/api";
import type { FeedbackLatestData } from "@/pages/api/feedback/latest";
import type { GAInsightsData } from "@/pages/api/feedback/ga-insights";
import type { InstagramInsightsResponseData } from "@/pages/api/feedback/instagram-insights";
import type { OptimizeContentData } from "@/pages/api/feedback/optimize-content";
import type { ProcessRunData } from "@/pages/api/feedback/process-run";

export async function fetchLatestHints(): Promise<ContentOptimizationHints | null> {
  const { data } = await axios.get<ApiResponse<FeedbackLatestData>>(
    "/api/feedback/latest"
  );
  if (!data.success || !data.data) return null;
  return data.data.hints;
}

export async function fetchGAInsights(
  req: FetchGAInsightsRequest
): Promise<FetchGAInsightsResponse> {
  const { data } = await axios.post<ApiResponse<GAInsightsData>>(
    "/api/feedback/ga-insights",
    req
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "GA insights failed");
  }
  return { data: data.data.data };
}

export async function fetchInstagramInsights(
  req: FetchInstagramInsightsRequest
): Promise<FetchInstagramInsightsResponse> {
  const { data } = await axios.post<ApiResponse<InstagramInsightsResponseData>>(
    "/api/feedback/instagram-insights",
    req
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Instagram insights failed");
  }
  return { data: data.data.data };
}

export async function optimizeContent(
  req: OptimizeContentRequest
): Promise<OptimizeContentResponse> {
  const { data } = await axios.post<ApiResponse<OptimizeContentData>>(
    "/api/feedback/optimize-content",
    req
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Optimization failed");
  }
  return { hints: data.data.hints };
}

/**
 * Triggers the async feedback pipeline (Steps 5–7) via
 * POST /api/feedback/process-run.
 *
 * Called by the Auto Posting UI immediately after /api/pipeline/run completes.
 * Returns the freshly generated ContentOptimizationHints on success.
 * Throws on API error — callers should treat failure as non-critical.
 */
export async function processFeedbackRun(
  dateRangeDays: number = 30
): Promise<ProcessRunData> {
  const { data } = await axios.post<ApiResponse<ProcessRunData>>(
    "/api/feedback/process-run",
    { dateRangeDays }
  );
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Feedback processing failed");
  }
  return data.data;
}
