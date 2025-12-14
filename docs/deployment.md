# Deployment Guide

## Recommended Production Topology

- Web app (Next.js)
- Postgres (managed)
- Redis (Upstash or managed Redis)
- Background workers:
  - Scraper (`npm run worker`)
  - Validator (`npm run worker:validate`)
  - Notifier (`npm run worker:notify`)

## Docker

Build the image:

- `docker build -t pricing-glitch-monetization .`

Run with your platform’s env var manager (do not bake secrets into images).

## Database Migrations

On deploy (one-time per release that changes schema):
- Run `npx prisma migrate deploy` from a build/tooling environment (CI job or a worker/admin container) with access to `DATABASE_URL`.

## Webhooks

- Configure Stripe webhook endpoint to `/api/webhooks/stripe`
- Set `STRIPE_WEBHOOK_SECRET`
