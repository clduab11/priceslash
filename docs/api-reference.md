# API Reference

All routes are implemented under `src/app/api/**/route.ts`.

## Health

- `GET /api/health`: app + database health check

## Scraping + Detection

- `POST /api/scrape`
  - Body: `{ "url": "https://...", "extract_only": false }`
  - Returns: `{ product, anomaly, is_anomaly }`
- `GET /api/scrape`: basic service status

## AI Validation

- `POST /api/detect`
  - Body: `{ "anomaly": <PricingAnomaly> }` (preferred) OR raw product fields
  - Returns: `{ is_glitch, glitch | validation }`
- `GET /api/detect`: basic service status

## Notifications

- `POST /api/notify`
  - Body: `{ "glitch": <ValidatedGlitch>, "channels"?: ["facebook"|"discord"|"sms"], "priority_only"?: boolean }`
- `GET /api/notify`: channel availability

## Billing

- `POST /api/checkout`: create Stripe Checkout session
- `GET /api/checkout`: list available tiers
- `POST /api/billing/portal`: create Stripe Billing Portal session
- `POST /api/webhooks/stripe`: Stripe webhooks (signature required)

## Operations

- `POST /api/cron`: run scheduled jobs (Bearer `CRON_SECRET`)
- `GET /api/cron`: view recent job runs (Bearer `CRON_SECRET`)
- `POST /api/admin/maintenance`: run cleanup tasks (Bearer `ADMIN_SECRET`)
- `GET /api/admin/maintenance`: DB stats + health (Bearer `ADMIN_SECRET`)

