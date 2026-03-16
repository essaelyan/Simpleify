# Deployment Guide

## Deployment target

**Vercel** — the `frontend/` directory is the deployable app.

This is a monorepo. Only the `frontend/` folder is deployed. Point your Vercel
project root at `frontend/` (or configure `rootDirectory: frontend` in the
Vercel project settings).

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (Pages Router) |
| Database | PostgreSQL — Neon, Supabase, Railway, or any hosted pg |
| ORM | Prisma 7 + `@prisma/adapter-pg` |
| AI agents | Anthropic Claude (Opus + Haiku) via `@anthropic-ai/sdk` |
| Social publishing | Direct platform REST APIs (mock mode by default) |
| Analytics | Google Analytics 4 Data API (optional; mock fallback built-in) |

---

## Build command

```
npx prisma generate && npx prisma db push --skip-generate && next build
```

This is already set in [vercel.json](../vercel.json).

| Step | What it does |
|---|---|
| `prisma generate` | Compiles the Prisma client from the schema |
| `prisma db push --skip-generate` | Applies schema changes to the PostgreSQL database |
| `next build` | Produces the production Next.js build |

Schema changes are applied automatically on every deploy. No separate migration
step is needed for the current `db push` workflow.

---

## Environment variables

### Required on every environment

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://...?sslmode=require`) |
| `CLAUDE_API_KEY` | Anthropic API key. Missing → pipeline returns `CONFIG_ERROR 500` |
| `SOCIAL_PUBLISH_MOCK` | `true` on all environments except production live publishing |

### Optional — social platform publishing

Only read when `SOCIAL_PUBLISH_MOCK=false`. All platforms fall back gracefully
when their token is absent (post status becomes `no_account`).

| Variable | Platform | Notes |
|---|---|---|
| `TWITTER_ACCESS_TOKEN` | Twitter / X | OAuth 2.0, `tweet.write` scope |
| `FACEBOOK_ACCESS_TOKEN` | Facebook | Page Access Token, `pages_manage_posts` |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram | Long-lived token, `instagram_content_publish` |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Instagram | Numeric account ID, not `@username` |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn | OAuth 2.0, `w_member_social` scope |
| `LINKEDIN_AUTHOR_URN` | LinkedIn | `urn:li:person:XXXX` or `urn:li:organization:XXXX`. Pipeline hard-fails with a clear error if this is missing while publishing to LinkedIn |
| `TIKTOK_ACCESS_TOKEN` | TikTok | TikTok for Business, Content Posting API |

### Optional — analytics feedback loop

When all three GA4 vars are set, the feedback loop uses real engagement data
to tune content generation hints. When any are missing the loop uses mock data
and the pipeline continues without error.

| Variable | Description |
|---|---|
| `GA4_PROPERTY_ID` | Numeric GA4 property ID |
| `GA4_CLIENT_EMAIL` | Service account `client_email` from JSON key |
| `GA4_PRIVATE_KEY` | Service account `private_key` from JSON key (multiline, with `\n`) |

---

## Preview environment settings

Set these in the Vercel dashboard under **Environment Variables → Preview**.

```
DATABASE_URL        postgresql://<preview-db-connection-string>
CLAUDE_API_KEY      <your-anthropic-key>
SOCIAL_PUBLISH_MOCK true
```

Use a dedicated preview database or Neon branch so preview deployments never
touch production data.

`SOCIAL_PUBLISH_MOCK=true` prevents the preview pipeline from posting real
content to social platforms.

---

## Production environment settings

Set these in Vercel under **Environment Variables → Production**.

```
DATABASE_URL        postgresql://<production-connection-string>
CLAUDE_API_KEY      <your-anthropic-key>
SOCIAL_PUBLISH_MOCK false    ← only when platform tokens are also configured
```

Add social platform tokens individually as you connect each platform.
`SOCIAL_PUBLISH_MOCK` can remain `true` in production until you are ready to
go live — posts will show a "mock" badge in the UI.

---

## Function timeout

`/api/pipeline/run` runs multiple Anthropic calls (content generation, QA,
safety, enrichment, feedback) and is configured for a 60-second timeout in
`vercel.json`.

All other API routes use the 30-second default.

If you are on Vercel Pro, raise the pipeline timeout to `120` in `vercel.json`:

```json
"src/pages/api/pipeline/run.ts": {
  "maxDuration": 120
}
```

---

## Health check

`GET /api/health`

Returns `200` when the server is up and the database is reachable.
Returns `503` if the database ping fails.

```json
{ "status": "ok", "db": "connected", "timestamp": "2025-..." }
```

Use this URL for Vercel uptime monitors or a status page integration.

---

## Post-deploy smoke test

Run these checks after every production or preview deployment.

```
[ ] GET /api/health → { "status": "ok", "db": "connected" }

[ ] Brand Voice — load the Brand Voice page, save a profile, reload to confirm
    persistence

[ ] Pipeline run — fill in a brief, select 2+ platforms, run pipeline
    → all platforms reach "published" or "no_account" (never stuck loading)
    → mock badge visible when SOCIAL_PUBLISH_MOCK=true

[ ] History persistence — run the pipeline, reload the browser
    → history panel shows the previous run (loaded from DB, not just session)

[ ] Error states — verify the UI renders cleanly for:
    → qa_rejected    (QA agent rejected after revision attempt)
    → safety_blocked (safety agent blocked after all retries)
    → no_account     (platform has no connected token)
    → failed         (publish API error)

[ ] Mock badge — confirm posts show the mock indicator when running in
    SOCIAL_PUBLISH_MOCK=true mode
```

---

## Local development

```bash
cd frontend
cp .env.example .env.local
# fill in DATABASE_URL and CLAUDE_API_KEY in .env.local

npm install
npx prisma db push     # create tables on your local/preview DB
npm run dev            # http://localhost:3000
```

`SOCIAL_PUBLISH_MOCK` defaults to `true` when the variable is not set, so local
runs are always safe.
