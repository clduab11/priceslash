# PriceHawk: Technical Research & Validation Planning

*Last updated: January 2026*

This document provides comprehensive technical research for PriceHawk infrastructure decisions, competitive intelligence with revenue analysis, and development templates.

---

## Section 1: OSS Infrastructure Architecture

### 1.1 Component Comparison Table

| Component         | Option                | Features/Limits                                                                 | Monthly Cost (USD) | Scaling Thresholds                        | Notes                                                                 |
|-------------------|----------------------|-------------------------------------------------------------------------------|--------------------|-------------------------------------------|-----------------------------------------------------------------------|
| **Hosting**       | Hetzner VPS (CX23)   | 2 vCPU, 4GB RAM, 40GB SSD, 20TB traffic                                       | $4.08              | Add more RAM/CPU as needed                | Reliable, scalable, low-cost VPS[[1]](https://getdeploying.com/hetzner)              |
|                   | DigitalOcean Droplet | 2 vCPU, 4GB RAM, 80GB SSD, 4TB traffic                                        | $24                | Larger droplets available                 | Slightly higher cost than Hetzner[[2]](https://costgoat.com/pricing/hetzner)             |
|                   | Coolify (OSS PaaS)   | Self-hosted PaaS for Docker apps, BYO VPS                                     | $0 + VPS           | VPS resource limits                       | Full control, OSS, more setup[[3]](https://northflank.com/blog/railway-alternatives)                 |
| **Database**      | Supabase Free Tier   | 500MB DB, 1GB file storage, 10-50K MAU, 2 projects, 50MB/day egress           | $0                 | 500MB DB, 1GB storage, 50MB/day egress    | Paused after 1 week inactivity, 2 projects max[[4]](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)[[5]](https://supabase.com/pricing)|
|                   | Neon Free Tier       | 500MB DB, 1 project, 3 branches, 10GB egress, 1 snapshot                      | $0                 | 500MB DB, 3 branches, 1 snapshot          | Usage-based, generous egress                 |
|                   | Self-hosted Postgres | Unlimited (VPS-limited), full control                                         | VPS only           | VPS resource limits                       | More setup, but scalable and cheap                                    |
| **Cache/Queue**   | Valkey (OSS)         | Redis-compatible, single-threaded, no clustering                              | $0                 | VPS resource limits                       | Drop-in Redis replacement, OSS                                        |
|                   | KeyDB (OSS)          | Redis-compatible, multi-threaded, active-active replication, clustering        | $0                 | VPS resource limits                       | Best performance for multi-core VPS                                   |
|                   | DragonFly DB (OSS)   | Redis-compatible, multi-threaded, high throughput, clustering                  | $0                 | VPS resource limits                       | Superior throughput, OSS                                              |
| **Scraping**      | Playwright (OSS)     | Headless browser, JS/SPA support, Docker-ready                                | $0                 | VPS resource limits                       | Industry standard for robust scraping                                 |
|                   | Puppeteer (OSS)      | Headless Chrome, JS/SPA support                                               | $0                 | VPS resource limits                       | Good fallback, less robust than Playwright                            |
|                   | Firecrawl MCP        | AI-powered web scraping, pagination, API, LLM integration                     | Free API tier      | API quota, can self-host                  | MCP integration, robust extraction[[6]](https://docs.firecrawl.dev/mcp-server)            |
|                   | Tavily MCP           | Supplementary search, price verification, LLM integration                     | Free API tier      | API quota, can self-host                  | MCP integration, price intelligence                                   |
|                   | Jina.ai MCP          | Clean content extraction, HTML parsing, LLM integration                       | Free API tier      | API quota, can self-host                  | MCP integration, parsing                                              |
| **Deployment**    | Docker Compose (OSS) | Multi-service orchestration, easy local/dev/prod parity                        | $0                 | VPS resource limits                       | Standard for self-hosted stacks                                       |

### 1.2 Infrastructure Diagram

```
        +-------------------+
        |    Users          |
        +--------+----------+
                 |
                 v
        +--------+----------+
        |   Web App (Next.js)|
        +--------+----------+
                 |
   +-------------+--------------+
   |                            |
   v                            v
+--------+-----------+   +---------------+
| PostgreSQL (DB)    |   | Redis/Valkey/ |
| (Supabase/Neon/    |   | KeyDB/DragonFly|
| Self-hosted)       |   | (cache/queue) |
+--------------------+   +---------------+
                 |
                 v
        +--------+----------+
        |  Scraper Workers  |
        |  (Playwright,     |
        |   Firecrawl MCP,  |
        |   Tavily MCP,     |
        |   Jina MCP)       |
        +--------+----------+
                 |
                 v
        +--------+----------+
        | Notification &    |
        | Alert System      |
        +------------------+
```

### 1.3 Total Cost Breakdown & Scaling

- **Hetzner VPS (CX23, 2 vCPU, 4GB RAM, 40GB SSD):** $4.08/mo[[1]](https://getdeploying.com/hetzner)
- **Supabase/Neon Free Tier:** $0 (upgrade to paid ~$25-30/mo when DB grows beyond 500MB)
- **Redis/Valkey/KeyDB/DragonFly:** $0 (self-hosted, resource-limited by VPS)
- **Coolify (optional PaaS):** $0 (OSS, self-hosted on VPS)[[3]](https://northflank.com/blog/railway-alternatives)
- **Playwright/Puppeteer:** $0 (OSS, runs on VPS)
- **Firecrawl/Tavily/Jina MCP:** Free API tier (upgrade as needed)
- **Total Baseline:** ~$5–$25/mo (reflecting VPS choice from Hetzner to DigitalOcean, with a free-tier DB)
- **Scaling:** If 4GB RAM/2 vCPU is insufficient (100+ jobs/day, 50+ users), upgrade VPS to 8GB RAM for ~$6.42/mo[[1]](https://getdeploying.com/hetzner), or run DB on Neon/Supabase paid tier.

**Scaling thresholds:**
- 100+ daily scraping jobs: 4GB RAM VPS is sufficient with efficient job scheduling.
- 50–100 concurrent users: 4GB RAM is baseline; 8GB RAM is recommended for heavy concurrency or large datasets.

### 1.4 Deployment Guide Outline

1. **Provision VPS (Hetzner/DigitalOcean)**
   - Choose 4GB RAM, 2 vCPU, 40GB+ SSD.
   - Set up Docker & Docker Compose.
2. **Configure Environment**
   - Clone app repo.
   - Add `.env` with DB, Redis, MCP, and API keys.
3. **Database Setup**
   - Use Docker Compose for Postgres/Valkey/KeyDB/DragonFly.
   - (Optional) Connect to Supabase/Neon for managed DB.
4. **Deploy App & Workers**
   - `docker-compose up --build`
   - Start web app, scraping, and notification services.
5. **Monitoring & Scaling**
   - Monitor resource usage.
   - Upgrade VPS or DB plan as needed.
6. **Backups & Security**
   - Set up DB backups (manual/scheduled).
   - Harden VPS (firewall, SSH keys).

### 1.5 Trade-Offs: Managed vs. Self-Hosted

- **Managed (Supabase/Neon):**
  - Pros: Zero maintenance, auto-backup, scaling, easy auth.
  - Cons: Strict free tier limits, cost grows with usage, risk of project pause (Supabase), less control.
- **Self-hosted (VPS):**
  - Pros: Full control, lowest cost, scale as needed, no vendor lock-in.
  - Cons: Manual setup, ops burden, must manage backups/security, risk of downtime.

**Recommendation:**
Start with self-hosted DB/cache on VPS for lowest cost and full control. Move to managed DB (Supabase/Neon) if usage or reliability requirements outgrow VPS.

---

## Section 2: Competitive Intelligence

### 2.1 Market Landscape & Audience Size

| Channel/Service         | Audience Size          | Update Freq.   | Pricing Tiers           | Revenue Model           | Est. Monthly Revenue         | Content Format        |
|-------------------------|-----------------------|----------------|------------------------|-------------------------|------------------------------|----------------------|
| **Twitter (@DealNews)** | 400K+ followers       | 10-30/day      | Free, affiliate links  | Ads, affiliate, X ads   | $5K–$20K (est., see below)   | Threads, links       |
| **Twitter (@slickdeals)** | 150K+ followers     | 10-20/day      | Free, affiliate links  | Ads, affiliate, X ads   | $2K–$10K (est.)              | Threads, links       |
| **Discord (Deal servers)** | 600–2,000+ members | 10–50/day      | Free, $5–$15/mo premium| Subscriptions, affiliate| $500–$3,000 (est.)           | Channels, bots       |
| **Telegram (@PremiumLootDeals)** | 46.7K subs    | 10–30/day      | Free, paid promos      | Ads, affiliate, paid    | $1K–$7K (est.)               | Channel posts        |
| **Reddit (r/Deals)**    | 2.5M+ members         | 100+/day       | Free                   | Ads, affiliate          | $10K–$30K (Reddit-wide est.) | Threads, comments    |
| **Reddit (r/Flipping)** | 500K+ members         | 10–30/day      | Free                   | Ads, affiliate          | $2K–$8K (Reddit-wide est.)   | Threads, comments    |
| **Reddit (r/PricingErrors)** | 100K+ members    | 2–10/day       | Free                   | Ads, affiliate          | $500–$2K (Reddit-wide est.)  | Threads, comments    |
| **PricingErrors.com**   | ~1-5K users (est.)    | 5–20/day       | $5/mo, $15/mo          | Subscription            | $1K–$5K (est.)               | Email, Discord, SMS  |
| **SlickDeals alerts**   | 100K+ (site-wide)     | 10–30/day      | Free, cashback         | Affiliate, ads          | $10K+ (site-wide est.)       | Email, push, site    |

### 2.2 Revenue Model Calculations

#### Example: Discord Deal Server
- 1,000 members, 10% premium conversion at $10/mo = 100 × $10 = **$1,000/mo**

#### Example: Telegram Channel
- 46,700 subscribers, 0.5% promo conversion at $5 = 233 × $5 = **$1,165/mo** (plus affiliate/ads)

#### Example: PricingErrors.com
- 200 paid users × $5/mo (Basic) = $1,000/mo
- 50 paid users × $15/mo (Pro) = $750/mo
- **Total: $1,750/mo** (est.)

#### Example: Twitter Account
- 100K followers, 0.1% affiliate conversion, average $2 commission = 100 × $2 = $200/mo (affiliate only)
- X Ads Revenue: 1M verified impressions = ~$8–$12 payout[[7]](https://buzzvoice.com/blog/how-much-does-twitter-pay/)[[8]](https://www.epidemicsound.com/blog/x-twitter-monetization/)
- Subscriptions: If 1% pay $5/mo = 1,000 × $5 = $5,000/mo (rare)

### 2.3 Business Model Comparison Matrix

| Service/Channel          | Subscription | Affiliate | Ads | Direct Sales | Transaction Guarantee | Notes                        |
|--------------------------|--------------|-----------|-----|--------------|----------------------|------------------------------|
| PriceHawk                | Yes          | Optional  | No  | No           | No                   | Intelligence, not guarantee  |
| Twitter Accounts         | No/Yes       | Yes       | Yes | No           | No                   | X Ads, affiliate links       |
| Discord Servers          | Yes          | Yes       | No  | No           | No                   | Server subscriptions         |
| Telegram Channels        | No/Yes       | Yes       | Yes | No           | No                   | Paid promos, affiliate       |
| Reddit Communities       | No           | Yes       | Yes | No           | No                   | Reddit ads, affiliate links  |
| PricingErrors.com        | Yes          | No        | No  | No           | No                   | Email/Discord/SMS alerts     |
| SlickDeals               | No           | Yes       | Yes | No           | No                   | Cashback, affiliate, ads     |

### 2.4 Market Size Estimation

- **Active retail arbitrage/deal alert audience (US/EU):** 2–5 million (based on Reddit, Telegram, Twitter, Discord reach)
- **Pricing error-specific audience:** 100K–500K (Reddit, Telegram, Discord, Twitter combined)
- **Monetizable audience (willing to pay $5–15/mo for real-time alerts):** 5,000–20,000 (1–5% of total niche)

**Estimated market size for paid pricing error intelligence:**
$5/mo × 10,000 users = **$50,000/mo** market opportunity

### 2.5 Recommended Positioning Strategy

- **Emphasize speed and reliability:** "Get alerts before deals go viral."
- **Transparency:** Clearly state that PriceHawk provides intelligence, not fulfillment.
- **Subscription-first, affiliate-optional:** Focus on paid tiers; offer limited free tier with delayed alerts.
- **Community integration:** Discord/Telegram bots, API/webhooks for power users.
- **Highlight detection accuracy:** AI/ML validation pipeline, minimize false positives.
- **Risk disclaimer:** Orders not guaranteed, fulfillment is retailer's responsibility.

---

## Section 3: GitHub Repository Analysis

### 3.1 Documentation & Code Patterns

- **README.md:** Clear description of PriceHawk as an enterprise-grade pricing error detection platform. Explains the retail glitch economy, why errors happen, and the speed advantage of PriceHawk's detection pipeline.
- **Detection Pipeline:** Modular: Scraping engine (Firecrawl, Tavily, Playwright), Redis stream for event-driven jobs, AI validation (DeepSeek V3), PostgreSQL (Prisma ORM), multi-channel notifications (Discord, email, SMS).
- **Subscription Tiers:** Free, Starter, Pro, Elite; with notification delay, delivery channel, and feature gating.
- **Tech Stack:** Next.js 14, TypeScript, PostgreSQL 15+ Prisma, Redis 7+ BullMQ, Stripe, Clerk, Resend, Twilio, Discord.js.
- **Deployment:** Docker Compose with multiple services (app, workers, DB, Redis). Quickstart and Docker deployment steps provided.
- **Architecture Docs:** High-level system design, scraping engine, analysis engine, notification system, API endpoints.
- **Roadmap:** Phased release plan through Q1 2026, scaling to 150+ retailers, public API, mobile app, browser extension, enterprise analytics.
- **Legal:** Elastic License 2.0 for non-commercial use; commercial license for SaaS/enterprise/competing services.

### 3.2 Gaps & Opportunities

- **Test Coverage:** No explicit mention of automated test coverage for scrapers or anomaly detection.
- **Monitoring/Alerting:** Only briefly mentioned; needs concrete implementation details.
- **Proxy/Anti-bot:** No detail on proxy rotation or anti-bot strategies for scraping.
- **Scaling:** Horizontal scaling mentioned, but no concrete autoscaling guide.
- **MCP Integration:** Firecrawl, Tavily, Jina mentioned but not fully specified in code.
- **Community Features:** Planned for post-launch; can be prioritized for stickiness.

### 3.3 Useful Patterns

- **Modular worker architecture:** Decoupled scraping, validation, notification.
- **Event-driven pipeline:** Redis Streams + BullMQ for job orchestration.
- **Multi-provider scraping:** Fallbacks, redundancy, and extensibility.
- **Tiered notifications:** Monetization and user segmentation built-in.
- **Rapid deployment:** Docker Compose for local/dev/prod parity.

---

## Section 4: One-Shot Scraper Prompt

### 4.1 MVP Scraper Template

```
=== ONE-SHOT SCRAPER MVP PROMPT ===

You are a senior developer. Generate a complete, production-ready, Dockerized price monitoring scraper MVP for retail pricing errors using the following architecture:

- **Multi-service scraping via Model Context Protocol (MCP):**
  - **Primary:** Firecrawl MCP (robust extraction, pagination, dynamic content)
  - **Secondary:** Puppeteer MCP (browser fallback)
  - **Tertiary:** Tavily MCP (supplementary price intelligence/search)
  - **Jina.ai MCP:** Clean HTML parsing and content extraction
- **Rule-based detection:** Flag products with >50% discount vs. reference price
- **Output:** Discord webhook notification **OR** structured JSON log file
- **Scheduler:** Runs every 15 minutes (cron or built-in)
- **Test coverage:** Scrapes Amazon, Walmart, and Target (at least 1 product each)
- **Error handling:** Retries, logs, rate limiting
- **Dockerized:** All services in a single `docker-compose.yml`
- **Config:** All secrets and endpoints via `.env`
- **MCP server integration:** All MCP endpoints specified in config
- **Filesystem logging:** Store all detected anomalies to `/logs/pricing_errors.jsonl`
- **Validation:** Script must validate at least 5 legitimate pricing anomalies in 24h on live data
```

### 4.2 Expected Directory Structure

```
pricehawk-scraper-mvp/
├── src/
│   ├── scraper.js
│   ├── firecrawlClient.js
│   ├── puppeteerClient.js
│   ├── tavilyClient.js
│   ├── jinaClient.js
│   └── utils.js
├── config/
│   ├── mcp_settings.json
│   └── .env.example
├── logs/
│   └── pricing_errors.jsonl
├── docker-compose.yml
├── README.md
```

### 4.3 Sample Environment Configuration

```bash
# MCP endpoints
FIRECRAWL_MCP_URL=https://firecrawl-mcp.example.com
FIRECRAWL_API_KEY=your-firecrawl-key
TAVILY_MCP_URL=https://tavily-mcp.example.com
TAVILY_API_KEY=your-tavily-key
JINA_MCP_URL=https://jina-mcp.example.com
JINA_API_KEY=your-jina-key
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
# Optional: Postgres/Redis if needed
PG_URL=postgres://<user>:<password>@db:5432/pricehawk
REDIS_URL=redis://redis:6379
```

### 4.4 MCP Server Configuration

```json
{
  "firecrawl": {
    "endpoint": "https://firecrawl-mcp.example.com",
    "api_key": "your-firecrawl-key"
  },
  "tavily": {
    "endpoint": "https://tavily-mcp.example.com",
    "api_key": "your-tavily-key"
  },
  "jina": {
    "endpoint": "https://jina-mcp.example.com",
    "api_key": "your-jina-key"
  },
  "playwright": {
    "endpoint": "http://localhost:3001",
    "api_key": ""
  }
}
```

### 4.5 Validation Steps

1. Build and start services with Docker Compose
2. Add real API keys and Discord webhook to `.env`
3. Trigger a manual run and check `/logs/pricing_errors.jsonl` for output
4. Confirm Discord notifications for detected anomalies
5. Ensure fallback chain works: if Firecrawl fails, Puppeteer and then Tavily are used
6. Run for 24 hours, validate detection of at least 5 legitimate pricing anomalies

---

## References

1. [Hetzner VPS Pricing](https://getdeploying.com/hetzner)
2. [Hetzner vs DigitalOcean](https://costgoat.com/pricing/hetzner)
3. [Railway Alternatives (Coolify)](https://northflank.com/blog/railway-alternatives)
4. [Supabase Pricing Guide](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)
5. [Supabase Official Pricing](https://supabase.com/pricing)
6. [Firecrawl MCP Server](https://docs.firecrawl.dev/mcp-server)
7. [Twitter/X Monetization](https://buzzvoice.com/blog/how-much-does-twitter-pay/)
8. [X Creator Monetization](https://www.epidemicsound.com/blog/x-twitter-monetization/)
