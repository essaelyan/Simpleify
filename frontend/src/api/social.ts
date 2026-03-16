import axios from "axios";
import type { Platform } from "@/types/autoPosting";
import type { ApiResponse } from "@/types/api";
import type { SocialPublishRequest, SocialPublishData } from "@/pages/api/social/publish";
import type { AccountsData, ConnectedAccount } from "@/pages/api/social/accounts";

export type { ConnectedAccount };

export async function fetchConnectedAccounts(): Promise<ConnectedAccount[]> {
  const { data } = await axios.get<ApiResponse<AccountsData>>("/api/social/accounts");
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Failed to fetch accounts");
  }
  return data.data.accounts;
}

export async function publishToPlatform(
  input: Omit<SocialPublishRequest, "platform"> & { platform: Platform }
): Promise<SocialPublishData> {
  const { data } = await axios.post<ApiResponse<SocialPublishData>>("/api/social/publish", input);
  if (!data.success || !data.data) {
    throw new Error(data.error?.message ?? "Publish failed");
  }
  return data.data;
}
