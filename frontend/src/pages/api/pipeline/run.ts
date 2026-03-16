/**
 * POST /api/pipeline/run
 *
 * Production content pipeline — end-to-end orchestration of all agents.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  PIPELINE STAGES                                                        │
 * │                                                                         │
 * │  Step 0   Load BrandVoiceProfile from DB                               │
 * │  Step 1   Load latest FeedbackSnapshot → inject as optimizationHints  │
 * │  Step 1b  Brief Enrichment Agent (Agent C, Haiku)                      │
 * │  Step 2   Content Generation Agent (Opus) — brand voice + enrichment  │
 * │             + feedback hints + QA revision guidance                    │
 * │  Step 3   Load connected social accounts from DB                       │
 * │  Step 4   Per-platform in parallel:                                     │
 * │             4a  Content QA Agent (Agent D, Haiku)                      │
 * │                   → revise once if verdict = "revise"                  │
 * │                   → skip platform if verdict = "reject"                │
 * │             4b  Safety Agent (Haiku)                                   │
 * │                   → regenerate + retry up to MAX_SAFETY_RETRIES times  │
 * │             4c  Verify connected account (skip if absent)              │
 * │             4d  Social Publishing Agent                                 │
 * │             4e  Persist SocialPost record                               │
 * │                                                                         │
 * │  Steps 5–7 (analytics fetch, feedback optimization, snapshot persist)  │
 * │  run asynchronously via POST /api/feedback/process-run, triggered by   │
 * │  the UI after this response is received.                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Failure contract:
 *   - One platform error never breaks the full run (processPlatform catches all).
 *   - Agent failures (enrichment, QA) degrade gracefully with inline fallbacks.
 *
 * Input:  { brief: ContentBrief, mediaUrl: string }
 * Output: PipelineRunResponse (full contract defined below)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type {
  AdvancedSafetyRequest,
  ContentBrief,
  Platform,
  GeneratedPlatformContent,
  SafetyCheckResult,
} from "@/types/autoPosting";
import type { ContentOptimizationHints } from "@/types/feedbackLoop";
import type { BrandVoiceProfile } from "@/types/brandVoice";
import type { ContentQAResult, QAVerdict, QAIssue, DuplicationRisk } from "@/types/contentQA";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import { generateContentForBrief } from "@/services/contentGenerator";
import { publishToSocialPlatform } from "@/services/socialPublisher";
import {
  buildSafetyCheckPrompt,
  parseSafetyCheckResponse,
  buildRegenerationHints,
} from "@/services/safetyFilter";
import { loadActiveBrandVoice, brandVoiceToPromptText } from "@/services/brandVoiceService";
import { enrichBrief } from "@/services/briefEnrichmentAgent";
import { runContentQA } from "@/services/contentQAAgent";
import prisma from "@/lib/prisma";

// ─── Anthropic client ─────────────────────────────────────────────────────────
//
// timeout: 60 000 ms (60 s) per call prevents indefinite hangs when the API
// is slow.  The pipeline can still take several minutes in total because it
// makes multiple sequential / parallel calls — the timeout is per-call, not
// for the full run.

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
  timeout: 60_000,
});

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of safety regeneration attempts after the first failure. */
const MAX_SAFETY_RETRIES = 2;

// ─── Response Types ───────────────────────────────────────────────────────────

/**
 * UI-ready status for a single platform after the full pipeline run.
 *
 * published       — content passed QA, safety, and was sent to the platform
 * safety_blocked  — safety agent rejected after all retries
 * qa_rejected     — QA agent rejected even after one rewrite attempt
 * no_account      — no connected account for this platform; content is ready but not published
 * failed          — unexpected runtime error during this platform's processing
 */
export type PlatformStatus =
  | "published"
  | "safety_blocked"
  | "qa_rejected"
  | "no_account"
  | "failed";

