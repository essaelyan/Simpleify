/**
 * contentGeneration.ts — Social media content generation prompt.
 *
 * Builds the full user message for the content generation agent.
 * Supports optional injections: brand voice, brief enrichment,
 * QA revision guidance, safety feedback, and optimization hints.
 *
 * Used by: services/contentGenerator.ts
 */

import type { ContentBrief } from "@/types/autoPosting";
import { PLATFORM_META } from "@/types/autoPosting";
import type { BrandVoiceProfile } from "@/types/brandVoice";
import {
  injectBrandVoice,
  injectEnrichment,
  injectOptimizationHints,
} from "@/prompts/builder";

// ─── Platform Style Specs ─────────────────────────────────────────────────────

const PLATFORM_SPECS: Record<
  string,
  { hashtagMin: number; hashtagMax: number; style: string }
> = {
  instagram: {
    hashtagMin: 5,
    hashtagMax: 8,
    style:
      "Short, engaging, visually descriptive. Hook in the first line. Emojis welcome (max 2 in a row). End with a soft CTA.",
  },
  facebook: {
    hashtagMin: 0,
    hashtagMax: 2,
    style:
      "Conversational and warm. Write like you're talking directly to the reader. Expand on the value with 2–3 natural sentences. Few or no hashtags — let the copy carry the message.",
  },
  linkedin: {
    hashtagMin: 0,
    hashtagMax: 3,
    style:
      "Professional, insightful, and direct. Lead with a clear observation or takeaway. No hype, no promotional urgency. Minimal hashtags — only include if genuinely relevant to the industry topic.",
  },
  twitter: {
    hashtagMin: 0,
    hashtagMax: 2,
    style:
      "Concise and punchy — get to the point immediately. One sharp sentence or two short ones max. One or two hashtags only if they add real context. No hashtag overload.",
  },
  tiktok: {
    hashtagMin: 3,
    hashtagMax: 6,
    style:
      "Short, trend-aware, and energetic. Speak to a younger, fast-scrolling audience. Light soft CTA. Hashtags should reflect current trends relevant to the topic.",
  },
};

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildContentPrompt(
  brief: ContentBrief,
  brandVoice: BrandVoiceProfile | null = null
): string {
  const platformDetails = brief.selectedPlatforms
    .map((p) => {
      const meta = PLATFORM_META[p];
      const spec = PLATFORM_SPECS[p] ?? {
        hashtagMin: 2,
        hashtagMax: 5,
        style: "Clear and engaging.",
      };
      return (
        `- ${meta.label}:\n` +
        `    Character limit: ${meta.maxChars}\n` +
        `    Hashtag count: ${spec.hashtagMin}–${spec.hashtagMax} (choose the right number for the content — not always the max)\n` +
        `    Style: ${spec.style}`
      );
    })
    .join("\n");

  let prompt = `You are a social media copywriter. Your job is to write platform-specific post content.

BRIEF:
Topic: ${brief.topic}
Tone: ${brief.tone}
Target Audience: ${brief.targetAudience}
Call to Action: ${brief.callToAction}${injectBrandVoice(brandVoice)}

PLATFORM REQUIREMENTS:
${platformDetails}

INSTRUCTIONS:
- Write a unique caption for each platform — tailored to that platform's style, audience, and format
- Each caption must feel native to the platform: do not reuse the same opening or structure across platforms
- Keep each caption within its character limit
- Hashtags: use a count within the specified range — choose fewer when the content is more formal or text-heavy
- Each hashtag must be directly relevant to the topic and audience — no filler tags
- Never use spam-style hashtags: buynow, deal, discount, limitedtime, offer, bestdeal, sale, promo, free, giveaway, followback, likeforlike, followforfollow, spam, viral
- All hashtags must be unique — no duplicates or near-duplicates within the same post
- The caption should NOT include hashtags inline — put them in the hashtags array only
- Do not use more than 2 emojis in a row anywhere in the caption
- Write naturally — avoid ALL CAPS words, excessive exclamation marks, and repetitive filler phrases
- Tone: ${brief.tone} — professional, clear, and value-focused; never pushy or salesy
- Never use these phrases (or close variations): "buy now", "click the link", "limited time offer", "best deal ever", "don't miss out", "act fast", "order now", "shop now", "get it now", "exclusive deal", "last chance", "hurry", "only X left"
- Call to action must be soft and informative — use phrases like: "Learn more", "Discover more", "Explore the details", "See how it works", "Find out more", "Read more about it"
- Focus on the value and story behind the topic — what problem it solves, what the audience gains, why it matters
- Write as if a knowledgeable person is sharing something genuinely useful, not as an advertisement

Respond ONLY with valid JSON in this exact format, no explanation, no markdown fences:
{
  "platforms": [
    {
      "platform": "instagram",
      "caption": "...",
      "hashtags": ["tag1", "tag2"]
    }
  ]
}

Include one entry per platform: ${brief.selectedPlatforms.join(", ")}.`;

  if (brief.enrichment) {
    prompt += injectEnrichment(brief.enrichment);
  }

  if (brief.qaRevisionGuidance) {
    prompt += `\n\nQUALITY REVISION GUIDANCE (apply to the rewritten caption for this platform):\n${brief.qaRevisionGuidance}`;
  }

  if (brief.safetyFeedback) {
    prompt += `\n\nSAFETY FEEDBACK (apply to ALL captions):\n${brief.safetyFeedback}`;
  }

  if (brief.optimizationHints) {
    prompt += injectOptimizationHints(brief.optimizationHints);
  }

  return prompt;
}
