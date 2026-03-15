/**
 * POST /api/pipeline/run
 *
 * Full end-to-end content pipeline:
 *
 *  1. Auto-load latest feedback snapshot → inject as optimizationHints into the brief
 *  2. Generate platform-specific captions via Claude (contentGenerator service)
 *  3. For each selected platform:
 *       a. Look up the connected account (access token) in the DB
 *       b. Run AI Safety Filter (Claude Haiku via socialPublisher)
 *       c. If safe → publish using stored access token
 *       d. Save the attempt to social_posts (every outcome is logged)
 *  4. Fetch GA + Instagram Insights → generate fresh ContentOptimizationHints (Claude Opus)
 *  5. Save hints to feedback_snapshots so future generations are automatically improved
 *
 * Input:  { brief: ContentBrief, mediaUrl: string, dateRangeDays?: number }
 * Output: { success, briefId, results: PlatformPipelineResult[], feedbackHints? }
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { AdvancedSafetyRequest, ContentBrief, Platform, GeneratedPlatformContent } from "@/types/autoPosting";
import type { ContentOptimizationHints } from "@/types/feedbackLoop";
import { generateContentForBrief } from "@/services/contentGenerator";
import { publishToSocialPlatform } from "@/services/socialPublisher";
import {
  buildSafetyCheckPrompt,
  parseSafetyCheckResponse,
  buildRegenerationHints,
} from "@/services/safetyFilter";
import {
  buildOptimizationPrompt,
  parseOptimizationResponse,
  getMockGAData,
  getMockInstagramData,
} from "@/services/feedbackLoop";
import prisma from "@/lib/prisma";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineRunRequest {
  brief: ContentBrief;
  mediaUrl: string;
  dateRangeDays?: number; // feedback loop lookback window; defaults to 30
}

export interface PlatformPipelineResult {
  platform: Platform;
  /** published | safety_blocked | failed | no_account */
  status: "published" | "safety_blocked" | "failed" | "no_account";
  postId?: string;         // DB social_posts record id
  platformPostId?: string; // Platform's own post id (present when published)
  flagReason?: string;
  caption?: string;
  hashtags?: string[];
  retryCount?: number;     // number of safety check attempts (1 = passed first time)
}

interface PipelineRunResponse {
  success: boolean;
  briefId?: string;
  results?: PlatformPipelineResult[];
  feedbackHints?: ContentOptimizationHints; // freshly generated after publishing
  error?: string;
}

// ─── Safety-retry helpers ─────────────────────────────────────────────────────

const MAX_SAFETY_RETRIES = 2; // up to 2 regeneration attempts after first failure

async function runSafetyCheck(
  anthropic: Anthropic,
  platform: Platform,
  caption: string,
  hashtags: string[]
) {
  const req: AdvancedSafetyRequest = {
    draftId: Date.now().toString(36) + Math.random().toString(36).slice(2),
    platform,
    caption,
    hashtags,
    brandVoice: null,
    recentCaptions: [],
  };
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content: buildSafetyCheckPrompt(req) }],
  });
  const rawText = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
  return parseSafetyCheckResponse(rawText);
}

/**
 * Runs a safety check on the draft.  If it fails, injects the failure reasons
 * back into the brief as safetyFeedback and regenerates the content for that
 * platform only.  Retries up to MAX_SAFETY_RETRIES times before giving up.
 */
