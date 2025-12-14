# Security Best Practices

## Secrets

- Never commit `.env.local` or real API keys.
- Rotate Stripe, Clerk, Facebook, Twilio credentials periodically.

## AuthZ

- Clerk middleware protects non-public routes (`src/middleware.ts`).
- Protect ops endpoints with `CRON_SECRET` and `ADMIN_SECRET`.

## Webhooks

- Stripe webhook signatures are verified in `src/app/api/webhooks/stripe/route.ts`.

## Outbound Requests

- Apply timeouts and retries for third-party calls (scraping/AI/notifications).
- Add rate limiting for sensitive API endpoints as needed.

