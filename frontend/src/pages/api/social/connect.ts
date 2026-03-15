import type { NextApiRequest, NextApiResponse } from "next";
import type { Platform } from "@/types/autoPosting";
import { PLATFORMS } from "@/types/autoPosting";
import prisma from "@/lib/prisma";

interface ConnectRequest {
  platform: Platform;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;       // ISO date string
  accountHandle?: string;
}

interface ConnectResponse {
  success: boolean;
  accountId?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ConnectResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { platform, accessToken, refreshToken, expiresAt, accountHandle } =
    req.body as ConnectRequest;

  // ── Validate input ───────────────────────────────────────────────────────────
  if (!platform || !PLATFORMS.includes(platform)) {
    return res.status(400).json({
      success: false,
      error: `platform must be one of: ${PLATFORMS.join(", ")}`,
    });
  }
  if (!accessToken?.trim()) {
    return res.status(400).json({ success: false, error: "accessToken is required" });
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

    return res.status(200).json({ success: true, accountId: record.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect account";
    return res.status(500).json({ success: false, error: message });
  }
}
