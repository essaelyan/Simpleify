import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type { ContentBrief, GenerateContentResponse } from "@/types/autoPosting";
import { generateContentForBrief } from "@/services/contentGenerator";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { brief } = req.body as { brief: ContentBrief };

  if (!brief?.topic || !brief?.selectedPlatforms?.length) {
    return res.status(400).json({ error: "topic and selectedPlatforms are required" });
  }

  try {
    const result: GenerateContentResponse = await generateContentForBrief(anthropic, brief);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return res.status(422).json({ error: "Claude returned non-JSON output. Please try again." });
    }
    const message = err instanceof Error ? err.message : "Generation failed";
    return res.status(500).json({ error: message });
  }
}
