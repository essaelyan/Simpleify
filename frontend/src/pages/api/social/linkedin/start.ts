/**
 * GET /api/social/linkedin/start
 *
 * Initiates the LinkedIn OAuth 2.0 authorization flow.
 * Redirects the browser to LinkedIn's consent screen.
 *
 * Required env vars:
 *   LINKEDIN_CLIENT_ID     — from your LinkedIn app's Auth settings
 *   LINKEDIN_REDIRECT_URI  — must exactly match a redirect URL registered in your app
 *                            e.g. https://simpleify.vercel.app/api/social/linkedin/callback
 *                            or   http://localhost:3000/api/social/linkedin/callback
 *
 * Scopes requested:
 *   openid          — OpenID Connect (required to call /v2/userinfo)
 *   profile         — member name (used as accountHandle for display)
 *   w_member_social — write posts on behalf of the member
 */

import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
): void {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId) {
    res
      .status(500)
      .send("LINKEDIN_CLIENT_ID is not configured. Add it to your environment variables.");
    return;
  }
  if (!redirectUri) {
    res
      .status(500)
      .send("LINKEDIN_REDIRECT_URI is not configured. Add it to your environment variables.");
    return;
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile w_member_social",
  });

  res.redirect(
    302,
    `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  );
}
