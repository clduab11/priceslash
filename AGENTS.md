# AGENTS.md

This repo is a Next.js 14 (App Router) + TypeScript + Tailwind application with:
- PostgreSQL (via Prisma 7 + `@prisma/adapter-pg`)
- Redis (BullMQ queues + rate limiting/proxy pools)
- Scraping (Firecrawl API + Playwright worker)
- AI validation (OpenRouter / DeepSeek)
- Monetization (Stripe subscriptions)
- Auth (Clerk)
- Notifications (Facebook Graph API, Discord webhooks, Twilio SMS)

## Quickstart

1. Copy env: `cp .env.example .env.local` and fill required values.
2. Start infra + app + worker: `docker compose up --build`
   - Postgres: `localhost:5432`
   - Redis: `localhost:6379`
   - App: `http://localhost:3000`
3. In a separate shell (optional, if not using the Docker worker): `npm run worker`
4. Initialize DB (outside Docker, if needed):
   - `npx prisma migrate dev`
   - `npx tsx prisma/seed.ts`

## Useful Commands

- Dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`
- Start (prod): `npm run start`
- Worker (scraping orchestrator): `npm run worker`
- Worker (stream validator): `npm run worker:validate`
- Worker (stream notifier): `npm run worker:notify`
- Seed DB scheduled jobs: `npm run db:seed`
- Generate Prisma client: `npm run prisma:generate`

## Environment Variables

Use `.env.example` as the source of truth. Commonly required:
- `DATABASE_URL`
- Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ELITE`
- Scraping/AI: `FIRECRAWL_API_KEY`, `TAVILY_API_KEY`, `OPENROUTER_API_KEY`
- Redis:
  - Local Redis for BullMQ/rate limits: `REDIS_URL` and/or `REDIS_HOST` + `REDIS_PORT`
  - Upstash (used by `src/lib/clients/redis.ts`): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Notifications:
  - Discord: `DISCORD_WEBHOOK_URL`
  - Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (and `SMS_NOTIFY_NUMBERS` if using SMS provider)
  - Facebook: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`
- Ops:
  - `CRON_SECRET` protects `/api/cron`
  - `ADMIN_SECRET` protects `/api/admin/maintenance`

If you run the Playwright scraping worker, configure proxy credentials used in `src/scrapers/proxy-manager.ts`:
- `BRIGHTDATA_USERNAME`
- `BRIGHTDATA_PASSWORD`

## Codebase Layout

- `src/app`: Next.js pages + API routes (`src/app/api/**/route.ts`)
- `src/lib`: integrations (Stripe, scraping, AI validation, notifications)
- `src/db`: Prisma client and DB utilities
- `src/scrapers`: BullMQ + Playwright scraping worker
- `prisma`: schema, migrations, seed script
- `docs`: architecture/reference docs

## Conventions for Codex Changes

- Keep server logic in `src/app/api/**` and `src/lib/**`; avoid putting heavy scraping work in request/response paths.
- Use `zod` for API request validation (pattern: `safeParse` + 400 with `issues`).
- Prefer `@/*` path alias instead of deep relative imports.
- Use Prisma via `src/db/index.ts` (`db`) rather than creating new clients.
- When changing `prisma/schema.prisma`, also run `npx prisma generate` and add a migration if schema changes.
- Do not commit secrets; only update `.env.example` with placeholders.
