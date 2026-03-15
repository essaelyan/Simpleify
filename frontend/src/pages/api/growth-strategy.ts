import Anthropic from "@anthropic-ai/sdk";
import type { NextApiRequest, NextApiResponse } from "next";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { insights } = req.body;

  const prompt = `
You are a growth marketing strategist.

Using these insights:
${JSON.stringify(insights)}

Recommend:

- new content strategy
- ad scaling strategy
- audience expansion
- growth experiments
`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });

  res.status(200).json(response.content);
}
