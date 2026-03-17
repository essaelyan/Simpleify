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
  Platform,
} from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";
import { buildSafetyCheckPrompt } from "@/prompts/safetyModeration";

// Re-export so existing callers that import buildSafetyCheckPrompt from this
// module continue to work without changes.
export { buildSafetyCheckPrompt };

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

// ─── Deterministic Platform Sanitizer ─────────────────────────────────────────

export interface SanitizeResult {
  caption: string;
  hashtags: string[];
  corrected: boolean;
  corrections: string[];
}

/**
 * Fixes low-severity platform formatting issues without an LLM call.
 *
 * Handles:
 *   - Hashtag deduplication (case-insensitive, first occurrence wins)
 *   - Hashtag count capping to the platform limit
 *   - Removal of inline #hashtags from caption body
 *     (they belong in the hashtags array, not duplicated in the text)
 *   - Normalization: strips leading # from array entries
 *
 * Used by retryUntilSafe() to pre-clean drafts before the safety check,
 * and to skip LLM regeneration when the only failures are low-severity
 * platform_rules violations that this function already corrects.
 */
export function sanitizePlatformFormatting(
  platform: Platform,
  caption: string,
  hashtags: string[]
): SanitizeResult {
  const { hashtagLimit } = PLATFORM_META[platform];
  const corrections: string[] = [];

  // 1. Normalize — strip any leading # from tag array entries
  let tags = hashtags.map((t) => t.replace(/^#+/, "").trim()).filter(Boolean);

  // 2. Deduplicate (case-insensitive, preserve first occurrence)
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(tag);
    }
  }
  if (deduped.length < tags.length) {
    corrections.push(`deduplicated hashtags ${tags.length} → ${deduped.length}`);
    tags = deduped;
  }

  // 3. Cap to platform limit
  if (tags.length > hashtagLimit) {
    corrections.push(`capped hashtags ${tags.length} → ${hashtagLimit}`);
    tags = tags.slice(0, hashtagLimit);
  }

  // 4. Strip inline hashtags from caption body
  // (hashtags live in the array; duplicating them in the caption body inflates
  //  the count the safety agent sees and triggers platform_rules failures)
  const stripped = caption
    .replace(/#\w[\w\u0080-\uFFFF]*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (stripped !== caption) {
    corrections.push("stripped inline hashtags from caption body");
  }

  return {
    caption: stripped,
    hashtags: tags,
    corrected: corrections.length > 0,
    corrections,
  };
}
