/**
 * socialPublisher.ts — Modular social publishing service.
 *
 * Orchestrates two steps in a single call:
 *   1. AI Safety Filter (Claude Haiku) — blocks unsafe content before it ships
 *   2. Platform publish — mock by default; real SDK stubs ready to activate
 *
 * Server-side only. Import from any API route or server utility.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AdvancedSafetyRequest, Platform } from "@/types/autoPosting";
import {
  buildSafetyCheckPrompt,
  parseSafetyCheckResponse,
} from "./safetyFilter";

// Set to false and wire real OAuth credentials per platform when ready to go live
const MOCK_MODE = true;

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface PublishInput {
  platform: Platform;
  media_url: string;
  caption: string;
  hashtags: string[];
  accessToken?: string;  // pass stored OAuth token for real publishing; omit for mock mode
}

export interface PublishResult {
  success: boolean;
  platform_post_id?: string; // present when success === true
  safetyBlocked?: boolean;   // true when safety filter rejected the content
  flagReason?: string;       // human-readable safety flag message
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
      return {
        success: false,
        safetyBlocked: true,
        flagReason: flagReason ?? undefined,
      };
    }

    // ── Step 2: Publish ────────────────────────────────────────────────────────
    if (MOCK_MODE) {
      return {
        success: true,
        platform_post_id: `mock_${input.platform}_${Date.now()}`,
      };
    }

    // Real platform stubs — uncomment and wire OAuth tokens when going live:
    const token = input.accessToken;
    switch (input.platform) {
      case "instagram":
        // const igClient = new IgApiClient();
        // const postId = await igClient.publish({ caption: input.caption, mediaUrl: input.media_url, accessToken: token })
        // return { success: true, platform_post_id: postId };
        break;

      case "facebook":
        // const fbResult = await facebookClient.postToPage({ message: input.caption, accessToken: token })
        // return { success: true, platform_post_id: fbResult.id };
        break;

      case "linkedin":
        // const liResult = await linkedinClient.createPost({ text: input.caption, accessToken: token })
        // return { success: true, platform_post_id: liResult.id };
        break;

      case "twitter":
        // const twitterClient = new TwitterApi(token);
        // const tweet = await twitterClient.v2.tweet(input.caption)
        // return { success: true, platform_post_id: tweet.data.id };
        break;

      case "tiktok":
        // const ttResult = await tiktokClient.postVideo({ caption: input.caption, videoUrl: input.media_url, accessToken: token })
        // return { success: true, platform_post_id: ttResult.share_id };
        break;

      default:
        return { success: false };
    }

    return { success: true };
  } catch {
    return { success: false };
  }
}
