/**
 * contentGenerator.ts — Shared content generation service.
 *
 * Extracted from generate-content.ts so the pipeline orchestrator
 * (api/pipeline/run.ts) can call the same logic without duplicating code.
 *
 * Server-side only. Import from any API route or server utility.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ContentBrief, GeneratedPlatformContent } from "@/types/autoPosting";
import type { BrandVoiceProfile } from "@/types/brandVoice";
import { buildContentPrompt } from "@/prompts/contentGeneration";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface GenerateResult {
  briefId: string;
  platforms: GeneratedPlatformContent[];
}

// Re-export so existing callers that import buildContentPrompt from this
// module continue to work without changes.
export { buildContentPrompt };

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function generateContentForBrief(
  anthropic: Anthropic,
  brief: ContentBrief,
  model = "claude-opus-4-6",
  brandVoice: BrandVoiceProfile | null = null
): Promise<GenerateResult> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: "user", content: buildContentPrompt(brief, brandVoice) }],
  });

  const rawText = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Extract the JSON object — handles code fences, preamble, and trailing text
  // that the model sometimes emits despite "no explanation" instructions.
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new SyntaxError("Content generation response contained no JSON object");
  }
  const parsed: { platforms: GeneratedPlatformContent[] } = JSON.parse(jsonMatch[0]);

  const briefId = Date.now().toString(36) + Math.random().toString(36).slice(2);

  return { briefId, platforms: parsed.platforms };
}
