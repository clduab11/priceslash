# PriceHawk

> **Enterprise-grade pricing error detection platform that discovers retail pricing glitches before they go viral, delivering instant notifications to subscribers.**

[![GitHub](https://img.shields.io/github/license/clduab11/pricehawk)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)

---

## The Price Glitch Economy in 2026

The retail pricing error market has grown significantly. What was once an underground hobby has become a legitimate savings strategy embraced by millions:

- Billions of dollars in pricing errors are honored by major retailers annually, according to industry observers
- Price glitch communities on Discord and Reddit have grown substantially since 2024
- Major retailers increasingly honor pricing errors under certain thresholds to protect brand loyalty
- Active glitch hunters report savings ranging from hundreds to several thousand dollars per year

### Why Pricing Errors Happen More Often Now

Modern e-commerce runs on complex, interconnected systems:

- **Dynamic pricing algorithms** that update millions of prices hourly
- **Multi-marketplace synchronization** between Amazon, Walmart, Target, and retailer sites
- **Automated clearance systems** that occasionally drop decimals
- **Third-party seller mishaps** on marketplace platforms
- **Currency conversion errors** in global retail systems
- **Promotional code stacking** that creates unintended deep discounts

The result? Pricing errors occur **every single day** across major retailers. The difference between catching them and missing them is speed—most glitches are corrected within **15-45 minutes** of going viral.

**PriceHawk gives you the edge.** Our AI-powered detection system identifies anomalies within seconds of occurrence and delivers alerts to subscribers before deals spread across social media.

---

## What is PriceHawk?

PriceHawk is a subscription-based platform that monitors 100+ retailer websites 24/7, using advanced AI to distinguish genuine pricing errors from legitimate sales. When a real glitch is detected, subscribers receive instant notifications via their preferred channels.

### Examples of Common Decimal-Error Pricing Patterns

| Item Category | Typical List Price | Potential Glitch Price | Savings (Up To) |
|---------------|-------------------|------------------------|-----------------|
| Premium TVs (65"+) | $1,500-$2,000 | $150-$200 | $1,300-$1,800 |
| Wireless Earbuds | $200-$300 | $20-$30 | $180-$270 |
| Vacuum Cleaners | $600-$800 | $60-$80 | $520-$720 |
| Gaming Consoles | $300-$400 | $30-$40 | $260-$360 |
| Kitchen Appliances | $400-$500 | $40-$50 | $350-$450 |

*These illustrate typical decimal-error pricing scenarios where a decimal point shifts one or two places. Actual outcomes vary significantly by retailer, timing, and individual circumstance. Not all pricing errors are honored—retailers have varying policies on order fulfillment. Users should verify current prices and policies before purchasing. For questions about specific examples or verification, contact our support team.*

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PRICEHAWK DETECTION PIPELINE                            │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │   Scraping   │────▶│    Redis     │────▶│  AI Validator │────▶│ Notification │
  │   Engine     │     │   Stream     │     │  (DeepSeek)   │     │   Delivery   │
  │              │     │              │     │               │     │              │
  │ • Firecrawl  │     │ • Pub/Sub    │     │ • OpenRouter  │     │ • Discord    │
  │ • Tavily     │     │ • Dedup      │     │ • Confidence  │     │ • Email      │
  │ • Playwright │     │ • Buffer     │     │   Scoring     │     │ • SMS        │
  └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
         │                    │                    │                    │
         └────────────────────┴────────────────────┴────────────────────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │   PostgreSQL (Prisma ORM)    │
                         │                              │
                         │  • Products & Price History  │
                         │  • Users & Subscriptions     │
                         │  • Validated Glitches        │
                         └──────────────────────────────┘
```

### Detection Process

1. **Continuous Monitoring**: Our distributed scraping engine monitors 100+ retailers every 15-30 minutes
2. **Anomaly Detection**: Z-score analysis flags prices that deviate significantly from historical averages
3. **AI Validation**: DeepSeek V3 analyzes each anomaly to filter false positives (clearance, sales, etc.)
4. **Instant Delivery**: Confirmed glitches are pushed to subscribers in under 2 minutes

### Detection Criteria

| Error Type | Detection Method | Confidence |
|------------|-----------------|------------|
| Decimal Errors | Price ratio < 0.01 or > 100 | 95%+ |
| Extreme Discounts | >70% off with Z-score > 3 | 80-90% |
| Historical Anomalies | 3+ standard deviations below mean | 75-85% |
| Coupon Stacking | Multiple discount detection | 65-75% |

---

## Subscription Tiers

### Current Pricing

| Feature | Free | Starter | Pro | Elite |
|---------|------|---------|-----|-------|
| **Price** | $0/mo | $5/mo | $15/mo | $50/mo |
| **Annual Price** | - | $48/yr (20% off) | $144/yr (20% off) | $480/yr (20% off) |
| **Notification Delay** | 7 days | 24 hours | < 5 minutes | Instant |
| **Deals Per Week** | 5 | Unlimited | Unlimited | Unlimited |
| **Email Notifications** | Weekly Digest | Daily | Real-time | Real-time |
| **Discord Access** | - | Yes | Yes | Yes |
| **SMS/Telegram** | - | - | Yes | Yes |
| **Advanced Filters** | - | Basic | Full | Full |
| **Historical Data** | - | - | 30 days | 90 days |
| **API Access** | - | - | - | 1,000 req/day |
| **Webhooks** | - | - | - | Yes |
| **Priority Support** | - | - | - | Yes |

### Launch Promotion (Through Q1 2026)

- **50% off first 3 months** for early subscribers
- **Free upgrade to Pro** for annual Starter subscribers
- Founding members get **lifetime 20% discount** on all tiers

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 14 (App Router) | Full-stack React framework |
| **Language** | TypeScript 5.7 (strict) | Type-safe development |
| **Database** | PostgreSQL 15 + Prisma 7 | Data persistence |
| **Queue/Cache** | Redis 7 + BullMQ | Event streaming & job queue |
| **Auth** | Clerk | Authentication & user management |
| **Payments** | Stripe Billing | Subscription management |
| **Scraping** | Firecrawl, Tavily, Playwright | Multi-provider web scraping |
| **AI** | OpenRouter (DeepSeek V3) | Anomaly validation |
| **Email** | Resend | Transactional email |
| **SMS** | Twilio | Text notifications |
| **Social** | Discord.js, Facebook Graph API | Community notifications |

---

## Q1 2026 Release Roadmap

### Phase 1: Core Platform (January 2026) ✅

- [x] Multi-provider scraping engine (Firecrawl, Tavily, Playwright)
- [x] AI validation pipeline with DeepSeek V3
- [x] PostgreSQL database with Prisma ORM
- [x] Redis Streams event-driven architecture
- [x] Stripe subscription billing integration
- [x] Clerk authentication system
- [x] Basic notification system (Email, Discord)

### Phase 2: Notification Expansion (February 2026)

- [ ] SMS notifications via Twilio
- [ ] Telegram bot integration
- [ ] Facebook Page auto-posting
- [ ] Webhook delivery for Elite tier
- [ ] Mobile push notifications (PWA)
- [ ] Notification preferences dashboard

### Phase 3: User Experience (February-March 2026)

- [ ] Public marketing website
- [ ] User dashboard redesign
- [ ] Real-time deal feed
- [ ] Historical deal browser
- [ ] Category and retailer filtering UI
- [ ] Price drop alerts (watchlist)

### Phase 4: Scale & Launch (March 2026)

- [ ] Retailer coverage expansion to 150+ sites
- [ ] Worker horizontal scaling
- [ ] Performance optimization (< 90s end-to-end)
- [ ] Admin dashboard for operations
- [ ] Public API documentation
- [ ] Beta launch to founding members
- [ ] **Public launch: March 31, 2026**

### Post-Launch Priorities (Q2 2026)

- Mobile app (React Native)
- Browser extension for in-page price monitoring
- Community features (deal ratings, comments)
- Reseller analytics dashboard
- International retailer support
- Enterprise tier with custom integrations

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- API keys for external services (see `.env.example`)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/clduab11/pricehawk.git
cd pricehawk

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your API keys

# Initialize database
npm run prisma:generate
npx prisma migrate dev

# Start development server
npm run dev

# In separate terminals, start workers:
npm run worker           # Scraping orchestrator
npm run worker:validate  # AI validation
npm run worker:notify    # Notification delivery
```

### Docker Deployment

```bash
# Start all services
docker compose up --build

# Start specific services
docker compose up app postgres redis

# View logs
docker compose logs -f app
```

---

## Documentation

### Architecture & Design

- [System Architecture](docs/architecture.md) - High-level system design
- [Scraping Engine](docs/01-scraping-engine.md) - Distributed scraping architecture
- [Analysis Engine](docs/02-analysis-engine.md) - ML-based error detection
- [Notification System](docs/03-notification-system.md) - Multi-channel delivery
- [API Layer](docs/04-api-layer.md) - REST API endpoints

### Integration Guides

- [Subscription Management](docs/05-subscription-management.md) - Stripe integration
- [Frontend Architecture](docs/06-frontend-apps.md) - Next.js app structure
- [Admin Dashboard](docs/07-admin-dashboard.md) - Operations interface
- [Database Schema](docs/08-database-schema.md) - PostgreSQL design

### Operations

- [Installation Guide](docs/installation.md)
- [Development Setup](docs/development.md)
- [Environment Variables](docs/environment.md)
- [Deployment Guide](docs/deployment.md)
- [Monitoring & Alerting](docs/monitoring.md)

---

## API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/health` | GET | System health check | No |
| `/api/scrape` | POST | Trigger URL scraping | Admin |
| `/api/detect` | POST | Run anomaly detection | Admin |
| `/api/notify` | POST | Send test notification | Admin |
| `/api/checkout` | POST | Create checkout session | Yes |
| `/api/billing` | GET | Billing portal redirect | Yes |
| `/api/webhooks/stripe` | POST | Stripe webhook handler | Signature |

---

## Why Price Glitch Hunting Works in 2026

### Retailers Honor Most Errors

Modern retail operates on thin margins and fierce competition. Canceling orders damages:

- **Brand reputation** in an era of viral social media
- **Customer lifetime value** (losing a customer costs more than honoring a deal)
- **Marketplace seller ratings** which directly impact visibility

As a result, retailers increasingly honor pricing errors under a certain threshold rather than face backlash.

### The Speed Advantage

Price glitches typically follow this lifecycle:

1. **0-5 minutes**: Error occurs, few notice
2. **5-15 minutes**: Early discoverers place orders
3. **15-30 minutes**: Spread across Discord/Reddit communities
4. **30-60 minutes**: Goes viral, retailer notices
5. **60+ minutes**: Price corrected, orders may be canceled

**PriceHawk subscribers get alerts in Phase 1-2**, while public communities are still in Phase 3-4.

### Risk-Reward Profile

- **Best case**: Order honored, save 80-95% on item
- **Typical case**: Some orders honored, some cancelled
- **Worst case**: Order cancelled, full refund, no loss

The asymmetric upside makes price glitch hunting a legitimate savings strategy for millions of consumers.

---

## Contributing

We welcome contributions from the community. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting (`npm run lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Legal Disclaimer

PriceHawk is an informational service that monitors publicly available pricing data. Users are responsible for:

- Verifying deal accuracy before purchasing
- Understanding retailer policies regarding pricing errors
- Complying with retailer terms of service
- Making informed purchasing decisions

We make no guarantees about:

- Order fulfillment by retailers
- Accuracy of detected pricing errors
- Availability of deals at time of notification

PriceHawk is not affiliated with any retailers mentioned. All trademarks belong to their respective owners.

---

## Contact

- **GitHub**: [@clduab11](https://github.com/clduab11)
- **Company**: [Parallax Analytics](https://parallax-ai.app)
- **Support**: support@pricehawk.io (coming soon)

---

**Discover pricing errors before they go viral. Join PriceHawk.**
