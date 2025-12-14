# Installation Guide

This repo supports a fully containerized setup (recommended) using Docker Compose.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose)

## Install & Run (Docker)

1. Create env file: `cp .env.example .env.local`
2. Start services: `docker compose up --build`

Services:
- App: `http://localhost:3000`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## First-Time Database Setup

Run migrations (recommended from the worker image, which includes full build tooling):

- `docker compose run --rm worker npx prisma migrate dev`

Seed baseline scheduled jobs:

- `docker compose run --rm app npm run db:seed`

If you install dependencies outside Docker, generate the Prisma client:
- `npm run prisma:generate`
