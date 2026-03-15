import type { NextApiRequest, NextApiResponse } from "next";
import type {
  FetchGAInsightsRequest,
  FetchGAInsightsResponse,
  GAPerformanceData,
} from "@/types/feedbackLoop";
import { getMockGAData } from "@/services/feedbackLoop";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { dateRangeDays } = req.body as FetchGAInsightsRequest;

  if (!dateRangeDays || typeof dateRangeDays !== "number" || dateRangeDays <= 0) {
    return res.status(400).json({ error: "dateRangeDays is required and must be a positive number" });
  }

  // Use mock data if GA4_PROPERTY_ID is not configured
  if (!process.env.GA4_PROPERTY_ID) {
    const data = getMockGAData(dateRangeDays);
    return res.status(200).json({ data } as FetchGAInsightsResponse);
  }

  // TODO: Replace with real @google-analytics/data call when credentials are configured
  // const { BetaAnalyticsDataClient } = await import("@google-analytics/data");
  // const analyticsDataClient = new BetaAnalyticsDataClient({
  //   credentials: {
  //     client_email: process.env.GA4_CLIENT_EMAIL,
  //     private_key: process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  //   },
  // });
  // const [pagesReport] = await analyticsDataClient.runReport({
  //   property: `properties/${process.env.GA4_PROPERTY_ID}`,
  //   dateRanges: [{ startDate: `${dateRangeDays}daysAgo`, endDate: "today" }],
  //   dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
  //   metrics: [
  //     { name: "sessions" },
  //     { name: "conversions" },
  //     { name: "engagementRate" },
  //     { name: "averageSessionDuration" },
  //   ],
  //   orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  //   limit: 5,
  // });
  // ... parse into GAPerformanceData shape and return

  try {
    // Fallback: return mock while real integration is pending
    const data: GAPerformanceData = getMockGAData(dateRangeDays);
    return res.status(200).json({ data } as FetchGAInsightsResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch GA4 data";
    return res.status(500).json({ error: message });
  }
}