export interface QASummary {
  verdict: QAVerdict;
  overallScore: number;
  hookScore: number;
  ctaScore: number;
  readabilityScore: number;
  platformFitScore: number;
  brandAlignmentScore: number;
  duplicationRisk: DuplicationRisk;
  issues: QAIssue[];
  /** 1 = passed first time; 2 = needed one rewrite */
  attempts: number;
}

export interface SafetySummary {
  passed: boolean;
  /** Total number of safety check calls made (1 = passed first time) */
  attempts: number;
  flagReason: string | null;
}

export interface PublishSummary {
  success: boolean;
  platformPostId: string | null;
  isMock: boolean;
}

export interface PlatformPipelineResult {
  platform: Platform;
  status: PlatformStatus;
  /** Final caption after all rewrites (null only on unexpected failure). */
  caption: string | null;
  /** Final hashtag array after all rewrites (null only on unexpected failure). */
  hashtags: string[] | null;
  /** QA result. Null only if the QA agent itself failed to run (infrastructure error). */
  qa: QASummary | null;
  /** Safety result. Null if QA rejected before safety ran. */
  safety: SafetySummary | null;
  /** Publish outcome. Null if not attempted (qa_rejected / safety_blocked / no_account / failed). */
  publish: PublishSummary | null;
  /** DB id of the persisted SocialPost record. */
  postId: string | null;
  /** Human-readable reason explaining a non-published status. */
  reason: string | null;
}

// ─── Request / Response Contract ─────────────────────────────────────────────

interface PipelineRunRequest {
  brief: ContentBrief;
  /** Media URL attached to this post. Defaults to "" when no media is provided. */
  mediaUrl?: string;
}

/** Shape of the `data` field in ApiResponse<PipelineRunData>. */
export interface PipelineRunData {
  /** Stable identifier for the generated content batch. */
  briefId: string | null;
  startedAt: string;
  completedAt: string;
  /** Brand voice state at the start of this run. */
  brandVoice: {
    loaded: boolean;
    name: string | null;
  };
  /** Brief Enrichment Agent (Agent C) outcome. */
  enrichment: {
    success: boolean;
    summary: string | null;
    failReason: string | null;
  };
  /** Per-platform results — one entry per platform in brief.selectedPlatforms. */
  platforms: PlatformPipelineResult[];
  /**
   * Always null — feedback runs asynchronously via POST /api/feedback/process-run.
   * The UI triggers that route after receiving this response and updates the
   * optimization store once hints arrive.
   */
  feedbackHints: ContentOptimizationHints | null;
  /** Always null — feedback data sources are returned by /api/feedback/process-run. */
  feedbackDataSources: {
    ga: { isMock: boolean; sessions: number };
    instagram: { isMock: boolean; posts: number; avgEngagement: number };
  } | null;
  /**
   * true when the pipeline has handed off feedback processing to
   * POST /api/feedback/process-run. The UI should trigger that route and
   * show a "Feedback analysis pending" indicator until it completes.
   */
  feedbackScheduled: boolean;
}

/** Full API envelope type for consumers that need to type the response. */
export type PipelineRunResponse = ApiResponse<PipelineRunData>;

// ─── Logging helper ───────────────────────────────────────────────────────────

/** Scoped pipeline logger. Format: [pipeline:platform] message */
function plog(platform: string, message: string): void {
  console.log(`[pipeline:${platform}] ${message}`);
}

/** Top-level (non-platform-scoped) pipeline logger. */
function log(message: string): void {
  console.log(`[pipeline] ${message}`);
}

/** Returns a function that yields elapsed milliseconds since stageTimer() was called. */
function stageTimer(): () => number {
  const t0 = Date.now();
  return () => Date.now() - t0;
}

// ─── QA result adapter ────────────────────────────────────────────────────────

