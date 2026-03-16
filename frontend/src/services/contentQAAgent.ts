/**
 * contentQAAgent.ts — Content QA Agent (Agent D).
 *
 * Responsibility: evaluate generated captions for quality — hook strength,
 * CTA clarity, readability, platform fit, brand alignment, duplication risk,
 * and character-limit compliance — before the safety filter runs.
 *
 * Architecture:
 *   Called by pipeline/run.ts per draft, after generation and before safety.
 *   Returns a verdict of "pass" | "revise" | "reject".
 *   - pass   → proceed to safety check unchanged
 *   - revise → pipeline regenerates once with revisionGuidance injected, then
 *              re-runs QA; if still not rejected, proceeds to safety
 *   - reject → platform is skipped entirely (status = "qa_rejected")
 *
 * Model: claude-haiku-4-5-20251001 (fast, cost-effective — same tier as safety).
 *
 * Failure behaviour:
 *   Always resolves. Returns { success: false, result: null } on any error so
 *   the pipeline can fall back to treating the content as passing QA.
 *
 * Server-side only.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Platform } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";
import type { ContentBrief } from "@/types/autoPosting";
import type {
  ContentQAResult,
  QARunResult,
  QAIssue,
  QADimension,
  DuplicationRisk,
  QAVerdict,
} from "@/types/contentQA";

// ─── Prompt Builder ────────────────────────────────────────────────────────────

export function buildQAPrompt(
  platform: Platform,
  caption: string,
  hashtags: string[],
  brief: ContentBrief,
  brandVoiceText: string | null,
  recentGeneratedDrafts: string[]
): string {
  const meta = PLATFORM_META[platform];
  const hashtagStr = hashtags.length > 0 ? hashtags.map((h) => `#${h}`).join(" ") : "(none)";
  const charCount = caption.length;
  const charLimit = meta.maxChars;
  const withinLimit = charCount <= charLimit;

  const recentStr =
    recentGeneratedDrafts.length > 0
      ? recentGeneratedDrafts.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "(none — this is the only platform draft in this run)";

  const brandVoiceStr = brandVoiceText ?? "(none specified)";

  const briefContext = [
    `Topic: ${brief.topic}`,
    brief.tone ? `Tone: ${brief.tone}` : null,
    brief.targetAudience ? `Target Audience: ${brief.targetAudience}` : null,
    brief.callToAction ? `Intended CTA: ${brief.callToAction}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a senior social media content quality reviewer.
Evaluate the following ${meta.label} caption for quality across 6 dimensions.

CAPTION (${charCount} / ${charLimit} chars — ${withinLimit ? "within limit ✓" : "OVER LIMIT ✗"}):
${caption}

HASHTAGS: ${hashtagStr}

ORIGINAL BRIEF:
${briefContext}

BRAND VOICE GUIDELINE:
${brandVoiceStr}

OTHER PLATFORM DRAFTS IN THIS RUN (for duplication check):
${recentStr}

─── SCORING RUBRIC ───────────────────────────────────────────────────────────

Score each dimension 0–100.

1. hookScore — Does the opening line grab attention immediately?
   90–100: Compelling, curiosity-driven, audience-specific opening
   70–89: Decent hook, could be sharper
   40–69: Generic or weak opening — reads like a template
   0–39: No hook at all, or starts with brand name / "We are..."

2. ctaScore — Is the call-to-action clear, soft, and purposeful?
   90–100: Specific, low-friction, fits the platform naturally
   70–89: Present and reasonable, minor clarity issues
   40–69: Vague ("check it out"), missing, or too pushy
   0–39: No CTA, or blatantly promotional spam language

3. readabilityScore — Is the caption easy to read and natural?
   90–100: Flows naturally, appropriate length, human voice
   70–89: Readable but slightly choppy or over-written
   40–69: Hard to follow, run-on sentences, or robotic phrasing
   0–39: Incoherent, wall of text, or full of jargon

4. platformFitScore — Does this caption feel native to ${meta.label}?
   90–100: Perfectly matched to platform conventions, length, and culture
   70–89: Appropriate with minor fit issues
   40–69: Mismatch — too long/short, wrong register, or wrong format
   0–39: Clearly written for a different platform or generic

5. brandAlignmentScore — Does this caption match the brand voice guideline?
   If no brand voice is specified, evaluate for general professional quality.
   90–100: Matches brand voice perfectly
   70–89: Mostly aligned, small deviations
   40–69: Notable mismatch in tone or language style
   0–39: Completely off-brand or unprofessional

6. duplicationRisk — How similar is this caption to the other platform drafts?
   "none": No meaningful overlap
   "low": Minor shared phrasing, normal for shared topic
   "medium": Significant overlap — same hook or structure across platforms
   "high": Near-duplicate of another draft — audiences will see identical posts

─── CHARACTER LIMIT ─────────────────────────────────────────────────────────
The caption is currently ${charCount} characters.${
    !withinLimit
      ? `\nIMPORTANT: It EXCEEDS the ${charLimit}-character limit for ${meta.label} by ${charCount - charLimit} characters. Flag this as a high-severity character_limit issue.`
      : `\nIt is within the ${charLimit}-character limit.`
  }

─── VERDICT GUIDE ───────────────────────────────────────────────────────────
Derive a verdict from the scores and issues:
- "pass"  : overallScore ≥ 70 AND no high-severity issues AND duplicationRisk ≠ "high"
- "revise": overallScore 45–69 OR any medium-severity issues — content is salvageable with guidance
- "reject": overallScore < 45 OR any high-severity issues OR duplicationRisk = "high" OR character limit exceeded

overallScore = weighted average:
  hookScore × 0.25 + ctaScore × 0.20 + readabilityScore × 0.20 +
  platformFitScore × 0.20 + brandAlignmentScore × 0.15

─── RESPONSE FORMAT ─────────────────────────────────────────────────────────
Respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "verdict": "pass",
  "overallScore": 82,
  "hookScore": 85,
  "ctaScore": 80,
  "readabilityScore": 88,
  "platformFitScore": 79,
  "brandAlignmentScore": 76,
  "duplicationRisk": "none",
  "issues": [
    {
      "dimension": "cta",
      "description": "CTA is present but vague — 'learn more' could be more specific",
      "severity": "low"
    }
  ],
  "revisionGuidance": null
}

Rules:
- issues must only include genuine problems (not nitpicks for passing content)
- revisionGuidance must be null when verdict = "pass"
- revisionGuidance when verdict = "revise" or "reject": a concise, actionable paragraph (2–4 sentences) that a copywriter can use to rewrite the caption — be specific about what to fix and how
- Valid dimension values: hook, cta, readability, platform_fit, brand_alignment, duplication, character_limit
- Valid severity values: low, medium, high
- All scores must be integers 0–100`;
}

// ─── Response Validator ────────────────────────────────────────────────────────

function validateQAResponse(raw: unknown): ContentQAResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("QA response is not an object");
  }
  const r = raw as Record<string, unknown>;

  const VALID_VERDICTS = new Set<string>(["pass", "revise", "reject"]);
  if (typeof r.verdict !== "string" || !VALID_VERDICTS.has(r.verdict)) {
    throw new Error(`Invalid verdict: ${String(r.verdict)}`);
  }

  const scoreFields = [
    "overallScore",
    "hookScore",
    "ctaScore",
    "readabilityScore",
    "platformFitScore",
    "brandAlignmentScore",
  ];
  for (const field of scoreFields) {
    const val = r[field];
    if (typeof val !== "number" || val < 0 || val > 100) {
      throw new Error(`${field} must be a number between 0 and 100`);
    }
  }

  const VALID_DUPLICATION = new Set<string>(["none", "low", "medium", "high"]);
  if (typeof r.duplicationRisk !== "string" || !VALID_DUPLICATION.has(r.duplicationRisk)) {
    throw new Error(`Invalid duplicationRisk: ${String(r.duplicationRisk)}`);
  }

  if (!Array.isArray(r.issues)) {
    throw new Error("issues must be an array");
  }

  const VALID_DIMENSIONS = new Set<string>([
    "hook",
    "cta",
    "readability",
    "platform_fit",
    "brand_alignment",
    "duplication",
    "character_limit",
  ]);
  const VALID_SEVERITIES = new Set<string>(["low", "medium", "high"]);

  const issues: QAIssue[] = (r.issues as unknown[]).map((item) => {
    const obj = item as Record<string, unknown>;
    if (typeof obj.dimension !== "string" || !VALID_DIMENSIONS.has(obj.dimension)) {
      throw new Error(`Invalid issue dimension: ${String(obj.dimension)}`);
    }
    if (typeof obj.description !== "string") {
      throw new Error("Issue description must be a string");
    }
    if (typeof obj.severity !== "string" || !VALID_SEVERITIES.has(obj.severity)) {
      throw new Error(`Invalid issue severity: ${String(obj.severity)}`);
    }
    return {
      dimension: obj.dimension as QADimension,
      description: obj.description,
      severity: obj.severity as "low" | "medium" | "high",
    };
  });

  const revisionGuidance =
    r.revisionGuidance === null || r.revisionGuidance === undefined
      ? null
      : typeof r.revisionGuidance === "string"
        ? r.revisionGuidance
        : null;

  return {
    verdict: r.verdict as QAVerdict,
    overallScore: r.overallScore as number,
    hookScore: r.hookScore as number,
    ctaScore: r.ctaScore as number,
    readabilityScore: r.readabilityScore as number,
    platformFitScore: r.platformFitScore as number,
    brandAlignmentScore: r.brandAlignmentScore as number,
    duplicationRisk: r.duplicationRisk as DuplicationRisk,
    issues,
    revisionGuidance,
  };
}

// ─── Main Export ───────────────────────────────────────────────────────────────

/**
 * Runs the Content QA Agent on a single platform draft.
 *
 * Always resolves — never throws. Returns { success: false, result: null }
 * on any failure so the pipeline can fall back to treating content as passing.
 */
export async function runContentQA(
  anthropic: Anthropic,
  platform: Platform,
  caption: string,
  hashtags: string[],
  brief: ContentBrief,
  brandVoiceText: string | null,
  recentGeneratedDrafts: string[]
): Promise<QARunResult> {
  try {
    const prompt = buildQAPrompt(
      platform,
      caption,
      hashtags,
      brief,
      brandVoiceText,
      recentGeneratedDrafts
    );

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const parsed: unknown = JSON.parse(cleaned);
    const result = validateQAResponse(parsed);

    return { success: true, result };
  } catch (err) {
    const failReason = err instanceof Error ? err.message : "Unknown QA error";
    return { success: false, result: null, failReason };
  }
}
