import type { NextApiRequest, NextApiResponse } from "next";
import type {
  FetchInstagramInsightsRequest,
  FetchInstagramInsightsResponse,
  InstagramInsightsData,
} from "@/types/feedbackLoop";
import { getMockInstagramData } from "@/services/feedbackLoop";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { dateRangeDays } = req.body as FetchInstagramInsightsRequest;

  if (!dateRangeDays || typeof dateRangeDays !== "number" || dateRangeDays <= 0) {
    return res.status(400).json({ error: "dateRangeDays is required and must be a positive number" });
  }

  // Use mock data if INSTAGRAM_ACCESS_TOKEN is not configured
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
    const data = getMockInstagramData(dateRangeDays);
    return res.status(200).json({ data } as FetchInstagramInsightsResponse);
  }

  // TODO: Replace with real Instagram Graph API call when credentials are configured
  // const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  // const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  // const since = Math.floor((Date.now() - dateRangeDays * 24 * 60 * 60 * 1000) / 1000);
  //
  // Fetch media list:
  // const mediaRes = await fetch(
  //   `https://graph.facebook.com/v19.0/${accountId}/media?fields=id,caption,media_type,timestamp&since=${since}&access_token=${accessToken}`
  // );
  // const mediaData = await mediaRes.json();
  //
  // Fetch insights for each post (likes, comments, reach, impressions, saved):
  // const postsWithInsights = await Promise.all(
  //   mediaData.data.map(async (post) => {
  //     const insightsRes = await fetch(
  //       `https://graph.facebook.com/v19.0/${post.id}/insights?metric=likes,comments,reach,impressions,saved&access_token=${accessToken}`
  //     );
  //     const insights = await insightsRes.json();
  //     return { ...post, ...parseInsights(insights) };
  //   })
  // );
  // ... sort by engagementRate, compute bestTimes, return InstagramInsightsData shape

  try {
    // Fallback: return mock while real integration is pending
    const data: InstagramInsightsData = getMockInstagramData(dateRangeDays);
    return res.status(200).json({ data } as FetchInstagramInsightsResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Instagram insights";
    return res.status(500).json({ error: message });
  }
}
