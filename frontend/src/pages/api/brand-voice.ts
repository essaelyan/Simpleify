/**
 * /api/brand-voice
 *
 * GET  — Returns the active brand voice profile, or data: { brandVoice: null } if none.
 * POST — Creates or replaces the active brand voice (upsert: one active at a time).
 *
 * Body (POST):
 *   {
 *     name?: string;
 *     industryNiche?: string | null;
 *     toneDescriptors?: string[];
 *     preferredWords?: string[];
 *     bannedWords?: string[];
 *     examplePosts?: string[];
 *     targetPersona?: string | null;
 *     formattingPreferences?: string | null;
 *     emojiPolicy?: "none" | "minimal" | "moderate" | "liberal";
 *     ctaStyle?: string | null;
 *   }
 *
 * Response: ApiResponse<{ brandVoice: BrandVoiceProfile | null }>
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { BrandVoiceProfile, UpsertBrandVoiceRequest } from "@/types/brandVoice";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import {
  loadActiveBrandVoice,
  normalizeBrandVoiceInput,
} from "@/services/brandVoiceService";
import prisma from "@/lib/prisma";

export interface BrandVoiceData {
  brandVoice: BrandVoiceProfile | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<BrandVoiceData>>
) {
  // ── GET /api/brand-voice ───────────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const brandVoice = await loadActiveBrandVoice();
      return ok(res, { brandVoice });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load brand voice";
      return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
    }
  }

  // ── POST /api/brand-voice ──────────────────────────────────────────────────
  if (req.method === "POST") {
    const input = req.body as UpsertBrandVoiceRequest;

    if (!input || typeof input !== "object") {
      return fail(res, 400, API_ERRORS.BAD_REQUEST, "Request body is required");
    }

    try {
      const data = normalizeBrandVoiceInput(input);

      // Deactivate all existing active profiles, then create a new active one.
      await prisma.brandVoice.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      const record = await prisma.brandVoice.create({
        data: { ...data, isActive: true },
      });

      const brandVoice = await loadActiveBrandVoice();
      console.log(`[brand-voice] saved id=${record.id} name="${record.name}"`);

      return ok(res, { brandVoice });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save brand voice";
      return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
    }
  }

  return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
}
