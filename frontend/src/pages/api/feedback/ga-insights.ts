/**
 * POST /api/feedback/ga-insights
 *
 * Fetches Google Analytics 4 performance data.
 *
 * When GA4_PROPERTY_ID + GA4_CLIENT_EMAIL + GA4_PRIVATE_KEY are set:
 *   - Calls the GA4 Data API v1beta using a service-account JWT (no SDK needed)
 *   - Returns real sessions, conversions, top pages, traffic sources
 *
 * When env vars are missing → returns realistic mock data so the
 * feedback loop keeps working during development and demo.
 *
 * Body: { dateRangeDays: number }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type {
  FetchGAInsightsRequest,
  FetchGAInsightsResponse,
  GAPerformanceData,
} from "@/types/feedbackLoop";
import { getMockGAData } from "@/services/feedbackLoop";

// ─── JWT helpers for Google service-account auth ─────────────────────────────

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

  // Parse PEM private key
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
  const { access_token } = await res.json() as { access_token: string };
  return access_token;
}

// ─── Real GA4 Data API fetch ──────────────────────────────────────────────────

async function fetchRealGA4Data(
  propertyId: string,
  clientEmail: string,
  privateKeyPem: string,
  dateRangeDays: number
): Promise<GAPerformanceData> {
  const accessToken = await getGoogleAccessToken(clientEmail, privateKeyPem);

  const startDate = `${dateRangeDays}daysAgo`;
  const endDate = "today";

  // Fetch top pages
  const pagesRes = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
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
    }
  );

  // Fetch traffic sources
  const sourcesRes = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 5,
      }),
    }
  );

  // Fetch totals
  const totalsRes = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
      }),
    }
  );

  if (!pagesRes.ok || !sourcesRes.ok || !totalsRes.ok) {
    throw new Error("GA4 API request failed");
  }

  type GA4Report = {
    rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>;
  };

  const pagesData: GA4Report = await pagesRes.json();
  const sourcesData: GA4Report = await sourcesRes.json();
  const totalsData: GA4Report = await totalsRes.json();

  const totalSessions = Number(totalsData.rows?.[0]?.metricValues?.[0]?.value ?? 0);
  const totalConversions = Number(totalsData.rows?.[0]?.metricValues?.[1]?.value ?? 0);

  const topPages = (pagesData.rows ?? []).map((row) => {
    const sessions = Number(row.metricValues[0].value);
    const conversions = Number(row.metricValues[1].value);
    return {
      pagePath: row.dimensionValues[0].value,
      pageTitle: row.dimensionValues[1].value,
      sessions,
      conversions,
      conversionRate: sessions > 0 ? (conversions / sessions) * 100 : 0,
      avgEngagementTimeSeconds: Math.round(Number(row.metricValues[3].value)),
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

// ─── Route handler ────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { dateRangeDays } = req.body as FetchGAInsightsRequest;

  if (!dateRangeDays || typeof dateRangeDays !== "number" || dateRangeDays <= 0) {
    return res
      .status(400)
      .json({ error: "dateRangeDays is required and must be a positive number" });
  }

  const propertyId = process.env.GA4_PROPERTY_ID;
  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!propertyId || !clientEmail || !privateKey) {
    // Graceful degradation — mock data so the feedback loop always works
    const data = getMockGAData(dateRangeDays);
    return res.status(200).json({ data } as FetchGAInsightsResponse);
  }

  try {
    const data = await fetchRealGA4Data(propertyId, clientEmail, privateKey, dateRangeDays);
    return res.status(200).json({ data } as FetchGAInsightsResponse);
  } catch (err) {
    console.error("[ga-insights] real fetch failed, falling back to mock:", err);
    // Fallback to mock so the feedback loop is never blocked by GA4 downtime
    const data: GAPerformanceData = getMockGAData(dateRangeDays);
    return res.status(200).json({ data } as FetchGAInsightsResponse);
  }
}
