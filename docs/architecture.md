# System Architecture

## Overview

The Pricing Error Alert Service is an event-driven system designed to detect pricing anomalies (glitches) on e-commerce sites, validate them using AI, and instantly notify subscribers through multiple channels.

**Key Metric:** End-to-end latency from detection to notification must be < 2 minutes.

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PRICING GLITCH DETECTION PIPELINE                        │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  Firecrawl   │────▶│    Redis     │────▶│   DeepSeek   │────▶│ Notification │
  │   Scraper    │     │   Stream     │     │   Validator  │     │    Queue     │
  │              │     │              │     │              │     │              │
  │ • Stealth    │     │ • Pub/Sub    │     │ • OpenRouter │     │ • Facebook   │
  │ • JSON       │     │ • Dedupe     │     │ • AI Verify  │     │ • Discord    │
  │ • Z-score    │     │ • Buffer     │     │ • Confidence │     │ • SMS        │
  └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
         │                    │                    │                    │
         └────────────────────┴────────────────────┴────────────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │   PostgreSQL (via Prisma)    │
                         │                              │
                         │  • Products                  │
                         │  • Price History             │
                         │  • Users/Subscriptions       │
                         │  • Notifications             │
                         └─────────────────────────────┘
```

## Component Details

### 1. Firecrawl Scraper (`src/lib/scraping/firecrawl.ts`)

The scraper uses Firecrawl API in `stealth` mode to extract structured product data from e-commerce sites.

**Responsibilities:**
- URL scraping with anti-detection (stealth mode)
- Structured JSON extraction of product data
- Basic anomaly detection using Z-score algorithm
- Triggers on: Price Drop > 50% OR Z-score > 3

**Flow:**
```
URL Input → Firecrawl API → JSON Extraction → Z-score Analysis → Redis Stream
```

### 2. Redis Stream (Upstash)

Acts as the message broker for the event-driven pipeline.

**Responsibilities:**
- Pub/Sub messaging between components
- Deduplication of detected anomalies
- Buffering during high-volume periods
- TTL-based expiration for processed items

**Stream Topics:**
- `price:anomaly:detected` - Raw anomaly events
- `price:anomaly:confirmed` - AI-validated glitches
- `notification:pending` - Queued notifications

### 3. DeepSeek Validator (`src/lib/ai/validator.ts`)

AI-powered validation using OpenRouter API with DeepSeek V3 model.

**Responsibilities:**
- Analyze if price is a genuine glitch or legitimate sale
- Determine glitch type (decimal error, clearance, etc.)
- Confidence scoring (0-100)
- False positive filtering

**System Prompt:**
```
Analyze if this price is a glitch or legitimate sale. Consider:
- Historical pricing patterns
- Discount percentage
- Retailer context
- Product category norms
```

### 4. Notification Manager (`src/lib/notifications/manager.ts`)

Factory pattern implementation for multi-channel notifications.

**Priority Order:**
1. **Facebook** - Page Posts via Graph API (highest priority)
2. **Discord** - Webhooks
3. **SMS** - Twilio/Plivo

**Flow:**
```
Confirmed Glitch → Notification Factory → Channel Providers → Delivery
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scrape` | POST | Trigger scraping for a URL |
| `/api/detect` | POST | Run anomaly detection on product data |
| `/api/notify` | POST | Send notifications for confirmed glitch |

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database | PostgreSQL (Prisma) |
| Auth | Clerk |
| Queue/Cache | Upstash Redis |
| Scraping | Firecrawl API |
| AI Analysis | OpenRouter (DeepSeek V3) |
| Notifications | Facebook Graph API, Discord Webhooks, Twilio |

## Data Flow Timing

| Stage | Max Latency |
|-------|-------------|
| Scraping | 10-30s |
| Z-score Detection | <100ms |
| Redis Queue | <50ms |
| AI Validation | 1-5s |
| Notification Delivery | 5-10s |
| **Total Pipeline** | **<2 minutes** |

## Scaling Considerations

1. **Horizontal Scaling**: Add more scraping workers for increased coverage
2. **Redis Clustering**: Use Upstash cluster for high-throughput pub/sub
3. **Edge Functions**: Deploy notification workers at edge for lower latency
4. **Rate Limiting**: Implement per-retailer rate limits to avoid bans

## Error Handling

- **Retry Logic**: Exponential backoff for failed API calls
- **Dead Letter Queue**: Failed notifications stored for manual review
- **Circuit Breaker**: Disable problematic retailers temporarily
- **Alerting**: Slack/Discord alerts for system failures
