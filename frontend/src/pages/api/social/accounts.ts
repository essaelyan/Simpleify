import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

interface ConnectedAccount {
  id: string;
  platform: string;
  accountHandle: string | null;
  connected: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AccountsResponse {
  success: boolean;
  accounts?: ConnectedAccount[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AccountsResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const rows = await prisma.socialAccount.findMany({
      orderBy: { platform: "asc" },
    });

    // Strip sensitive token fields before returning
    const accounts: ConnectedAccount[] = rows.map(({ id, platform, accountHandle, createdAt, updatedAt }) => ({
      id,
      platform,
      accountHandle,
      connected: true,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    }));

    return res.status(200).json({ success: true, accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch accounts";
    return res.status(500).json({ success: false, error: message });
  }
}
