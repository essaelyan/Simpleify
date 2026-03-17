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
