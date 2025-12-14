# GEMINI.md - Developer's Guide

This document provides a developer-focused overview of the Pricing Glitch Monetization Platform, based on an analysis of the existing codebase. Its purpose is to guide future development by outlining the current architecture, identifying key areas of the code, and suggesting the next steps to achieve a functional product.

## 🚀 Project Status

The project is a functional end-to-end implementation of the core pipeline described in `README.md`:
scrape → detect → validate → notify, using Redis streams and PostgreSQL persistence.

### What's Working

*   **Web scraping (BullMQ + Playwright):** `src/scrapers/orchestrator.ts` schedules and executes scraping jobs via BullMQ and Playwright.
*   **Web scraping (Firecrawl):** `src/lib/scraping/firecrawl.ts` supports Firecrawl-powered scraping + structured extraction.
*   **Anomaly detection:** Rule-based detection (Z-score / percent drop / decimal error) in `src/lib/analysis/detection.ts`.
*   **Persistence:** Products, price history, anomalies, and validated glitches are persisted via Prisma (`src/db/index.ts`).
*   **Event pipeline:** Detected anomalies are published to Redis streams (`src/lib/clients/redis.ts`) for downstream workers.
*   **AI validation:** `src/workers/anomaly-validator.ts` consumes `price:anomaly:detected` and validates via OpenRouter/DeepSeek (`src/lib/ai/validator.ts`), producing `price:anomaly:confirmed`.
*   **Notifications:** `src/workers/notification-sender.ts` consumes confirmed glitches and sends via the notification manager (`src/lib/notifications/manager.ts`).
*   **Monetization:** Stripe checkout + webhook plumbing exists under `src/app/api/**`.

### What's Not Working

The platform still needs product-level and subscriber-level polish to behave like a production SaaS:

*   **Subscription gating:** Notification delivery is not yet tier-gated (starter/pro/elite rules are not enforced end-to-end).
*   **User targeting:** Notifications are broadcast-style; user preferences/routing are not fully implemented.
*   **Retailer configuration depth:** Retailer/category coverage is minimal (the orchestrator includes placeholder configs).
*   **Operations:** Dead-letter handling and backpressure/alerting can be improved for high-volume production workloads.

## 🏃‍♀️ Getting Started

### Docker (recommended)

1.  **Set up environment variables:** Copy `.env.example` to `.env.local` and fill required values.
2.  **Start services:** `docker compose up --build`
    - Runs Postgres, Redis, Next app, scraping worker, validator worker, notifier worker.

### Local (if you have Node installed)

1.  Install deps: `npm install`
2.  Run migrations: `npx prisma migrate dev`
3.  Start app: `npm run dev`
4.  Start workers (separate terminals):
    - Scraping orchestrator: `npm run worker`
    - Stream validator: `npm run worker:validate`
    - Stream notifier: `npm run worker:notify`

## 🏗️ Architecture Overview

The application is designed as a modular system with several key components.

### 1. Web Scraping Engine

*   **Orchestration:** `src/scrapers/orchestrator.ts` manages the scraping jobs using a BullMQ queue.
*   **Execution:** `src/scrapers/playwright-worker.ts` is the headless browser worker that performs the actual scraping.
*   **Entry Point:** The scraping process is started via `src/worker.ts`.

### 2. Price Analysis Engine

*   **Rule-based detection:** `src/lib/analysis/detection.ts`
*   **AI validation:** `src/lib/ai/validator.ts` (OpenRouter/DeepSeek)
*   **Status: Active (stream-driven).**

### 3. Notification Service

*   **Manager:** `src/lib/notifications/manager.ts` handles routing notifications to different providers.
*   **Providers:** Implementations for Discord, Facebook, and SMS are present in `src/lib/notifications/providers/`.
*   **Status: Active (via `src/workers/notification-sender.ts`).**

### 4. Event Pipeline (Redis Streams)

*   **Detected anomalies:** `price:anomaly:detected`
*   **Validated glitches:** `price:anomaly:confirmed`
*   **Cursor keys + dedupe:** stored in Redis keys via `src/lib/clients/redis.ts`

### 5. Web Application & API

*   **Framework:** Next.js
*   **Pages:** `src/app/` contains the main pages of the application (dashboard, pricing, etc.).
*   **API Routes:** `src/app/api/` contains the API endpoints for handling tasks like billing, webhooks, and cron jobs.

### 6. Database

*   **Schema:** `prisma/schema.prisma` defines the database models. It is the single source of truth for the data structure.
*   **Client:** `src/db/index.ts` provides the Prisma client for interacting with the database.

## 🗺️ Key Files

*   `src/worker.ts`: Entry point for the scraping orchestrator service.
*   `src/scrapers/orchestrator.ts`: The heart of the scraping engine.
*   `src/lib/analysis/detection.ts`: Rule-based anomaly detection.
*   `src/workers/anomaly-validator.ts`: Stream worker for AI validation.
*   `src/workers/notification-sender.ts`: Stream worker for notification delivery.
*   `prisma/schema.prisma`: The database schema.
*   `package.json`: The project's dependencies.

## 🎯 Next Steps for Development

The highest-value next steps are productization and hardening:

1.  **Tier gating:** enforce plan rules (delay windows, channels, and alert frequency) at notification time.
2.  **Preference targeting:** map validated glitches → eligible users, then route per-channel by user settings.
3.  **Retailer coverage:** expand retailer/category configs and add robust extraction and stock checks.
4.  **Ops hardening:** add dead-letter handling, metrics, and alerting for worker failures and retries.
