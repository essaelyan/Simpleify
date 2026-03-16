/**
 * analyticsDataService.ts — GA4 + Instagram data fetching service.
 *
 * Previously, the fetch logic lived inside two Next.js API route files
 * (api/feedback/ga-insights.ts and api/feedback/instagram-insights.ts).
 * pipeline/run.ts called those routes over HTTP using VERCEL_URL, which
 * added unnecessary round-trips and a fragile env-var dependency.
 *
 * Architecture change (cleanup):
 *   - All real-fetch and mock-fallback logic lives HERE as importable functions.
 *   - api/feedback/ga-insights.ts and api/feedback/instagram-insights.ts are
 *     now thin HTTP wrappers that call fetchGAData() / fetchInstagramData().
 *   - pipeline/run.ts imports fetchGAData / fetchInstagramData directly —
 *     no more internal HTTP calls, no more VERCEL_URL dependency.
 *
 * Exported surface:
 *   fetchGAData(dateRangeDays)          → GAPerformanceData  (real or mock)
 *   fetchInstagramData(dateRangeDays)   → InstagramInsightsData (real or mock)
 */

import type { GAPerformanceData, InstagramInsightsData } from "@/types/feedbackLoop";
import { getMockGAData, getMockInstagramData } from "@/services/feedbackLoop";

// ─── GA4 helpers ──────────────────────────────────────────────────────────────

function base64url(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function buildServiceAccountJWT(
  clientEmail: string,
  privateKeyPem: string,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  const signingInput = `${header}.${payload}`;

  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sig = base64url(new Uint8Array(signature));
  return `${signingInput}.${sig}`;
}

async function getGoogleAccessToken(
  clientEmail: string,
  privateKeyPem: string
): Promise<string> {
  const scope = "https://www.googleapis.com/auth/analytics.readonly";
  const jwt = await buildServiceAccountJWT(clientEmail, privateKeyPem, scope);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

type GA4Report = {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
};

async function fetchRealGA4Data(
  propertyId: string,
  clientEmail: string,
  privateKeyPem: string,
  dateRangeDays: number
): Promise<GAPerformanceData> {
  const accessToken = await getGoogleAccessToken(clientEmail, privateKeyPem);

  const startDate = `${dateRangeDays}daysAgo`;
  const endDate = "today";
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const base = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

  const [pagesRes, sourcesRes, totalsRes] = await Promise.all([
    fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [
          { name: "sessions" },
          { name: "conversions" },
          { name: "engagementRate" },
          { name: "averageSessionDuration" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 5,
      }),
    }),
    fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 5,
      }),
    }),
    fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
      }),
    }),
  ]);

  if (!pagesRes.ok || !sourcesRes.ok || !totalsRes.ok) {
    throw new Error("GA4 API request failed");
  }

  const pagesData: GA4Report = await pagesRes.json();
  const sourcesData: GA4Report = await sourcesRes.json();
  const totalsData: GA4Report = await totalsRes.json();

  const totalSessions = Number(
    totalsData.rows?.[0]?.metricValues?.[0]?.value ?? 0
  );
  const totalConversions = Number(
    totalsData.rows?.[0]?.metricValues?.[1]?.value ?? 0
  );

  const topPages = (pagesData.rows ?? []).map((row) => {
    const sessions = Number(row.metricValues[0].value);
    const conversions = Number(row.metricValues[1].value);
    return {
      pagePath: row.dimensionValues[0].value,
      pageTitle: row.dimensionValues[1].value,
      sessions,
      conversions,
      conversionRate: sessions > 0 ? (conversions / sessions) * 100 : 0,
      avgEngagementTimeSeconds: Math.round(
        Number(row.metricValues[3].value)
      ),
    };
  });

  const trafficSources = (sourcesData.rows ?? []).map((row) => {
    const sessions = Number(row.metricValues[0].value);
    const conversions = Number(row.metricValues[1].value);
    return {
      source: row.dimensionValues[0].value,
      medium: row.dimensionValues[1].value,
      sessions,
      conversions,
      conversionRate: sessions > 0 ? (conversions / sessions) * 100 : 0,
    };
  });

  const endDateObj = new Date();
  const startDateObj = new Date(
    endDateObj.getTime() - dateRangeDays * 24 * 60 * 60 * 1000
  );

  return {
    propertyId,
    dateRange: {
      startDate: startDateObj.toISOString().split("T")[0],
      endDate: endDateObj.toISOString().split("T")[0],
    },
    totalSessions,
    totalConversions,
    overallConversionRate:
      totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0,
    topPages,
    trafficSources,
    isMock: false,
  };
}

