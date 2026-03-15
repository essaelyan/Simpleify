import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";
import type {
  OptimizeContentRequest,
  OptimizeContentResponse,
  GAPerformanceData,
  InstagramInsightsData,
} from "@/types/feedbackLoop";
import {
  buildOptimizationPrompt,
  parseOptimizationResponse,
} from "@/services/feedbackLoop";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { ga, instagram } = req.body as OptimizeContentRequest;

  if (!ga || !instagram) {
    return res.status(400).json({ error: "ga and instagram data are required" });
  }

  if (!ga.propertyId || !instagram.accountId) {
    return res.status(400).json({ error: "Invalid ga or instagram data shape" });
  }

  try {
    const prompt = buildOptimizationPrompt(
      ga as GAPerformanceData,
      instagram as InstagramInsightsData
    );

    const response = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    let hints;
    try {
      hints = parseOptimizationResponse(rawText, ga, instagram);
    } catch (parseErr) {
      return res.status(422).json({
        error:
          parseErr instanceof Error
            ? parseErr.message
            : "Claude returned non-JSON or invalid output. Please try again.",
        raw: rawText,
      });
    }

    return res.status(200).json({ hints } as OptimizeContentResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Optimization failed";
    return res.status(500).json({ error: message });
  }
}
