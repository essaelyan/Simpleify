/**
 * POST /api/feedback/instagram-insights
 *
 * Fetches Instagram Business account insights via the Facebook Graph API.
 *
 * When INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID are set:
 *   - Fetches recent media, per-post insights (likes, comments, reach, saves)
 *   - Derives bestTimes from post timestamps weighted by engagement
 *   - Returns real InstagramInsightsData
 *
 * When env vars are missing → returns realistic mock data.
 *
 * Body: { dateRangeDays: number }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type {
  FetchInstagramInsightsRequest,
  FetchInstagramInsightsResponse,
  InstagramInsightsData,
} from "@/types/feedbackLoop";
import { getMockInstagramData } from "@/services/feedbackLoop";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

// ─── Real Instagram Graph API fetch ──────────────────────────────────────────

interface IGMediaItem {
  id: string;
  caption?: string;
  media_type: string;
  timestamp: string;
}

interface IGInsightValue {
  value: number;
}

interface IGInsightsResponse {
  data: Array<{ name: string; values: IGInsightValue[] }>;
}

async function fetchRealInstagramData(
  accountId: string,
  accessToken: string,
  dateRangeDays: number
): Promise<InstagramInsightsData> {
  const since = Math.floor(
    (Date.now() - dateRangeDays * 24 * 60 * 60 * 1000) / 1000
  );

  // Fetch media list
  const mediaRes = await fetch(
    `${GRAPH_BASE}/${accountId}/media?fields=id,caption,media_type,timestamp&since=${since}&limit=50&access_token=${accessToken}`
  );
  if (!mediaRes.ok) {
    throw new Error(`Instagram media fetch failed: ${await mediaRes.text()}`);
  }
  const mediaBody = await mediaRes.json() as { data: IGMediaItem[] };
  const mediaList = mediaBody.data ?? [];

  if (mediaList.length === 0) {
    return getMockInstagramData(dateRangeDays);
  }

  // Fetch insights for each post in parallel (up to 20 to avoid rate limits)
  const postsWithInsights = await Promise.all(
    mediaList.slice(0, 20).map(async (post) => {
      try {
        const insRes = await fetch(
          `${GRAPH_BASE}/${post.id}/insights?metric=likes,comments,reach,impressions,saved&access_token=${accessToken}`
        );
        if (!insRes.ok) return null;
        const insBody: IGInsightsResponse = await insRes.json();

        const get = (name: string) =>
          insBody.data.find((d) => d.name === name)?.values?.[0]?.value ?? 0;

        const reach = get("reach");
        const likes = get("likes");
        const comments = get("comments");
        const saves = get("saved");
        const impressions = get("impressions");
        const engagementRate =
          reach > 0 ? ((likes + comments + saves) / reach) * 100 : 0;

        return {
          id: post.id,
          caption: post.caption ?? "",
          mediaType: post.media_type,
          timestamp: post.timestamp,
          likes,
          comments,
          reach,
          impressions,
          engagementRate,
          saves,
        };
      } catch {
        return null;
      }
    })
  );

  const validPosts = postsWithInsights.filter(
    (p): p is NonNullable<typeof p> => p !== null && p.reach > 0
  );

  if (validPosts.length === 0) {
    return getMockInstagramData(dateRangeDays);
  }

  type MediaType = "IMAGE" | "CAROUSEL_ALBUM" | "VIDEO" | "REEL";
  type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  const VALID_MEDIA_TYPES: MediaType[] = ["IMAGE", "CAROUSEL_ALBUM", "VIDEO", "REEL"];
  const DAY_NAMES: DayOfWeek[] = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // Sort by engagement rate for topPosts
  const topPosts = [...validPosts]
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 5)
    .map((p) => ({
      ...p,
      mediaType: (VALID_MEDIA_TYPES.includes(p.mediaType as MediaType)
        ? p.mediaType
        : "IMAGE") as MediaType,
    }));

  // Derive best posting times: group by day + hour, average engagement
  const timeMap: Record<string, { total: number; count: number }> = {};
  for (const post of validPosts) {
    const d = new Date(post.timestamp);
    const dayOfWeek = DAY_NAMES[d.getUTCDay()];
    const hourUTC = d.getUTCHours();
    const key = `${dayOfWeek}|${hourUTC}`;
    if (!timeMap[key]) timeMap[key] = { total: 0, count: 0 };
    timeMap[key].total += post.engagementRate;
    timeMap[key].count += 1;
  }

  const bestTimes = Object.entries(timeMap)
    .map(([key, { total, count }]) => {
      const [dayOfWeek, hourStr] = key.split("|");
      return {
        dayOfWeek: dayOfWeek as DayOfWeek,
        hourUTC: Number(hourStr),
        avgEngagementRate: total / count,
      };
    })
    .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
    .slice(0, 5);

  // Most common media type among top posts
  const typeCounts: Record<string, number> = {};
  for (const p of topPosts) {
    typeCounts[p.mediaType] = (typeCounts[p.mediaType] ?? 0) + 1;
  }
  const topMediaType =
    (Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "IMAGE") as MediaType;

  const totalEngagement = validPosts.reduce((s, p) => s + p.engagementRate, 0);
  const avgEngagementRate =
    validPosts.length > 0 ? totalEngagement / validPosts.length : 0;
  const avgReach =
    validPosts.length > 0
      ? validPosts.reduce((s, p) => s + p.reach, 0) / validPosts.length
      : 0;
  const avgLikes =
    validPosts.length > 0
      ? validPosts.reduce((s, p) => s + p.likes, 0) / validPosts.length
      : 0;
  const avgComments =
    validPosts.length > 0
      ? validPosts.reduce((s, p) => s + p.comments, 0) / validPosts.length
      : 0;

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - dateRangeDays * 24 * 60 * 60 * 1000);

  return {
    accountId,
    dateRange: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    },
    totalPosts: validPosts.length,
    avgEngagementRate,
    avgReach: Math.round(avgReach),
    avgLikes: Math.round(avgLikes),
    avgComments: Math.round(avgComments),
    topPosts,
    bestTimes,
    topMediaType,
    isMock: false,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { dateRangeDays } = req.body as FetchInstagramInsightsRequest;

  if (!dateRangeDays || typeof dateRangeDays !== "number" || dateRangeDays <= 0) {
    return res
      .status(400)
      .json({ error: "dateRangeDays is required and must be a positive number" });
  }

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    const data = getMockInstagramData(dateRangeDays);
    return res.status(200).json({ data } as FetchInstagramInsightsResponse);
  }

  try {
    const data = await fetchRealInstagramData(accountId, accessToken, dateRangeDays);
    return res.status(200).json({ data } as FetchInstagramInsightsResponse);
  } catch (err) {
    console.error("[instagram-insights] real fetch failed, falling back to mock:", err);
    const data: InstagramInsightsData = getMockInstagramData(dateRangeDays);
    return res.status(200).json({ data } as FetchInstagramInsightsResponse);
  }
}
