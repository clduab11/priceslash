# API Layer Implementation

## Where It Lives

- Next.js App Router API routes: `src/app/api/**/route.ts`
- Shared business logic lives in `src/lib/**`

## Conventions

- Use `zod` for request validation (`safeParse`)
- Return consistent JSON payloads with `success` flags and `error` messages
- Keep scraping/AI heavy work in background workers when possible

## Key Routes

- Scrape: `src/app/api/scrape/route.ts`
- Validate: `src/app/api/detect/route.ts`
- Notify: `src/app/api/notify/route.ts`
- Stripe: `src/app/api/webhooks/stripe/route.ts`
- Ops: `src/app/api/cron/route.ts`, `src/app/api/admin/maintenance/route.ts`

