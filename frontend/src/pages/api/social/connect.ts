import type { NextApiRequest, NextApiResponse } from "next";
import type { Platform } from "@/types/autoPosting";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import { PLATFORMS } from "@/types/autoPosting";
import prisma from "@/lib/prisma";

interface ConnectRequest {
  platform: Platform;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;       // ISO date string
  accountHandle?: string;
}

export interface ConnectData {
  accountId: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<ConnectData>>
) {
  if (req.method !== "POST") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
  }

  const { platform, accessToken, refreshToken, expiresAt, accountHandle } =
    req.body as ConnectRequest;

  // ── Validate input ───────────────────────────────────────────────────────────
  if (!platform || !PLATFORMS.includes(platform)) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, `platform must be one of: ${PLATFORMS.join(", ")}`);
  }
  if (!accessToken?.trim()) {
    return fail(res, 400, API_ERRORS.BAD_REQUEST, "accessToken is required");
  }

  try {
    const data = {
      accessToken,
      refreshToken: refreshToken ?? null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      accountHandle: accountHandle ?? null,
    };

    const record = await prisma.socialAccount.upsert({
      where: { platform },
      create: { platform, ...data },
      update: data,
    });

    return ok(res, { accountId: record.id }, { platform });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect account";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
