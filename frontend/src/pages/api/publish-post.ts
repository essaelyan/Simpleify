/**
 * POST /api/publish-post — DEPRECATED
 *
 * This endpoint has been consolidated into POST /api/social/publish.
 *
 * Migration:
 *   Old: POST /api/publish-post   body: { draft: { platform, caption, hashtags, mediaUrl } }
 *   New: POST /api/social/publish body: { platform, caption, hashtags, media_url }
 *
 * The canonical route:
 *   - Looks up the stored OAuth token from the database (same behaviour)
 *   - Saves the result to social_posts (same behaviour)
 *   - Returns { success, platform_post_id, postId, error }
 *
 * All internal callers (src/api/autoPosting.ts) have been updated to use
 * the canonical route. This handler now returns 410 Gone so any stale
 * client-side code surfaces a clear error rather than silently misbehaving.
 */

import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  return res.status(410).json({
    error:
      "This endpoint has been deprecated. Use POST /api/social/publish instead.",
    migratedTo: "/api/social/publish",
  });
}
