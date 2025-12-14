# Environment Variables

Use `.env.example` as the authoritative list.

## Core

- `DATABASE_URL`: Postgres connection string
- `REDIS_URL` (or `REDIS_HOST` + `REDIS_PORT`): Redis connection for queues/streams/rate limiting

## Auth (Clerk)

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

## Payments (Stripe)

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ELITE`

## Scraping + AI

- `FIRECRAWL_API_KEY`
- `TAVILY_API_KEY`
- `OPENROUTER_API_KEY`

## Notifications

- Discord: `DISCORD_WEBHOOK_URL`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `SMS_NOTIFY_NUMBERS`
- Facebook: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`

## Ops

- `CRON_SECRET`: protects `/api/cron`
- `ADMIN_SECRET`: protects `/api/admin/maintenance`

## Worker Tuning (Optional)

- `STREAM_BATCH_SIZE`
- `STREAM_POLL_INTERVAL_MS`
- `STREAM_MAX_RETRIES`
- `NOTIFY_DEDUP_TTL_SECONDS`
