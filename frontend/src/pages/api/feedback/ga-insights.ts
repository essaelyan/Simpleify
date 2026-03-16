/**
 * POST /api/feedback/ga-insights
 *
 * HTTP wrapper around fetchGAData() from analyticsDataService.
 *
 * Architecture note:
 *   The GA4 fetch logic has been extracted to src/services/analyticsDataService.ts
 *   so it can be imported directly by server-side code (e.g. pipeline/run.ts)
 *   without making an HTTP round-trip. This route exists only for:
 *     - Direct frontend/client calls via src/api/feedbackLoop.ts
 *     - Manual testing and external integrations
 *
 * Body:   { dateRangeDays: number }
 * Response: ApiResponse<{ data: GAPerformanceData }>
 *   meta: { isMock } — true when returned data is from the mock fallback
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { GAPerformanceData, FetchGAInsightsRequest } from "@/types/feedbackLoop";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import { fetchGAData } from "@/services/analyticsDataService";

export interface GAInsightsData {
  data: GAPerformanceData;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<GAInsightsData>>
) {
  if (req.method !== "POST") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const { dateRangeDays } = req.body as FetchGAInsightsRequest;

  if (!dateRangeDays || typeof dateRangeDays !== "number" || dateRangeDays <= 0) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "dateRangeDays is required and must be a positive number");
  }

  try {
    const data = await fetchGAData(dateRangeDays);
    return ok(res, { data }, { isMock: data.isMock });
  } catch (err) {
    const message = err instanceof Error ? err.message : "GA insights failed";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
