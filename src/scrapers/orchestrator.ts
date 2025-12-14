
import { Queue, Worker } from 'bullmq';
import { PlaywrightWorker } from './playwright-worker.js';
import { ProxyManager } from './proxy-manager.js';
import { RateLimiter } from './rate-limiter.js';
import { db } from '../db/index.js';
import { ScraperConfig } from './types.js';
import { PricingAnomaly, Product, ProductData } from '../types/index.js';
import { detectAnomaly } from '../lib/analysis/detection.js';
import { publishAnomaly } from '../lib/clients/redis.js';

interface RequestJobData {
  retailer: string;
  category: string;
  url: string;
}

export class ScrapingOrchestrator {
  private queue: Queue;
  private proxyManager: ProxyManager;
  private rateLimiter: RateLimiter;
  private retailers: ScraperConfig[];

  constructor() {
    this.queue = new Queue('scraping-jobs', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    });

    this.proxyManager = new ProxyManager();
    this.rateLimiter = new RateLimiter();
    this.retailers = this.loadRetailerConfigs();
  }

  async initialize(): Promise<void> {
    await this.proxyManager.initialize();
    await this.rateLimiter.initialize();
    await this.setupWorkers();
    await this.scheduleJobs();
  }

  private async setupWorkers(): Promise<void> {
    const concurrency = parseInt(process.env.SCRAPER_CONCURRENCY || '5');

    new Worker(
      'scraping-jobs',
      async (job) => {
        const { retailer, category, url } = job.data as RequestJobData;
        
        try {
          const config = this.retailers.find(r => r.retailer === retailer);
          if (!config) {
            throw new Error(`Unknown retailer: ${retailer}`);
          }

          const worker = new PlaywrightWorker(
            {
              retailer: config.retailer,
              targetUrl: url,
              selectors: config.selectors,
              antiBot: true,
              rateLimit: config.rateLimit,
            },
            this.proxyManager,
            this.rateLimiter
          );

          await worker.initialize();
          const products = await worker.scrapeProducts({
            id: job.id!,
            url,
            retailer,
            category,
          });
          await worker.cleanup();

          // Save to database
          await this.saveProducts(products, retailer, category);

          return { success: true, productCount: products.length };
        } catch (error) {
          console.error(`Scraping job failed:`, error);
          throw error;
        }
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        concurrency,
      }
    );
  }

  private async scheduleJobs(): Promise<void> {
    // Clear existing repeatable jobs first if needed, or just add new ones
    // For simplicity, we just adding them.
    for (const retailer of this.retailers) {
      // In a real app, 'categories' would be iterated. 
      // Simplified here based on hardcoded configs below.
      // We assume the targetUrl IS the category url for now or we parse it.
      // Let's iterate a fictitious list of categories or just uses the targetUrl as one.
      
      const categories = ['electronics']; // Placeholder
      for (const category of categories) {
         // Construct URL based on retailer - simplified logic
         const url = retailer.targetUrl; // In reality, would append category path

        await this.queue.add(
          `scrape-${retailer.retailer}-${category}`,
          {
            retailer: retailer.retailer,
            category,
            url,
          },
          {
            repeat: {
              every: 15 * 60 * 1000, // 15 mins
            },
          }
        );
      }
    }
  }

  private async saveProducts(
    products: ProductData[],
    retailer: string,
    category: string
  ): Promise<void> {
    for (const product of products) {
      const dbProduct = await db.product.upsert({
        where: {
          url: product.url,
        },
        create: {
          title: product.title,
          price: product.price,
          originalPrice: product.originalPrice,
          url: product.url,
          imageUrl: product.imageUrl,
          retailer,
          category,
          scrapedAt: new Date(product.scrapedAt),
        },
        update: {
          price: product.price,
          originalPrice: product.originalPrice,
          scrapedAt: new Date(product.scrapedAt),
        },
      });

      // Append to price history for anomaly detection
      try {
        await db.priceHistory.create({
          data: {
            productId: dbProduct.id,
            productUrl: dbProduct.url,
            price: dbProduct.price,
            scrapedAt: dbProduct.scrapedAt,
          },
        });

        // Detect anomalies and publish to stream for async validation
        await this.detectAndPublishAnomaly(dbProduct, retailer, category);
      } catch (error) {
        console.error('Failed to record price history / detect anomaly:', error);
      }
    }
  }

  private async detectAndPublishAnomaly(
    dbProduct: {
      id: string;
      title: string;
      price: unknown;
      originalPrice: unknown | null;
      stockStatus: string;
      retailer: string;
      url: string;
      imageUrl: string | null;
      category: string | null;
      retailerSku: string | null;
      scrapedAt: Date;
      description: string | null;
    },
    retailer: string,
    category: string
  ): Promise<void> {
    const history = await db.priceHistory.findMany({
      where: { productUrl: dbProduct.url },
      select: { price: true },
      orderBy: { scrapedAt: 'desc' },
      take: 30,
    });

    const historicalPrices = history.map((h: { price: unknown }) => Number(h.price)).filter((p: number) => Number.isFinite(p));

    const currentPrice = Number(dbProduct.price);
    const originalPrice = dbProduct.originalPrice ? Number(dbProduct.originalPrice) : null;

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) return;

    const detection = detectAnomaly(currentPrice, originalPrice, historicalPrices);
    if (!detection.is_anomaly || !detection.anomaly_type) return;

    // Lightweight dedupe: skip if we already have a pending anomaly recently
    const recentPending = await db.pricingAnomaly.findFirst({
      where: {
        productId: dbProduct.id,
        status: 'pending',
        detectedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // 10 minutes
      },
      orderBy: { detectedAt: 'desc' },
    });
    if (recentPending) return;

    const created = await db.pricingAnomaly.create({
      data: {
        productId: dbProduct.id,
        anomalyType: detection.anomaly_type,
        zScore: detection.z_score || null,
        discountPercentage: detection.discount_percentage || 0,
        initialConfidence: detection.confidence,
        status: 'pending',
        detectedAt: dbProduct.scrapedAt,
      },
    });

    const product: Product = {
      id: dbProduct.id,
      title: dbProduct.title,
      price: currentPrice,
      originalPrice: originalPrice || undefined,
      stockStatus: (dbProduct.stockStatus as Product['stockStatus']) || 'unknown',
      retailer,
      url: dbProduct.url,
      imageUrl: dbProduct.imageUrl || undefined,
      category,
      retailerSku: dbProduct.retailerSku || undefined,
      scrapedAt: dbProduct.scrapedAt,
      description: dbProduct.description || undefined,
    };

    const anomaly: PricingAnomaly = {
      id: created.id,
      productId: dbProduct.id,
      product,
      anomalyType: detection.anomaly_type,
      zScore: detection.z_score,
      discountPercentage: detection.discount_percentage,
      initialConfidence: detection.confidence,
      detectedAt: created.detectedAt.toISOString(),
      status: 'pending',
    };

    await publishAnomaly(created.id, anomaly as unknown as Record<string, unknown>);
  }

  private loadRetailerConfigs(): ScraperConfig[] {
    return [
      {
        retailer: 'amazon',
        targetUrl: 'https://www.amazon.com/s?k=electronics',
        selectors: {
          container: '[data-component-type="s-search-result"]',
          title: 'h2 a span',
          price: '.a-price .a-offscreen',
          originalPrice: '.a-text-price .a-offscreen',
          link: 'h2 a',
          image: '.s-image',
        },
        rateLimit: 20, 
        antiBot: true,
      },
      // Add more retailers...
    ];
  }
}
