// ─── Brand Voice Types ────────────────────────────────────────────────────────

export type EmojiPolicy = "none" | "minimal" | "moderate" | "liberal";

/**
 * A fully-parsed, in-memory brand voice profile.
 * Arrays are already deserialized from DB JSON strings.
 */
export interface BrandVoiceProfile {
  id: string;
  name: string;
  industryNiche: string | null;
  toneDescriptors: string[];          // e.g. ["friendly", "professional", "witty"]
  preferredWords: string[];           // e.g. ["empowering", "innovative"]
  bannedWords: string[];              // e.g. ["cheap", "buy now"]
  examplePosts: string[];             // example captions that match the brand voice
  targetPersona: string | null;       // e.g. "25–35 year old fitness enthusiasts"
  formattingPreferences: string | null; // e.g. "Short sentences, no bullet points"
  emojiPolicy: EmojiPolicy;
  ctaStyle: string | null;            // e.g. "Soft curiosity-driven CTAs only"
  isActive: boolean;
  updatedAt: string;                  // ISO date string
}

// ─── API Request / Response Shapes ────────────────────────────────────────────

/**
 * Body for POST /api/brand-voice.
 * All fields are optional so callers can send partial updates.
 */
export interface UpsertBrandVoiceRequest {
  name?: string;
  industryNiche?: string | null;
  toneDescriptors?: string[];
  preferredWords?: string[];
  bannedWords?: string[];
  examplePosts?: string[];
  targetPersona?: string | null;
  formattingPreferences?: string | null;
  emojiPolicy?: EmojiPolicy;
  ctaStyle?: string | null;
}

export interface BrandVoiceResponse {
  success: boolean;
  brandVoice?: BrandVoiceProfile | null;
  error?: string;
}
