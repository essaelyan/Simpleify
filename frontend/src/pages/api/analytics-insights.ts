import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { analyticsData } = req.body;

  const prompt = `
You are a marketing data analyst.

Analyze the following traffic and conversion data.

${JSON.stringify(analyticsData)}

Return insights:
- best traffic source
- highest converting audience
- top performing content
`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  res.status(200).json(response.content);
}
