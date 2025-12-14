# Contributing

Thanks for helping improve this project. This repo contains both:
- Reference documentation under `docs/`
- A working Next.js 14 + TypeScript implementation under `src/`

## Development Setup

- Copy env: `cp .env.example .env.local` (fill required keys)
- Start infra + app + workers: `docker compose up --build`
- Optional DB seed (scheduled jobs): `docker compose run --rm app npm run db:seed`

## Quality Bar

- Keep changes focused and minimally invasive.
- Prefer TypeScript-first implementations and `zod` for request validation.
- Avoid committing secrets; update `.env.example` only with placeholders.
- Ensure the Docker build succeeds: `docker build .`

## Project Structure

- `src/app`: Next.js pages + API routes
- `src/lib`: integrations (Stripe, AI validation, notifications, scraping)
- `src/db`: Prisma client + DB utilities
- `src/scrapers`: BullMQ/Playwright scraping worker
- `src/workers`: stream workers (validation + notifications)
- `prisma`: schema, migrations, seed script

## Pull Requests

- Include a short description of the problem and the approach.
- If you add/change an API route, update `docs/api-reference.md`.
- If you add/change DB models, include a migration and update `docs/08-database-schema.md`.