// ─── Instagram helpers ────────────────────────────────────────────────────────

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

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

  const mediaRes = await fetch(
    `${GRAPH_BASE}/${accountId}/media?fields=id,caption,media_type,timestamp&since=${since}&limit=50&access_token=${accessToken}`
  );
  if (!mediaRes.ok) {
    throw new Error(
      `Instagram media fetch failed: ${await mediaRes.text()}`
    );
  }
  const mediaBody = (await mediaRes.json()) as { data: IGMediaItem[] };
  const mediaList = mediaBody.data ?? [];

  if (mediaList.length === 0) {
    return getMockInstagramData(dateRangeDays);
  }

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
  type DayOfWeek =
    | "Monday"
    | "Tuesday"
    | "Wednesday"
    | "Thursday"
    | "Friday"
    | "Saturday"
    | "Sunday";
  const VALID_MEDIA_TYPES: MediaType[] = [
    "IMAGE",
    "CAROUSEL_ALBUM",
    "VIDEO",
    "REEL",
  ];
  const DAY_NAMES: DayOfWeek[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const topPosts = [...validPosts]
    .sort((a, b) => b.engagementRate - a.engagementRate)
    .slice(0, 5)
    .map((p) => ({
      ...p,
      mediaType: (VALID_MEDIA_TYPES.includes(p.mediaType as MediaType)
        ? p.mediaType
        : "IMAGE") as MediaType,
    }));

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

  const typeCounts: Record<string, number> = {};
  for (const p of topPosts) {
    typeCounts[p.mediaType] = (typeCounts[p.mediaType] ?? 0) + 1;
  }
  const topMediaType = (
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "IMAGE"
  ) as MediaType;

  const totalEngagement = validPosts.reduce(
    (s, p) => s + p.engagementRate,
    0
  );
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
  const startDate = new Date(
    endDate.getTime() - dateRangeDays * 24 * 60 * 60 * 1000
  );

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

// ─── Public exports ───────────────────────────────────────────────────────────

/**
 * Fetches GA4 performance data for the given date range.
 *
 * Uses real GA4 Data API when GA4_PROPERTY_ID + GA4_CLIENT_EMAIL +
 * GA4_PRIVATE_KEY are all set. Falls back to realistic mock data otherwise
 * so the feedback loop never breaks in dev or when GA4 is unconfigured.
 *
 * Import and call this directly — do NOT call /api/feedback/ga-insights over
 * HTTP from other server-side code (pipeline/run.ts previously did this).
 */
export async function fetchGAData(
  dateRangeDays: number
): Promise<GAPerformanceData> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!propertyId || !clientEmail || !privateKey) {
    console.log("[analyticsDataService] GA4 env vars not set — using mock data");
    return getMockGAData(dateRangeDays);
  }

  try {
    const data = await fetchRealGA4Data(
      propertyId,
      clientEmail,
      privateKey,
      dateRangeDays
    );
    console.log(
      `[analyticsDataService] GA4 real data fetched: ${data.totalSessions} sessions, ${data.totalConversions} conversions`
    );
    return data;
  } catch (err) {
    console.error(
      "[analyticsDataService] GA4 fetch failed — falling back to mock:",
      err
    );
    return getMockGAData(dateRangeDays);
  }
}

/**
 * Fetches Instagram Business account insights for the given date range.
 *
 * Uses real Facebook Graph API when INSTAGRAM_ACCESS_TOKEN +
 * INSTAGRAM_BUSINESS_ACCOUNT_ID are set. Falls back to mock data otherwise.
 *
 * Import and call this directly — do NOT call /api/feedback/instagram-insights
 * over HTTP from other server-side code.
 */
export async function fetchInstagramData(
  dateRangeDays: number
): Promise<InstagramInsightsData> {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (!accessToken || !accountId) {
    console.log(
      "[analyticsDataService] Instagram env vars not set — using mock data"
    );
    return getMockInstagramData(dateRangeDays);
  }

  try {
    const data = await fetchRealInstagramData(
      accountId,
      accessToken,
      dateRangeDays
    );
    console.log(
      `[analyticsDataService] Instagram real data fetched: ${data.totalPosts} posts, ${data.avgEngagementRate.toFixed(2)}% avg engagement`
    );
    return data;
  } catch (err) {
    console.error(
      "[analyticsDataService] Instagram fetch failed — falling back to mock:",
      err
    );
    return getMockInstagramData(dateRangeDays);
  }
}
