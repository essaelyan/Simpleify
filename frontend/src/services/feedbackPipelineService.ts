/**
 * feedbackPipelineService.ts — Feedback Pipeline (Steps 5–7)
 *
 * Extracted from /api/pipeline/run so these stages can run outside the
 * critical request path. Called by POST /api/feedback/process-run.
 *
 * Stages:
 *   Step 5  Fetch GA4 + Instagram analytics (direct service calls)
 *   Step 6  Feedback Optimization Agent (Opus) → ContentOptimizationHints
 *   Step 7  Persist FeedbackSnapshot to DB
 *
 * Server-side only. Always throws on failure — callers decide how to handle.
 */

import Anthropic from "@anthropic-ai/sdk";
import { fetchGAData, fetchInstagramData } from "@/services/analyticsDataService";
import { buildOptimizationPrompt, parseOptimizationResponse } from "@/services/feedbackLoop";
import type { ContentOptimizationHints } from "@/types/feedbackLoop";
import prisma from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeedbackDataSources {
  ga: { isMock: boolean; sessions: number };
  instagram: { isMock: boolean; posts: number; avgEngagement: number };
}

export interface FeedbackPipelineResult {
  hints: ContentOptimizationHints;
  dataSources: FeedbackDataSources;
  timings: {
    dataFetchMs: number;
    optimizationMs: number;
    persistMs: number;
  };
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

function flog(message: string): void {
  console.log(`[feedback] ${message}`);
}

function stageTimer(): () => number {
  const t0 = Date.now();
  return () => Date.now() - t0;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Runs the feedback pipeline stages extracted from the main content pipeline.
 * Throws on any failure — the caller should wrap in try/catch.
 */
export async function runFeedbackPipeline(
  anthropic: Anthropic,
  dateRangeDays: number
): Promise<FeedbackPipelineResult> {
  // ── Step 5: Analytics data fetch ──────────────────────────────────────────
  flog("stage=data_fetch");
  const tFetch = stageTimer();
  const [gaData, igData] = await Promise.all([
    fetchGAData(dateRangeDays),
    fetchInstagramData(dateRangeDays),
  ]);
  const dataFetchMs = tFetch();
  flog(`stage=data_fetch durationMs=${dataFetchMs} ga.isMock=${gaData.isMock} ig.isMock=${igData.isMock} ga.sessions=${gaData.totalSessions}`);

  // ── Step 6: Feedback Optimization Agent (Opus) ────────────────────────────
  flog("stage=optimization");
  const tOptimize = stageTimer();
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
  const hints = parseOptimizationResponse(rawText, gaData, igData);
  const optimizationMs = tOptimize();
  flog(`stage=optimization durationMs=${optimizationMs}`);

  // ── Step 7: Persist FeedbackSnapshot ──────────────────────────────────────
  flog("stage=persist");
  const tPersist = stageTimer();
  await prisma.feedbackSnapshot.create({
    data: {
      hints: JSON.stringify(hints),
      gaIsMock: gaData.isMock,
      igIsMock: igData.isMock,
    },
  });
  const persistMs = tPersist();
  flog(`stage=persist durationMs=${persistMs}`);

  return {
    hints,
    dataSources: {
      ga: { isMock: gaData.isMock, sessions: gaData.totalSessions },
      instagram: {
        isMock: igData.isMock,
        posts: igData.totalPosts,
        avgEngagement: igData.avgEngagementRate,
      },
    },
    timings: { dataFetchMs, optimizationMs, persistMs },
  };
}
