# Development Setup

## Recommended Workflow (Docker)

Run everything:

- `docker compose up --build`

This starts:
- `app`: Next.js server
- `worker`: BullMQ + Playwright scraping orchestrator
- `validator`: consumes anomaly stream and runs AI validation
- `notifier`: consumes confirmed glitches and sends notifications
- `postgres`, `redis`

## Useful Commands

- Validate compose file: `docker compose config`
- Build image: `docker build .`

## Data Flow (Local)

1. `/api/scrape` scrapes + detects anomalies, persists to Postgres, and publishes to Redis stream.
2. `validator` worker reads `price:anomaly:detected` and runs AI validation, writing `validated_glitches`.
3. `notifier` worker reads `price:anomaly:confirmed` and sends notifications (Facebook/Discord/SMS) and records `notifications`.

## Seeding Scheduled Jobs

- `npm run db:seed`

This sets up baseline jobs in `scheduled_jobs` used by `/api/cron`.

## Prisma Client Generation

If you install dependencies outside Docker:

- `npm run prisma:generate`
