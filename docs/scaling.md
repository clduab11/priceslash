# Scaling Strategy

## Horizontal Scaling

- Run multiple scraping workers (partition retailers/categories).
- Keep a single validator/notifier per stream cursor, or move to Redis consumer groups for parallelism.

## Data

- Partition/retention for `price_history` (cleanup job included).
- Add indexes for common feed queries (already included in Prisma schema).

## Queue + Streams

- BullMQ is suitable for high-throughput scraping jobs.
- Redis streams are used for anomaly → validation → notification pipeline.

