import axios from "axios";
import type { Platform } from "@/types/autoPosting";
import type { SocialPublishRequest, SocialPublishResponse } from "@/pages/api/social/publish";

export interface ConnectedAccount {
  id: string;
  platform: string;
  accountHandle: string | null;
  connected: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchConnectedAccounts(): Promise<ConnectedAccount[]> {
  const { data } = await axios.get<{
    success: boolean;
    accounts?: ConnectedAccount[];
    error?: string;
  }>("/api/social/accounts");
  if (!data.success) throw new Error(data.error ?? "Failed to fetch accounts");
  return data.accounts ?? [];
}

export async function publishToPlatform(
  input: Omit<SocialPublishRequest, "platform"> & { platform: Platform }
): Promise<SocialPublishResponse> {
  const { data } = await axios.post<SocialPublishResponse>("/api/social/publish", input);
  return data;
}
