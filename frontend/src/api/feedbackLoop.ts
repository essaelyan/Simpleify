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

export async function fetchLatestHints(): Promise<ContentOptimizationHints | null> {
  const { data } = await axios.get<{ hints: ContentOptimizationHints | null }>(
    "/api/feedback/latest"
  );
  return data.hints ?? null;
}

export async function fetchGAInsights(
  req: FetchGAInsightsRequest
): Promise<FetchGAInsightsResponse> {
  const { data } = await axios.post<FetchGAInsightsResponse>(
    "/api/feedback/ga-insights",
    req
  );
  return data;
}

export async function fetchInstagramInsights(
  req: FetchInstagramInsightsRequest
): Promise<FetchInstagramInsightsResponse> {
  const { data } = await axios.post<FetchInstagramInsightsResponse>(
    "/api/feedback/instagram-insights",
    req
  );
  return data;
}

export async function optimizeContent(
  req: OptimizeContentRequest
): Promise<OptimizeContentResponse> {
  const { data } = await axios.post<OptimizeContentResponse>(
    "/api/feedback/optimize-content",
    req
  );
  return data;
}
