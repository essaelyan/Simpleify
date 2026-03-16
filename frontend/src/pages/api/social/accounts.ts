import type { NextApiRequest, NextApiResponse } from "next";
import type { ApiResponse } from "@/types/api";
import { ok, fail } from "@/lib/apiResponse";
import { API_ERRORS } from "@/types/api";
import prisma from "@/lib/prisma";

export interface ConnectedAccount {
  id: string;
  platform: string;
  accountHandle: string | null;
  connected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountsData {
  accounts: ConnectedAccount[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<AccountsData>>
) {
  if (req.method !== "GET") {
    return fail(res, 405, API_ERRORS.METHOD_NOT_ALLOWED, "Method not allowed");
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

    return ok(res, { accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch accounts";
    return fail(res, 500, API_ERRORS.INTERNAL_ERROR, message);
  }
}
