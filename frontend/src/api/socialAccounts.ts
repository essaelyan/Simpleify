import axios from "axios";
import type { ApiResponse } from "@/types/api";
import type { AccountsData, ConnectedAccount } from "@/pages/api/social/accounts";

export async function fetchConnectedAccounts(): Promise<ConnectedAccount[]> {
  const { data } = await axios.get<ApiResponse<AccountsData>>(
    "/api/social/accounts"
  );
  if (!data.success || !data.data) return [];
  return data.data.accounts;
}
