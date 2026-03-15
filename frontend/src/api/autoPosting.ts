import axios from "axios";
import type {
  AdvancedSafetyRequest,
  AdvancedSafetyResponse,
  ContentBrief,
  GenerateContentResponse,
  PublishPostRequest,
  PublishPostResponse,
  SafetyFilterRequest,
  SafetyFilterResponse,
} from "@/types/autoPosting";

export async function generateContent(
  brief: ContentBrief
): Promise<GenerateContentResponse> {
  const { data } = await axios.post<GenerateContentResponse>(
    "/api/generate-content",
    { brief }
  );
  return data;
}

export async function checkSafety(
  req: SafetyFilterRequest
): Promise<SafetyFilterResponse> {
  const { data } = await axios.post<SafetyFilterResponse>(
    "/api/safety-filter",
    req
  );
  return data;
}

export async function publishPost(
  draft: PublishPostRequest
): Promise<PublishPostResponse> {
  const { data } = await axios.post<PublishPostResponse>("/api/publish-post", {
    draft,
  });
  return data;
}

export async function checkSafetyAdvanced(
  req: AdvancedSafetyRequest
): Promise<AdvancedSafetyResponse> {
  const { data } = await axios.post<AdvancedSafetyResponse>(
    "/api/ai/safety-check",
    req
  );
  return data;
}