function toQASummary(result: ContentQAResult | null, attempts: number): QASummary | null {
  if (!result) return null;
  return {
    verdict: result.verdict,
    overallScore: result.overallScore,
    hookScore: result.hookScore,
    ctaScore: result.ctaScore,
    readabilityScore: result.readabilityScore,
    platformFitScore: result.platformFitScore,
    brandAlignmentScore: result.brandAlignmentScore,
    duplicationRisk: result.duplicationRisk,
    issues: result.issues,
    attempts,
  };
}

// ─── Safety Agent helpers ─────────────────────────────────────────────────────

/**
 * Runs a single safety check call on a draft.
 * Owned by: Safety Agent (Haiku).
 */
async function runSafetyCheck(
  platform: Platform,
  caption: string,
  hashtags: string[],
  brandVoice: BrandVoiceProfile | null
): Promise<{ safe: boolean; flagReason: string | null; checks: SafetyCheckResult[] }> {
  const req: AdvancedSafetyRequest = {
    draftId: Date.now().toString(36) + Math.random().toString(36).slice(2),
    platform,
    caption,
    hashtags,
    brandVoice: brandVoice ? brandVoiceToPromptText(brandVoice) : null,
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
 * Runs the safety check, retrying with injected correction hints up to
 * MAX_SAFETY_RETRIES times if content fails.
 *
 * On each retry, the brief is narrowed to the failing platform only, and
 * safetyFeedback is populated with structured hints derived from the failed
 * checks. Regeneration uses Opus for quality parity with the original pass.
 *
 * Owned by: Safety Agent (Haiku checks) + Content Generation Agent (retries).
 */
async function retryUntilSafe(
  brief: ContentBrief,
  initialDraft: GeneratedPlatformContent,
  brandVoice: BrandVoiceProfile | null
): Promise<{
  draft: GeneratedPlatformContent;
  attempts: number;
  blocked: boolean;
  flagReason: string | undefined;
}> {
  let draft = initialDraft;
  const platform = draft.platform as Platform;

  for (let attempt = 1; attempt <= MAX_SAFETY_RETRIES + 1; attempt++) {
    const { safe, flagReason, checks } = await runSafetyCheck(
      platform,
      draft.caption,
      draft.hashtags,
      brandVoice
    );

    plog(platform, `safety attempt=${attempt}/${MAX_SAFETY_RETRIES + 1} result=${safe ? "PASS ✓" : `FAIL ✗ "${flagReason ?? "unknown"}"`}`);
    for (const c of checks) {
      if (!c.passed) {
        plog(platform, `  ✗ ${c.category}: ${c.reason ?? ""} [${c.severity ?? ""}]`);
      }
    }

    if (safe) return { draft, attempts: attempt, blocked: false, flagReason: undefined };

    if (attempt > MAX_SAFETY_RETRIES) {
      plog(platform, `safety BLOCKED after ${attempt} attempt(s)`);
      return { draft, attempts: attempt, blocked: true, flagReason: flagReason ?? undefined };
    }

    // Inject failure hints and regenerate this platform only
    const safetyFeedback = buildRegenerationHints(checks.filter((c) => !c.passed)) ?? "";
    plog(platform, `safety RETRY attempt=${attempt} — injecting correction hints`);

    const retryBrief: ContentBrief = {
      ...brief,
      selectedPlatforms: [platform],
      safetyFeedback,
    };
    const { platforms: regenerated } = await generateContentForBrief(
      anthropic,
      retryBrief,
      "claude-opus-4-6",
      brandVoice
    );
    if (regenerated[0]) draft = regenerated[0];
  }

  return { draft, attempts: MAX_SAFETY_RETRIES + 1, blocked: true, flagReason: undefined };
}

// ─── Content QA Agent helpers ─────────────────────────────────────────────────

/**
 * Runs the QA check. If verdict = "revise", regenerates once with QA guidance
 * injected, then re-runs QA. If the second QA pass also returns "reject",
 * the platform is marked for skipping.
 *
 * A QA infrastructure failure (API error / bad JSON) is treated as a pass so
 * pipeline progress is never blocked by QA infra.
 *
 * Owned by: Content QA Agent (Agent D, Haiku) + Content Generation Agent (rewrite).
 */
async function runQAWithRetry(
  brief: ContentBrief,
  draft: GeneratedPlatformContent,
  brandVoice: BrandVoiceProfile | null,
  otherPlatformCaptions: string[]
): Promise<{
  draft: GeneratedPlatformContent;
  qaResult: ContentQAResult | null;
  qaAttempts: number;
  rejected: boolean;
}> {
  const platform = draft.platform as Platform;
  const brandVoiceText = brandVoice ? brandVoiceToPromptText(brandVoice) : null;

  // ── Pass 1 ────────────────────────────────────────────────────────────────
  const qa1 = await runContentQA(
    anthropic,
    platform,
    draft.caption,
    draft.hashtags,
    brief,
    brandVoiceText,
    otherPlatformCaptions
  );

  if (!qa1.success || !qa1.result) {
    plog(platform, `qa infra error (${qa1.failReason ?? "unknown"}) — treating as pass`);
    return { draft, qaResult: null, qaAttempts: 1, rejected: false };
  }

  const r1 = qa1.result;
  plog(
    platform,
    `qa pass=1 verdict=${r1.verdict} overall=${r1.overallScore} ` +
    `hook=${r1.hookScore} cta=${r1.ctaScore} read=${r1.readabilityScore} ` +
    `fit=${r1.platformFitScore} brand=${r1.brandAlignmentScore} dup=${r1.duplicationRisk}`
  );
  for (const issue of r1.issues) {
    plog(platform, `  [${issue.severity}] ${issue.dimension}: ${issue.description}`);
  }

  if (r1.verdict === "reject") {
    plog(platform, `qa REJECTED on pass 1 — skipping platform`);
    return { draft, qaResult: r1, qaAttempts: 1, rejected: true };
  }

  if (r1.verdict === "pass") {
    return { draft, qaResult: r1, qaAttempts: 1, rejected: false };
  }

  // ── Revise: regenerate once with QA guidance ──────────────────────────────
  plog(platform, `qa REVISE — regenerating with guidance`);
  if (r1.revisionGuidance) {
    plog(platform, `  guidance: "${r1.revisionGuidance.slice(0, 100)}${r1.revisionGuidance.length > 100 ? "…" : ""}"`);
  }

  const reviseBrief: ContentBrief = {
    ...brief,
    selectedPlatforms: [platform],
    qaRevisionGuidance: r1.revisionGuidance ?? null,
  };
  const { platforms: regenerated } = await generateContentForBrief(
    anthropic,
    reviseBrief,
    "claude-opus-4-6",
    brandVoice
  );
  const revisedDraft = regenerated[0] ?? draft;

  // ── Pass 2 ────────────────────────────────────────────────────────────────
  const qa2 = await runContentQA(
    anthropic,
    platform,
    revisedDraft.caption,
    revisedDraft.hashtags,
    brief,
    brandVoiceText,
    otherPlatformCaptions
  );

  if (!qa2.success || !qa2.result) {
    plog(platform, `qa pass 2 infra error — treating revised draft as pass`);
    return { draft: revisedDraft, qaResult: r1, qaAttempts: 2, rejected: false };
  }

  const r2 = qa2.result;
  plog(
    platform,
    `qa pass=2 verdict=${r2.verdict} overall=${r2.overallScore} ` +
    `hook=${r2.hookScore} cta=${r2.ctaScore} read=${r2.readabilityScore} ` +
    `fit=${r2.platformFitScore} brand=${r2.brandAlignmentScore} dup=${r2.duplicationRisk}`
  );

  if (r2.verdict === "reject") {
    plog(platform, `qa REJECTED after revision — skipping platform`);
    return { draft: revisedDraft, qaResult: r2, qaAttempts: 2, rejected: true };
  }

  // "revise" or "pass" after one rewrite — proceed to safety
  return { draft: revisedDraft, qaResult: r2, qaAttempts: 2, rejected: false };
}

// ─── Per-platform orchestrator ────────────────────────────────────────────────

/**
 * Processes a single platform draft through the full agent chain:
 *   QA → safety → account check → publish → persist.
 *
 * Catches all unexpected errors and returns status="failed" rather than
 * propagating. This keeps Promise.all() from aborting the entire run.
 *
 * ── SocialPost persistence ownership ──────────────────────────────────────────
 * This function is the SOLE writer of SocialPost records for pipeline runs.
 * It calls publishToSocialPlatform() directly (not via HTTP to /api/social/publish),
 * so there are NO duplicate DB writes between the pipeline and the publish route.
 *
 * /api/social/publish is reserved for standalone flows (Repurpose, manual posts).
 * It also owns its own SocialPost writes for those flows independently.
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function processPlatform(
  draft: GeneratedPlatformContent,
  enrichedBrief: ContentBrief,
  brandVoice: BrandVoiceProfile | null,
  /** Null means no account is connected for this platform. */
  account: { accessToken: string } | null,
  mediaUrl: string,
  /** Captions of all other platforms in this batch — used for duplication detection. */
  otherPlatformCaptions: string[]
): Promise<PlatformPipelineResult> {
  const platform = draft.platform as Platform;

  try {
    // ── 4a: Content QA Agent ───────────────────────────────────────────────
    // Owned by: contentQAAgent.ts (Agent D)
    // Evaluates hook, CTA, readability, platform fit, brand alignment, duplication.
    // Revises once if verdict = "revise"; skips platform if verdict = "reject".
    plog(platform, "stage=qa");
    const tQA = stageTimer();
    const {
      draft: qaDraft,
      qaResult,
      qaAttempts,
      rejected: qaRejected,
    } = await runQAWithRetry(enrichedBrief, draft, brandVoice, otherPlatformCaptions);
    plog(platform, `[pipeline] stage=qa durationMs=${tQA()}`);

    if (qaRejected) {
      const record = await prisma.socialPost.create({
        data: {
          platform,
          mediaUrl,
          caption: qaDraft.caption,
          hashtags: JSON.stringify(qaDraft.hashtags),
          postStatus: "qa_rejected",
          success: false,
          flagReason: (
            qaResult?.revisionGuidance
              ? `QA rejected: ${qaResult.revisionGuidance}`
              : "QA rejected: content quality below threshold"
          ).slice(0, 255),
        },
      });
      plog(platform, `status=qa_rejected  postId=${record.id}`);
      return {
        platform,
        status: "qa_rejected",
        caption: qaDraft.caption,
        hashtags: qaDraft.hashtags,
        qa: toQASummary(qaResult, qaAttempts),
        safety: null,
        publish: null,
        postId: record.id,
        reason: qaResult?.revisionGuidance ?? "Content quality below threshold",
      };
    }

    // ── 4b: Safety Agent ───────────────────────────────────────────────────
    // Owned by: safetyFilter.ts (Haiku)
    // Checks profanity, brand voice, duplicate content, spam, platform rules.
    // Injects correction hints and regenerates up to MAX_SAFETY_RETRIES times.
    plog(platform, "stage=safety");
    const tSafety = stageTimer();
    const {
      draft: safeDraft,
      attempts: safetyAttempts,
      blocked,
      flagReason,
    } = await retryUntilSafe(enrichedBrief, qaDraft, brandVoice);
    plog(platform, `[pipeline] stage=safety durationMs=${tSafety()}`);

    if (blocked) {
      const record = await prisma.socialPost.create({
        data: {
          platform,
          mediaUrl,
          caption: safeDraft.caption,
          hashtags: JSON.stringify(safeDraft.hashtags),
          postStatus: "safety_blocked",
          success: false,
          safetyBlocked: true,
          flagReason: flagReason ?? null,
        },
      });
      plog(platform, `status=safety_blocked  attempts=${safetyAttempts}  postId=${record.id}`);
      return {
        platform,
        status: "safety_blocked",
        caption: safeDraft.caption,
        hashtags: safeDraft.hashtags,
        qa: toQASummary(qaResult, qaAttempts),
        safety: { passed: false, attempts: safetyAttempts, flagReason: flagReason ?? null },
        publish: null,
        postId: record.id,
        reason: flagReason ?? "Safety check failed",
      };
    }

    // ── 4c: Account verification ───────────────────────────────────────────
    // Content is quality-approved and safety-cleared. Check for a connected
    // account before attempting to publish.
    if (!account) {
      const record = await prisma.socialPost.create({
        data: {
          platform,
          mediaUrl,
          caption: safeDraft.caption,
          hashtags: JSON.stringify(safeDraft.hashtags),
          postStatus: "no_account",
          success: false,
        },
      });
      plog(platform, `status=no_account — content ready but no connected account  postId=${record.id}`);
      return {
        platform,
        status: "no_account",
        caption: safeDraft.caption,
        hashtags: safeDraft.hashtags,
        qa: toQASummary(qaResult, qaAttempts),
        safety: { passed: true, attempts: safetyAttempts, flagReason: null },
        publish: null,
        postId: record.id,
        reason: "No connected account for this platform",
      };
    }

    // ── 4d: Social Publishing Agent ────────────────────────────────────────
    // Owned by: socialPublisher.ts
    // Publishes the QA-approved, safety-cleared draft to the live platform.
    // SOCIAL_PUBLISH_MOCK=true → returns a mock post ID (default for dev).
    plog(platform, "stage=publishing");
    const publishResult = await publishToSocialPlatform({
      platform,
      media_url: mediaUrl,
      caption: safeDraft.caption,
      hashtags: safeDraft.hashtags,
      accessToken: account.accessToken,
    });

    // ── 4e: Persist SocialPost ─────────────────────────────────────────────
    const finalStatus: PlatformStatus = publishResult.success ? "published" : "failed";
    const record = await prisma.socialPost.create({
      data: {
        platform,
        mediaUrl,
        caption: safeDraft.caption,
        hashtags: JSON.stringify(safeDraft.hashtags),
        postStatus: finalStatus,
        success: publishResult.success,
        platformPostId: publishResult.platform_post_id ?? null,
        safetyBlocked: false,
        flagReason: null,
      },
    });

    plog(
      platform,
      `status=${finalStatus}  safetyAttempts=${safetyAttempts}  qaAttempts=${qaAttempts}` +
      (publishResult.success ? `  platformPostId=${publishResult.platform_post_id ?? "(mock)"}` : "") +
      `  postId=${record.id}`
    );

    return {
      platform,
      status: finalStatus,
      caption: safeDraft.caption,
      hashtags: safeDraft.hashtags,
      qa: toQASummary(qaResult, qaAttempts),
      safety: { passed: true, attempts: safetyAttempts, flagReason: null },
      publish: {
        success: publishResult.success,
        platformPostId: publishResult.platform_post_id ?? null,
        isMock: publishResult.isMock ?? false,
      },
      postId: record.id,
      reason: publishResult.success ? null : "Publish API returned a failure",
    };
  } catch (err) {
    // Unexpected runtime error — log and return a failed result so other
    // platforms in the Promise.all() are not affected.
    const message = err instanceof Error ? err.message : "Unexpected platform error";
    plog(platform, `ERROR: ${message}`);

    try {
      await prisma.socialPost.create({
        data: {
          platform,
          mediaUrl,
          caption: draft.caption,
          hashtags: JSON.stringify(draft.hashtags),
          postStatus: "failed",
          success: false,
          flagReason: message.slice(0, 255),
        },
      });
    } catch {
      // DB write in the error path — swallow silently
    }

    return {
      platform,
      status: "failed",
      caption: draft.caption,
      hashtags: draft.hashtags,
      qa: null,
      safety: null,
      publish: null,
      postId: null,
      reason: message,
    };
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PipelineRunResponse>
): Promise<void> {
  if (req.method !== "POST") {
    fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
    return;
  }

  // Fail fast with a clear config error rather than a cryptic Anthropic SDK
  // error deep inside a library when the API key is absent.
  if (!process.env.CLAUDE_API_KEY) {
    fail(
      res, 500, "CONFIG_ERROR",
      "CLAUDE_API_KEY is not set. Configure it in .env.local (local) or the deployment environment."
    );
    return;
  }

  const startedAt = new Date().toISOString();
  const { brief, mediaUrl = "" } = req.body as PipelineRunRequest;

  if (!brief?.topic || !brief?.selectedPlatforms?.length) {
    fail(res, 400, API_ERRORS.BAD_REQUEST, "brief.topic and brief.selectedPlatforms are required");
    return;
  }
  // mediaUrl is optional — defaults to "" when no media is attached to this post.

  try {
    // ── Step 0: Brand Voice Agent ────────────────────────────────────────────
    // Owned by: brandVoiceService.ts
    // Loads the active BrandVoiceProfile from the DB. If none is configured,
    // null is passed through every downstream agent — all handle null gracefully.
    log("── Step 0: Loading brand voice ──────────────────────────────────────");
    const tBrandVoice = stageTimer();
    const brandVoice = await loadActiveBrandVoice();
    const brandVoiceSummary = { loaded: brandVoice !== null, name: brandVoice?.name ?? null };
    log(brandVoice ? `brand voice: "${brandVoice.name}"` : "brand voice: not configured");
    log(`[pipeline] stage=brand_voice durationMs=${tBrandVoice()}`);

    // ── Step 1: FeedbackSnapshot injection ───────────────────────────────────
    // Loads the most recent FeedbackSnapshot and injects its hints into the
    // brief as optimizationHints. Skipped if the caller already supplied hints.
    log("── Step 1: Loading feedback hints ───────────────────────────────────");
    let enrichedBrief: ContentBrief = brief;
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
          log("feedback hints: loaded from latest snapshot");
        } catch {
          log("feedback hints: snapshot parse failed — proceeding without hints");
        }
      } else {
        log("feedback hints: no snapshot found — proceeding without hints");
      }
    } else {
      log("feedback hints: supplied by caller — skipping DB load");
    }

    // ── Step 1b: Brief Enrichment Agent (Agent C) ─────────────────────────────
    // Owned by: briefEnrichmentAgent.ts
    // Transforms the thin user brief into a strategically-grounded brief with
    // content angles, hooks, CTAs, and audience framing. Failure is non-fatal.
    log("── Step 1b: Brief Enrichment Agent ──────────────────────────────────");
    const tEnrichment = stageTimer();
    const enrichmentResult = await enrichBrief(
      anthropic,
      enrichedBrief,
      brandVoice,
      enrichedBrief.optimizationHints ?? null
    );

    const enrichmentSummary = {
      success: enrichmentResult.success,
      summary: enrichmentResult.enrichment?.enrichmentSummary ?? null,
      failReason: enrichmentResult.failReason ?? null,
    };

    if (enrichmentResult.success && enrichmentResult.enrichment) {
      const e = enrichmentResult.enrichment;
      log(`enrichment: success  topic="${e.enrichedTopic.slice(0, 80)}${e.enrichedTopic.length > 80 ? "…" : ""}"`);
      log(`  angles: ${e.contentAngles.map((a) => `"${a.angle}"`).join(", ")}`);
      if (e.riskFlags.length > 0) log(`  riskFlags: ${e.riskFlags.join("; ")}`);
      enrichedBrief = { ...enrichedBrief, enrichment: enrichmentResult.enrichment };
    } else {
      log(`enrichment: failed (${enrichmentResult.failReason ?? "unknown"}) — using original brief`);
    }
    log(`[pipeline] stage=enrichment durationMs=${tEnrichment()}`);

    // ── Step 2: Content Generation Agent ──────────────────────────────────────
    // Owned by: contentGenerator.ts
    // Generates platform-specific captions via Opus. Injects brand voice,
    // enrichment context, feedback hints, and QA revision guidance into prompt.
    log("── Step 2: Generating content ───────────────────────────────────────");
    const tGeneration = stageTimer();
    const { briefId, platforms: drafts } = await generateContentForBrief(
      anthropic,
      enrichedBrief,
      "claude-opus-4-6",
      brandVoice
    );
    log(`generation complete  briefId=${briefId}  platforms=[${drafts.map((d) => d.platform).join(", ")}]`);
    for (const d of drafts) {
      log(`  ${d.platform}: "${d.caption.slice(0, 80)}${d.caption.length > 80 ? "…" : ""}"`);
    }
    log(`[pipeline] stage=generation durationMs=${tGeneration()}`);

    // ── Step 3: Load connected social accounts ────────────────────────────────
    // Loads all connected platform accounts once. Platforms without an account
    // receive null in processPlatform and are stored with status="no_account".
    log("── Step 3: Loading connected accounts ───────────────────────────────");
    const accounts = await prisma.socialAccount.findMany();
    const accountByPlatform: Record<string, { accessToken: string }> = Object.fromEntries(
      accounts.map((a) => [a.platform, { accessToken: a.accessToken }])
    );
    log(`accounts found: [${accounts.map((a) => a.platform).join(", ") || "none"}]`);

    // ── Step 4: Per-platform agent chain ──────────────────────────────────────
    // Each platform runs independently in parallel: QA → safety → publish.
    // processPlatform() is the single entry point; it never throws.
    log("── Step 4: Per-platform processing (parallel) ───────────────────────");
    const tPlatforms = stageTimer();
    const allCaptions = drafts.map((d) => d.caption);

    const platforms: PlatformPipelineResult[] = await Promise.all(
      drafts.map((draft: GeneratedPlatformContent) => {
        const otherCaptions = allCaptions.filter((c) => c !== draft.caption);
        return processPlatform(
          draft,
          enrichedBrief,
          brandVoice,
          accountByPlatform[draft.platform] ?? null,
          mediaUrl,
          otherCaptions
        );
      })
    );
    log(`[pipeline] stage=platform_processing durationMs=${tPlatforms()}`);

    // ── Steps 5–7: Feedback pipeline (async, off critical path) ──────────────
    // Analytics fetch, feedback optimization, and FeedbackSnapshot persist run
    // via POST /api/feedback/process-run — triggered by the UI after this
    // response is received. This keeps the pipeline well within the 60 s budget.
    log("[pipeline] feedbackScheduled=true — Steps 5–7 handed off to /api/feedback/process-run");

    const feedbackHints: ContentOptimizationHints | null = null;
    const feedbackDataSources: PipelineRunData["feedbackDataSources"] = null;

    const completedAt = new Date().toISOString();
    log(`── Pipeline complete  briefId=${briefId}  duration=${Date.now() - new Date(startedAt).getTime()}ms ──`);
    for (const p of platforms) {
      log(`  ${p.platform}: ${p.status}  qa=${p.qa?.verdict ?? "skipped"}(${p.qa?.overallScore ?? "-"})  safety=${p.safety?.passed ?? "-"}(${p.safety?.attempts ?? "-"}x)  published=${p.status === "published"}`);
    }

    ok(
      res,
      {
        briefId,
        startedAt,
        completedAt,
        brandVoice: brandVoiceSummary,
        enrichment: enrichmentSummary,
        platforms,
        feedbackHints,
        feedbackDataSources,
        feedbackScheduled: true,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    log(`FATAL: ${message}`);
    fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
