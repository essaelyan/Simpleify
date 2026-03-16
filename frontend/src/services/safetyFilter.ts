/**
 * safetyFilter.ts — Pure service module for comprehensive AI content safety checks.
 *
 * No HTTP, no Anthropic client. Importable by any API route or server-side utility.
 * Handles: profanity, brand voice, duplicate content, spam, platform rule violations.
 */

import type {
  AdvancedSafetyRequest,
  SafetyCheckCategory,
  SafetyCheckResult,
} from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildSafetyCheckPrompt(req: AdvancedSafetyRequest): string {
  const meta = PLATFORM_META[req.platform];
  const hashtagStr = req.hashtags.length > 0 ? req.hashtags.join(", ") : "(none)";
  const recentStr =
    req.recentCaptions.length > 0
      ? req.recentCaptions.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "(none provided)";
  const brandVoiceStr = req.brandVoice ?? "(none specified — use general professional standard)";

  return `You are a content moderation AI for a social media scheduling platform.
Evaluate the following ${meta.label} caption across exactly 5 safety categories.

CAPTION:
${req.caption}

HASHTAGS: ${hashtagStr}

PLATFORM RULES:
- Max characters: ${meta.maxChars}
- Max hashtags: ${meta.hashtagLimit}
- Platform: ${meta.label}

BRAND VOICE GUIDELINE:
${brandVoiceStr}

RECENT PUBLISHED CAPTIONS (for duplicate detection):
${recentStr}

Evaluate EACH of the following 5 categories independently:

1. profanity — Does the caption contain explicit language, vulgar slang, profanity, or offensive terms?
2. brand_voice — Does the caption match the brand voice guideline? If no guideline was given, only flag for severe unprofessionalism (explicit insults, incoherent text, or extreme tone mismatch). Platform-appropriate casual tone on Instagram or TikTok is acceptable. Standard marketing language, value propositions, and soft CTAs are NOT brand voice violations.
3. duplicate_content — Is the caption substantially similar (≥60% overlap in phrasing) to any of the recent published captions listed above?
4. spam — Does the caption exhibit clear spam signals? Flag ONLY if the caption contains at least one of: multiple full words in ALL CAPS (e.g. "BUY NOW GET FREE DEALS"), 3 or more consecutive exclamation marks, more than 2 emojis consecutively, repeated urgent commands in sequence (e.g. "Buy now! Order now! Act fast!"), or the same hashtag or keyword repeated 3 or more times. Normal marketing language, value propositions, professional CTAs, and up to 8 hashtags do NOT constitute spam.
5. platform_rules — Does the caption violate the platform's rules? Check: caption length exceeds ${meta.maxChars} characters, hashtag count exceeds ${meta.hashtagLimit}, or content type inappropriate for ${meta.label}.

Respond ONLY with valid JSON, no markdown fences, no explanation:
{
  "checks": [
    { "category": "profanity", "passed": true, "reason": null, "severity": null },
    { "category": "brand_voice", "passed": true, "reason": null, "severity": null },
    { "category": "duplicate_content", "passed": true, "reason": null, "severity": null },
    { "category": "spam", "passed": true, "reason": null, "severity": null },
    { "category": "platform_rules", "passed": true, "reason": null, "severity": null }
  ]
}

Rules:
- For each check: if passed set passed=true, reason=null, severity=null.
- If failed: set passed=false, reason to a concise user-readable explanation (max 120 chars), severity to "low", "medium", or "high".
- Severity guide: "high" = serious violation (explicit profanity, extreme spam, clear duplicate), "medium" = moderate issue, "low" = minor concern.
- You MUST return all 5 checks in the exact order listed above.`;
}

// ─── Response Parser ──────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<"low" | "medium" | "high", number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function parseSafetyCheckResponse(raw: string): {
  checks: SafetyCheckResult[];
  safe: boolean;
  flagReason: string | null;
  severity: "low" | "medium" | "high" | null;
} {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Safety check response contained no JSON object");
  }
  const parsed: { checks: SafetyCheckResult[] } = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed.checks) || parsed.checks.length !== 5) {
    throw new Error("Safety check response must contain exactly 5 checks.");
  }

  const expectedCategories: SafetyCheckCategory[] = [
    "profanity",
    "brand_voice",
    "duplicate_content",
    "spam",
    "platform_rules",
  ];

  const checks: SafetyCheckResult[] = parsed.checks.map((c, i) => ({
    category: expectedCategories[i],
    passed: Boolean(c.passed),
    reason: c.reason ?? null,
    severity: c.severity ?? null,
  }));

  const failedChecks = checks.filter((c) => !c.passed);
  const safe = failedChecks.length === 0;

  // Pick the worst failure as the top-level flagReason
  const worst = failedChecks.reduce<SafetyCheckResult | null>((acc, c) => {
    if (!acc) return c;
    if (c.severity && acc.severity) {
      return SEVERITY_ORDER[c.severity] > SEVERITY_ORDER[acc.severity] ? c : acc;
    }
    return acc;
  }, null);

  return {
    checks,
    safe,
    flagReason: worst?.reason ?? null,
    severity: worst?.severity ?? null,
  };
}

// ─── Regeneration Hint Builder ────────────────────────────────────────────────

const CATEGORY_HINTS: Record<SafetyCheckCategory, string> = {
  profanity:
    "Avoid all profanity, vulgar language, and offensive terms. Use clean, appropriate language.",
  brand_voice:
    "Strictly match the specified brand voice and tone. Do not deviate from the brand guidelines.",
  duplicate_content:
    "Write entirely original content. Do not reuse phrases, sentences, or structures from previous posts.",
  spam:
    "Avoid ALL CAPS, excessive exclamation marks, emoji spam, and keyword stuffing. Write naturally.",
  platform_rules:
    "Ensure the caption fits within the platform character limit and hashtag limit. Keep content platform-appropriate.",
};

export function buildRegenerationHints(failedChecks: SafetyCheckResult[]): string | null {
  if (failedChecks.length === 0) return null;

  const hints = failedChecks.map((c) => {
    const base = CATEGORY_HINTS[c.category];
    return c.reason ? `${base} (Specific issue: ${c.reason})` : base;
  });

  return `IMPORTANT — The previous version of this content was flagged. You MUST correct the following issues:\n${hints.map((h, i) => `${i + 1}. ${h}`).join("\n")}`;
}
