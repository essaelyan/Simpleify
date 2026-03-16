/**
 * GET /api/social/linkedin/callback
 *
 * LinkedIn OAuth 2.0 callback handler. Called by LinkedIn after the user
 * approves (or denies) consent on their authorization screen.
 *
 * Flow:
 *   1. Detect user-denied consent → redirect with error
 *   2. Exchange `code` for access token via LinkedIn token endpoint
 *   3. Fetch member identity from GET /v2/userinfo (OpenID Connect)
 *   4. Upsert SocialAccount row (platform = "linkedin")
 *   5. Redirect back to Auto Posting page with ?linkedin_connected=1
 *      (or ?linkedin_error=... on failure)
 *
 * Required env vars:
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 *   LINKEDIN_REDIRECT_URI  — must match the value used in /start exactly
 *
 * The stored platformUserId (LinkedIn member ID / sub) is later used by
 * the pipeline to construct the author URN (urn:li:person:{sub}) required
 * by the LinkedIn ugcPosts publish API.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

// ─── LinkedIn API response shapes ─────────────────────────────────────────────

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;           // seconds until expiry
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

interface LinkedInUserInfo {
  sub: string;          // LinkedIn member ID — used to build urn:li:person:{sub}
  name?: string;        // full display name
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derives the app's base URL from the incoming request host. */
function appBaseUrl(req: NextApiRequest): string {
  const host = req.headers.host ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

/** Auto Posting page path — destination after OAuth completes. */
const RETURN_PATH = "/SocialMedia/AutoPosting";

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const base = appBaseUrl(req);
  const returnUrl = `${base}${RETURN_PATH}`;

  const { code, error, error_description } = req.query;

  // ── User denied consent ────────────────────────────────────────────────────
  if (error) {
    const msg =
      typeof error_description === "string"
        ? error_description
        : typeof error === "string"
        ? error
        : "LinkedIn authorization was denied";
    res.redirect(302, `${returnUrl}?linkedin_error=${encodeURIComponent(msg)}`);
    return;
  }

  if (!code || typeof code !== "string") {
    res.redirect(
      302,
      `${returnUrl}?linkedin_error=${encodeURIComponent("Missing authorization code")}`
    );
    return;
  }

  // ── Env var guard ──────────────────────────────────────────────────────────
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    res.redirect(
      302,
      `${returnUrl}?linkedin_error=${encodeURIComponent(
        "LinkedIn OAuth is not fully configured (missing CLIENT_ID, CLIENT_SECRET, or REDIRECT_URI)"
      )}`
    );
    return;
  }

  try {
    // ── Step 1: Exchange code for access token ─────────────────────────────
    console.log("[linkedin/callback] exchanging code for token");
    const tokenRes = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      }
    );

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`);
    }

    const tokenData = (await tokenRes.json()) as LinkedInTokenResponse;

    // ── Step 2: Fetch member identity ──────────────────────────────────────
    // /v2/userinfo requires the `openid` scope requested in /start.
    // `sub` is the stable LinkedIn member ID used to build the author URN.
    console.log("[linkedin/callback] fetching member identity");
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileRes.ok) {
      throw new Error(
        `LinkedIn /v2/userinfo failed (${profileRes.status})`
      );
    }

    const profile = (await profileRes.json()) as LinkedInUserInfo;

    if (!profile.sub) {
      throw new Error(
        "LinkedIn /v2/userinfo response missing member ID (sub). " +
          "Ensure the openid scope was granted."
      );
    }

    // ── Step 3: Upsert SocialAccount ───────────────────────────────────────
    const composedName = [profile.given_name, profile.family_name]
      .filter(Boolean)
      .join(" ");
    const displayName = profile.name ?? (composedName || null);

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await prisma.socialAccount.upsert({
      where: { platform: "linkedin" },
      create: {
        platform: "linkedin",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt,
        accountHandle: displayName,
        platformUserId: profile.sub,
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt,
        accountHandle: displayName,
        platformUserId: profile.sub,
      },
    });

    console.log(
      `[linkedin/callback] connected  sub=${profile.sub}  name=${displayName ?? "(none)"}`
    );

    // ── Redirect back to app with success signal ───────────────────────────
    res.redirect(302, `${returnUrl}?linkedin_connected=1`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "LinkedIn connection failed";
    console.error("[linkedin/callback] ERROR:", message);
    res.redirect(
      302,
      `${returnUrl}?linkedin_error=${encodeURIComponent(message)}`
    );
  }
}
