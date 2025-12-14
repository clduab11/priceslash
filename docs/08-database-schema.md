# Database Schema & Migrations

## Source of Truth

- Prisma schema: `prisma/schema.prisma`
- Migrations: `prisma/migrations/*`

## Core Models

- `User`, `Subscription`, `UserPreference`
- `Product`, `PriceHistory`
- `PricingAnomaly`, `ValidatedGlitch`, `Notification`
- `ScheduledJob`, `JobRun`
- `AuditLog`, `ApiUsage`

## Seeding

- Seed scheduled jobs: `npm run db:seed` (`prisma/seed.ts`)

## Notes

- `Product.url` is unique and used for upserts.
- `ValidatedGlitch.anomalyId` is unique to keep validation idempotent.

