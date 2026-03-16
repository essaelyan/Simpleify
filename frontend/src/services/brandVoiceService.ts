/**
 * brandVoiceService.ts — Brand Voice Agent service module.
 *
 * Owns three responsibilities:
 *   1. loadActiveBrandVoice()     — fetch the active profile from the DB
 *   2. brandVoiceToPromptText()   — render a profile into a prompt-friendly string
 *   3. normalizeBrandVoiceInput() — validate + clean raw upsert input before DB write
 *
 * Server-side only. Import from API routes or server utilities.
 */

import prisma from "@/lib/prisma";
import type {
  BrandVoiceProfile,
  EmojiPolicy,
  UpsertBrandVoiceRequest,
} from "@/types/brandVoice";

// ─── DB Record → Profile ──────────────────────────────────────────────────────

type BrandVoiceRecord = {
  id: string;
  name: string;
  industryNiche: string | null;
  toneDescriptors: string;
  preferredWords: string;
  bannedWords: string;
  examplePosts: string;
  targetPersona: string | null;
  formattingPreferences: string | null;
  emojiPolicy: string;
  ctaStyle: string | null;
  isActive: boolean;
  updatedAt: Date;
};

function parseRecord(r: BrandVoiceRecord): BrandVoiceProfile {
  return {
    id: r.id,
    name: r.name,
    industryNiche: r.industryNiche,
    toneDescriptors: safeParseArray(r.toneDescriptors),
    preferredWords: safeParseArray(r.preferredWords),
    bannedWords: safeParseArray(r.bannedWords),
    examplePosts: safeParseArray(r.examplePosts),
    targetPersona: r.targetPersona,
    formattingPreferences: r.formattingPreferences,
    emojiPolicy: r.emojiPolicy as EmojiPolicy,
    ctaStyle: r.ctaStyle,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the most-recently-updated active brand voice, or null if none exists.
 * Safe to call at every pipeline/generation entry point — returns null gracefully.
 */
export async function loadActiveBrandVoice(): Promise<BrandVoiceProfile | null> {
  try {
    const record = await prisma.brandVoice.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    return record ? parseRecord(record) : null;
  } catch {
    // DB unavailable or table not yet migrated — degrade gracefully
    return null;
  }
}

/**
 * Renders a BrandVoiceProfile into a compact, prompt-ready string block.
 * Designed to be injected verbatim into both generation and safety prompts.
 */
export function brandVoiceToPromptText(profile: BrandVoiceProfile): string {
  const lines: string[] = [];

  lines.push(`Brand Name: ${profile.name}`);

  if (profile.industryNiche) {
    lines.push(`Industry/Niche: ${profile.industryNiche}`);
  }

  if (profile.targetPersona) {
    lines.push(`Target Persona: ${profile.targetPersona}`);
  }

  if (profile.toneDescriptors.length > 0) {
    lines.push(`Tone: ${profile.toneDescriptors.join(", ")}`);
  }

  if (profile.preferredWords.length > 0) {
    lines.push(`Preferred Words/Phrases: ${profile.preferredWords.join(", ")}`);
  }

  if (profile.bannedWords.length > 0) {
    lines.push(`Banned Words/Phrases (never use these): ${profile.bannedWords.join(", ")}`);
  }

  if (profile.formattingPreferences) {
    lines.push(`Formatting: ${profile.formattingPreferences}`);
  }

  const emojiGuidance: Record<EmojiPolicy, string> = {
    none: "No emojis at all",
    minimal: "1–2 emojis max per post, only where they add clear meaning",
    moderate: "Emojis welcome; use where they add personality without cluttering",
    liberal: "Emojis encouraged — use to add energy and engagement",
  };
  lines.push(`Emoji Policy: ${emojiGuidance[profile.emojiPolicy]}`);

  if (profile.ctaStyle) {
    lines.push(`CTA Style: ${profile.ctaStyle}`);
  }

  if (profile.examplePosts.length > 0) {
    lines.push(`Example Posts (write in this voice):`);
    profile.examplePosts.slice(0, 3).forEach((ex, i) => {
      lines.push(`  ${i + 1}. "${ex}"`);
    });
  }

  return lines.join("\n");
}

/**
 * Validates and normalizes raw upsert input into DB-ready field values.
 * Coerces unknown emoji policies to "minimal". Trims strings. Serializes arrays.
 */
export function normalizeBrandVoiceInput(input: UpsertBrandVoiceRequest): {
  name: string;
  industryNiche: string | null;
  toneDescriptors: string;
  preferredWords: string;
  bannedWords: string;
  examplePosts: string;
  targetPersona: string | null;
  formattingPreferences: string | null;
  emojiPolicy: string;
  ctaStyle: string | null;
} {
  const VALID_EMOJI_POLICIES: EmojiPolicy[] = ["none", "minimal", "moderate", "liberal"];
  const emojiPolicy =
    input.emojiPolicy && VALID_EMOJI_POLICIES.includes(input.emojiPolicy)
      ? input.emojiPolicy
      : "minimal";

  const normalizeArray = (arr: unknown): string =>
    JSON.stringify(Array.isArray(arr) ? (arr as string[]).map((s) => s.trim()).filter(Boolean) : []);

  return {
    name: input.name?.trim() || "Default Brand Voice",
    industryNiche: input.industryNiche?.trim() || null,
    toneDescriptors: normalizeArray(input.toneDescriptors),
    preferredWords: normalizeArray(input.preferredWords),
    bannedWords: normalizeArray(input.bannedWords),
    examplePosts: normalizeArray(input.examplePosts),
    targetPersona: input.targetPersona?.trim() || null,
    formattingPreferences: input.formattingPreferences?.trim() || null,
    emojiPolicy,
    ctaStyle: input.ctaStyle?.trim() || null,
  };
}