async function retryUntilSafe(
  anthropic: Anthropic,
  brief: ContentBrief,
  initialDraft: GeneratedPlatformContent
): Promise<{
  draft: GeneratedPlatformContent;
  attempts: number;
  blocked: boolean;
  flagReason?: string;
}> {
  let draft = initialDraft;
  const platform = draft.platform as Platform;

  for (let attempt = 1; attempt <= MAX_SAFETY_RETRIES + 1; attempt++) {
    const { safe, flagReason, checks } = await runSafetyCheck(
      anthropic,
      platform,
      draft.caption,
      draft.hashtags
    );

    console.log(`\n[pipeline] ── Safety check  platform=${platform}  attempt=${attempt}/${MAX_SAFETY_RETRIES + 1} ──`);
    for (const c of checks) {
      const icon = c.passed ? "✓" : "✗";
      const detail = !c.passed && c.reason ? `  →  ${c.reason}${c.severity ? ` [${c.severity}]` : ""}` : "";
      console.log(`[pipeline]   ${icon} ${c.category}${detail}`);
    }
    console.log(`[pipeline] result: ${safe ? "PASS ✓" : `FAIL ✗  top reason: "${flagReason ?? "unknown"}"`}`);

    if (safe) return { draft, attempts: attempt, blocked: false };

    if (attempt > MAX_SAFETY_RETRIES) {
      console.log(`[pipeline] BLOCKED platform=${platform} after ${attempt} attempt(s) — giving up`);
      return { draft, attempts: attempt, blocked: true, flagReason: flagReason ?? undefined };
    }

    // Build correction hints from the failed checks and regenerate
    const failedChecks = checks.filter((c) => !c.passed);
    const safetyFeedback = buildRegenerationHints(failedChecks) ?? "";
    console.log(`[pipeline] RETRY   platform=${platform} attempt=${attempt} — injecting safety feedback into regeneration`);

    const retryBrief: ContentBrief = {
      ...brief,
      selectedPlatforms: [platform], // regenerate this platform only
      safetyFeedback,
    };

    const { platforms: regenerated } = await generateContentForBrief(anthropic, retryBrief);
    if (regenerated[0]) draft = regenerated[0];
  }

  return { draft, attempts: MAX_SAFETY_RETRIES + 1, blocked: true };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PipelineRunResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { brief, mediaUrl, dateRangeDays = 30 } = req.body as PipelineRunRequest;

  if (!brief?.topic || !brief?.selectedPlatforms?.length) {
    return res.status(400).json({
      success: false,
      error: "brief.topic and brief.selectedPlatforms are required",
    });
  }
  if (!mediaUrl?.trim()) {
    return res.status(400).json({ success: false, error: "mediaUrl is required" });
  }

  try {
    // ── Step 1: Inject latest feedback hints if the caller didn't supply them ──
    let enrichedBrief = brief;
    if (!brief.optimizationHints) {
      const latest = await prisma.feedbackSnapshot.findFirst({
        orderBy: { createdAt: "desc" },
      });
      if (latest) {
        try {
          enrichedBrief = {
            ...brief,
            optimizationHints: JSON.parse(latest.hints) as ContentOptimizationHints,
          };
        } catch {
          // Malformed snapshot — proceed without hints
        }
      }
    }

    // ── Step 2: Generate platform-specific content ─────────────────────────────
    const { briefId, platforms: drafts } = await generateContentForBrief(
      anthropic,
      enrichedBrief
    );

    console.log(`\n[pipeline] ── Generation complete  briefId=${briefId} ──────────────────`);
    for (const d of drafts) {
      console.log(`[pipeline] DRAFT    platform=${d.platform}`);
      console.log(`[pipeline]          caption : "${d.caption.slice(0, 120)}${d.caption.length > 120 ? "…" : ""}"`);
      console.log(`[pipeline]          hashtags: [${d.hashtags.map((h) => `#${h}`).join(", ")}]`);
    }

    // ── Step 3: Fetch all connected accounts once ──────────────────────────────
    const accounts = await prisma.socialAccount.findMany();
    const accountByPlatform: Record<string, (typeof accounts)[0]> = Object.fromEntries(
      accounts.map((a) => [a.platform, a])
    );

    // ── Step 4: Safety check → publish → save (per platform, in parallel) ──────
    const results: PlatformPipelineResult[] = await Promise.all(
      drafts.map(async (draft: GeneratedPlatformContent): Promise<PlatformPipelineResult> => {
        const account = accountByPlatform[draft.platform];

        // No connected account — log and skip publishing
        if (!account) {
          await prisma.socialPost.create({
            data: {
              platform: draft.platform,
              mediaUrl,
              caption: draft.caption,
              hashtags: JSON.stringify(draft.hashtags),
              postStatus: "no_account",
              success: false,
            },
          });
          return {
            platform: draft.platform as Platform,
            status: "no_account",
            caption: draft.caption,
            hashtags: draft.hashtags,
          };
        }

        // ── Safety check with up to 2 auto-regeneration retries ────────────────
        const {
          draft: safeDraft,
          attempts,
          blocked,
          flagReason: retryFlagReason,
        } = await retryUntilSafe(anthropic, enrichedBrief, draft);

        if (blocked) {
          const record = await prisma.socialPost.create({
            data: {
              platform: safeDraft.platform,
              mediaUrl,
              caption: safeDraft.caption,
              hashtags: JSON.stringify(safeDraft.hashtags),
              postStatus: "safety_blocked",
              success: false,
              safetyBlocked: true,
              flagReason: retryFlagReason ?? null,
            },
          });
          return {
            platform: safeDraft.platform as Platform,
            status: "safety_blocked",
            postId: record.id,
            flagReason: retryFlagReason,
            caption: safeDraft.caption,
            hashtags: safeDraft.hashtags,
            retryCount: attempts,
          };
        }

        // ── Publish the safe draft ──────────────────────────────────────────────
        const publishResult = await publishToSocialPlatform({
          platform: safeDraft.platform as Platform,
          media_url: mediaUrl,
          caption: safeDraft.caption,
          hashtags: safeDraft.hashtags,
          accessToken: account.accessToken,
        });

        const postStatus = publishResult.safetyBlocked
          ? "safety_blocked"
          : publishResult.success
            ? "published"
            : "failed";

        console.log(`\n[pipeline] ── Publish result  platform=${safeDraft.platform} ──────────────────`);
        console.log(`[pipeline] status      : ${postStatus}`);
        console.log(`[pipeline] safety retry: ${attempts} attempt(s)`);
        if (postStatus === "published") {
          console.log(`[pipeline] postId      : ${publishResult.platform_post_id ?? "(mock)"}`);
        }
        if (postStatus === "safety_blocked") {
          console.log(`[pipeline] block reason: ${publishResult.flagReason ?? "unknown"}`);
        }

        const record = await prisma.socialPost.create({
          data: {
            platform: safeDraft.platform,
            mediaUrl,
            caption: safeDraft.caption,
            hashtags: JSON.stringify(safeDraft.hashtags),
            postStatus,
            success: publishResult.success,
            platformPostId: publishResult.platform_post_id ?? null,
            safetyBlocked: publishResult.safetyBlocked ?? false,
            flagReason: publishResult.flagReason ?? null,
          },
        });

        return {
          platform: safeDraft.platform as Platform,
          status: postStatus,
          postId: record.id,
          platformPostId: publishResult.platform_post_id,
          flagReason: publishResult.flagReason,
          caption: safeDraft.caption,
          hashtags: safeDraft.hashtags,
          retryCount: attempts,
        };
      })
    );

    // ── Step 5: Feedback loop — fetch insights, generate hints, save snapshot ──
    let feedbackHints: ContentOptimizationHints | undefined;
    try {
      // Use real data when env vars are configured, otherwise fall back to mock
      const gaData = getMockGAData(dateRangeDays);      // TODO: swap with real GA4 client when GA4_PROPERTY_ID is set
      const igData = getMockInstagramData(dateRangeDays); // TODO: swap with real IG Graph API when INSTAGRAM_ACCESS_TOKEN is set

      const optimizationPrompt = buildOptimizationPrompt(gaData, igData);
      const optimizationResponse = await anthropic.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content: optimizationPrompt }],
      });

      const rawText = optimizationResponse.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      feedbackHints = parseOptimizationResponse(rawText, gaData, igData);

      // Persist for the next content generation run
      await prisma.feedbackSnapshot.create({
        data: {
          hints: JSON.stringify(feedbackHints),
          gaIsMock: gaData.isMock,
          igIsMock: igData.isMock,
        },
      });
    } catch {
      // Feedback loop is non-critical — pipeline result is still returned
    }

    return res.status(200).json({
      success: true,
      briefId,
      results,
      feedbackHints,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    return res.status(500).json({ success: false, error: message });
  }
}
