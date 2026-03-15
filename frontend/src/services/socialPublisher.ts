/**
 * socialPublisher.ts — Modular social publishing service.
 *
 * Orchestrates two steps in a single call:
 *   1. AI Safety Filter (Claude Haiku) — blocks unsafe content before it ships
 *   2. Platform publish — real HTTP REST calls when an accessToken is provided,
 *      mock when SOCIAL_PUBLISH_MOCK=true (default) or no token is present.
 *
 * Publishing strategy:
 *   - SOCIAL_PUBLISH_MOCK=true  → always return a mock post ID (safe default)
 *   - SOCIAL_PUBLISH_MOCK=false + accessToken → call real platform REST API
 *   - SOCIAL_PUBLISH_MOCK=false + no token    → return { success: false }
 *
 * Server-side only. Import from any API route or server utility.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AdvancedSafetyRequest, Platform } from "@/types/autoPosting";
import {
  buildSafetyCheckPrompt,
  parseSafetyCheckResponse,
} from "./safetyFilter";

// Controlled by SOCIAL_PUBLISH_MOCK env var.
// Default: true (mock) unless explicitly set to "false"
const MOCK_MODE = process.env.SOCIAL_PUBLISH_MOCK !== "false";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface PublishInput {
  platform: Platform;
  media_url: string;
  caption: string;
  hashtags: string[];
  accessToken?: string; // stored OAuth token; required when MOCK_MODE=false
}

export interface PublishResult {
  success: boolean;
  platform_post_id?: string;
  safetyBlocked?: boolean;
  flagReason?: string;
  isMock?: boolean;
}

// ─── Platform REST implementations ────────────────────────────────────────────

/**
 * Twitter/X — POST https://api.twitter.com/2/tweets
 * Requires OAuth 2.0 Bearer Token with write scope.
 * Caption is truncated to 280 chars automatically.
 */
async function publishToTwitter(
  caption: string,
  hashtags: string[],
  accessToken: string
): Promise<string> {
  const text = [caption, ...hashtags.map((h) => `#${h}`)].join(" ").slice(0, 280);
  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter API error ${res.status}: ${err}`);
  }
  const data = await res.json() as { data: { id: string } };
  return data.data.id;
}

/**
 * Facebook — POST /me/feed via Graph API
 * Requires a Page Access Token with pages_manage_posts permission.
 */
async function publishToFacebook(
  caption: string,
  hashtags: string[],
  accessToken: string
): Promise<string> {
  const message = [caption, ...hashtags.map((h) => `#${h}`)].join(" ");
  const res = await fetch("https://graph.facebook.com/v19.0/me/feed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: accessToken }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook API error ${res.status}: ${err}`);
  }
  const data = await res.json() as { id: string };
  return data.id;
}

/**
 * LinkedIn — POST https://api.linkedin.com/v2/ugcPosts
 * Requires OAuth 2.0 Bearer Token with w_member_social scope.
 * Author URN must be configured as LINKEDIN_AUTHOR_URN env var.
 */
async function publishToLinkedIn(
  caption: string,
  hashtags: string[],
  accessToken: string
): Promise<string> {
  const authorUrn = process.env.LINKEDIN_AUTHOR_URN ?? "";
  const text = [caption, ...hashtags.map((h) => `#${h}`)].join(" ");
  const body = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn API error ${res.status}: ${err}`);
  }
  const data = await res.json() as { id: string };
  return data.id;
}

/**
 * Instagram — two-step Graph API publish:
 *   1. POST /{ig-user-id}/media         → creates a media container
 *   2. POST /{ig-user-id}/media_publish → publishes the container
 *
 * Requires instagram_content_publish permission.
 * INSTAGRAM_BUSINESS_ACCOUNT_ID env var must be set.
 */
async function publishToInstagram(
  caption: string,
  hashtags: string[],
  mediaUrl: string,
  accessToken: string
): Promise<string> {
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accountId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID is not configured");

  const fullCaption = [caption, ...hashtags.map((h) => `#${h}`)].join(" ");

  // Step 1: Create media container
  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${accountId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: mediaUrl,
        caption: fullCaption,
        access_token: accessToken,
      }),
    }
  );
  if (!containerRes.ok) {
    const err = await containerRes.text();
    throw new Error(`Instagram container creation error ${containerRes.status}: ${err}`);
  }
  const { id: creationId } = await containerRes.json() as { id: string };

  // Step 2: Publish the container
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${accountId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
    }
  );
  if (!publishRes.ok) {
    const err = await publishRes.text();
    throw new Error(`Instagram publish error ${publishRes.status}: ${err}`);
  }
  const { id: postId } = await publishRes.json() as { id: string };
  return postId;
}

/**
 * TikTok — POST https://open.tiktokapis.com/v2/post/publish/video/init/
 * Requires TikTok Content Posting API access.
 * This posts a video from a public URL (PULL_FROM_URL strategy).
 */
async function publishToTikTok(
  caption: string,
  hashtags: string[],
  mediaUrl: string,
  accessToken: string
): Promise<string> {
  const title = [caption, ...hashtags.map((h) => `#${h}`)].join(" ").slice(0, 150);
  const res = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 0,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: mediaUrl,
        },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TikTok API error ${res.status}: ${err}`);
  }
  const data = await res.json() as { data: { publish_id: string } };
  return data.data.publish_id;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function publishToSocialPlatform(
  input: PublishInput
): Promise<PublishResult> {
  try {
    // ── Step 1: AI Safety Filter ───────────────────────────────────────────────
    const safetyReq: AdvancedSafetyRequest = {
      draftId: Date.now().toString(36) + Math.random().toString(36).slice(2),
      platform: input.platform,
      caption: input.caption,
      hashtags: input.hashtags,
      brandVoice: null,
      recentCaptions: [],
    };

    const safetyResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: buildSafetyCheckPrompt(safetyReq) }],
    });

    const rawText = safetyResponse.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const { safe, flagReason } = parseSafetyCheckResponse(rawText);

    if (!safe) {
      return { success: false, safetyBlocked: true, flagReason: flagReason ?? undefined };
    }

    // ── Step 2: Publish ────────────────────────────────────────────────────────
    if (MOCK_MODE) {
      return {
        success: true,
        platform_post_id: `mock_${input.platform}_${Date.now()}`,
        isMock: true,
      };
    }

    const token = input.accessToken;
    if (!token) {
      return { success: false };
    }

    let platformPostId: string;

    switch (input.platform) {
      case "twitter":
        platformPostId = await publishToTwitter(input.caption, input.hashtags, token);
        break;

      case "facebook":
        platformPostId = await publishToFacebook(input.caption, input.hashtags, token);
        break;

      case "linkedin":
        platformPostId = await publishToLinkedIn(input.caption, input.hashtags, token);
        break;

      case "instagram":
        platformPostId = await publishToInstagram(
          input.caption,
          input.hashtags,
          input.media_url,
          token
        );
        break;

      case "tiktok":
        platformPostId = await publishToTikTok(
          input.caption,
          input.hashtags,
          input.media_url,
          token
        );
        break;

      default:
        return { success: false };
    }

    return { success: true, platform_post_id: platformPostId, isMock: false };
  } catch (err) {
    console.error("[socialPublisher] error:", err);
    return { success: false };
  }
}
