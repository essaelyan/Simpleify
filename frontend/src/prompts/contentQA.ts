/**
 * contentQA.ts — Content QA agent prompt.
 *
 * Evaluates generated captions for quality across 6 dimensions:
 * hook strength, CTA clarity, readability, platform fit,
 * brand alignment, and duplication risk.
 *
 * Used by: services/contentQAAgent.ts
 */

import type { Platform, ContentBrief } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildQAPrompt(
  platform: Platform,
  caption: string,
  hashtags: string[],
  brief: ContentBrief,
  brandVoiceText: string | null,
  recentGeneratedDrafts: string[]
): string {
  const meta = PLATFORM_META[platform];
  const hashtagStr =
    hashtags.length > 0 ? hashtags.map((h) => `#${h}`).join(" ") : "(none)";
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
