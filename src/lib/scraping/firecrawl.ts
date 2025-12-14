import { PricingAnomaly, Product, ScrapeResult } from '@/types';
import { isRecentlyProcessed, publishAnomaly } from '@/lib/clients/redis';
import { detectAnomaly } from '@/lib/analysis/detection';

// Firecrawl API configuration
const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

interface FirecrawlScrapeOptions {
  url: string;
  formats?: ('markdown' | 'html' | 'json')[];
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number;
  extract?: {
    schema: Record<string, unknown>;
  };
}

interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    metadata?: {
      title?: string;
      description?: string;
      ogImage?: string;
      [key: string]: unknown;
    };
    llm_extraction?: {
      product_name?: string;
      current_price?: number;
      original_price?: number;
      stock_status?: string;
      image_url?: string;
      category?: string;
    };
  };
  error?: string;
}

/**
 * Scrape a URL using Firecrawl API with stealth mode
 */
export async function scrapeUrl(options: FirecrawlScrapeOptions): Promise<FirecrawlResponse> {
  if (!FIRECRAWL_API_KEY) {
    console.warn('Firecrawl API key not configured');
    return { success: false, error: 'Firecrawl API key not configured' };
  }

  try {
    const requestBody: Record<string, unknown> = {
      url: options.url,
      formats: options.formats || ['markdown'],
      includeTags: options.includeTags,
      excludeTags: options.excludeTags,
      waitFor: options.waitFor || 2000,
      // Stealth mode options
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    };

    // Add extract schema for structured data extraction
    if (options.extract) {
      requestBody.extract = options.extract;
    }

    const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Firecrawl API error: ${error}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown scraping error',
    };
  }
}

/**
 * Extract retailer ID from URL
 */
export function extractRetailerId(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('amazon')) return 'amazon';
    if (hostname.includes('walmart')) return 'walmart';
    if (hostname.includes('target')) return 'target';
    if (hostname.includes('bestbuy')) return 'bestbuy';
    if (hostname.includes('ebay')) return 'ebay';
    return hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'unknown';
  }
}

/**
 * Fetch historical prices for a product from Prisma
 */
export async function getHistoricalPrices(productUrl: string, days = 30): Promise<number[]> {
  const { db } = await import('@/db');
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  try {
    const history = await db.priceHistory.findMany({
      where: {
        productUrl,
        scrapedAt: { gte: cutoffDate },
      },
      select: { price: true },
      orderBy: { scrapedAt: 'desc' },
    });

    return history.map(row => Number(row.price));
  } catch (error) {
    console.error('Error fetching historical prices:', error);
    return [];
  }
}

/**
 * Complete scrape and detect pipeline
 */
export async function scrapeAndDetect(url: string): Promise<ScrapeResult> {
  // Check deduplication
  const isRecent = await isRecentlyProcessed(url);
  if (isRecent) {
    return { success: false, error: 'URL recently processed (deduplication)' };
  }

  // Scrape the URL with JSON format and extract schema for structured data
  const scrapeResult = await scrapeUrl({ 
    url, 
    formats: ['json'],
    extract: {
      schema: {
        type: 'object',
        properties: {
          product_name: { type: 'string' },
          current_price: { type: 'number' },
          original_price: { type: 'number' },
          stock_status: { type: 'string' },
          image_url: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['product_name', 'current_price'],
      },
    },
  });
  if (!scrapeResult.success || !scrapeResult.data) {
    return { success: false, error: scrapeResult.error || 'Scraping failed' };
  }

  // Extract product data (simplified - in production, use LLM extraction)
  const extraction = scrapeResult.data.llm_extraction;
  if (!extraction?.current_price) {
    return { success: false, error: 'Could not extract product price' };
  }

  const scrapedAt = new Date();
  const product: Product = {
    title: extraction.product_name || scrapeResult.data.metadata?.title || 'Unknown Product',
    price: extraction.current_price,
    originalPrice: extraction.original_price || undefined,
    stockStatus: (extraction.stock_status as Product['stockStatus']) || 'unknown',
    retailer: extractRetailerId(url),
    scrapedAt: scrapedAt.toISOString(),
    url,
    imageUrl: extraction.image_url || scrapeResult.data.metadata?.ogImage,
    category: extraction.category,
  };

  // Persist product + price history (best-effort; pipeline is fully functional when DB is configured)
  try {
    const { db } = await import('@/db');

    const dbProduct = await db.product.upsert({
      where: { url },
      create: {
        title: product.title,
        price: product.price,
        originalPrice: product.originalPrice,
        stockStatus: product.stockStatus ?? 'unknown',
        retailer: product.retailer,
        url,
        imageUrl: product.imageUrl,
        category: product.category,
        scrapedAt,
      },
      update: {
        title: product.title,
        price: product.price,
        originalPrice: product.originalPrice,
        stockStatus: product.stockStatus ?? 'unknown',
        imageUrl: product.imageUrl,
        category: product.category,
        scrapedAt,
      },
    });

    product.id = dbProduct.id;

    await db.priceHistory.create({
      data: {
        productId: dbProduct.id,
        productUrl: url,
        price: dbProduct.price,
        scrapedAt,
      },
    });
  } catch (error) {
    console.error('Error persisting product/price history:', error);
  }

  // Get historical prices for Z-score calculation
  const historicalPrices = await getHistoricalPrices(url);

  // Run anomaly detection
  const detection = detectAnomaly(
    product.price,
    product.originalPrice || null,
    historicalPrices
  );

  if (!detection.is_anomaly) {
    return { success: true, product };
  }

  if (!product.id) {
    return {
      success: true,
      product,
      error: 'Anomaly detected but could not be persisted (database not configured)',
    };
  }

  // Persist anomaly and publish to stream for async validation
  let anomaly: PricingAnomaly | undefined;
  try {
    const { db } = await import('@/db');

    const dbAnomaly = await db.pricingAnomaly.create({
      data: {
        productId: product.id,
        anomalyType: detection.anomaly_type!,
        zScore: detection.z_score || null,
        discountPercentage: detection.discount_percentage || 0,
        initialConfidence: detection.confidence,
        status: 'pending',
        detectedAt: scrapedAt,
      },
    });

    anomaly = {
      id: dbAnomaly.id,
      productId: product.id,
      product,
      anomalyType: dbAnomaly.anomalyType as PricingAnomaly['anomalyType'],
      zScore: dbAnomaly.zScore ? Number(dbAnomaly.zScore) : undefined,
      discountPercentage: Number(dbAnomaly.discountPercentage),
      initialConfidence: dbAnomaly.initialConfidence,
      detectedAt: dbAnomaly.detectedAt.toISOString(),
      status: dbAnomaly.status as PricingAnomaly['status'],
    };

    await publishAnomaly(dbAnomaly.id, anomaly as unknown as Record<string, unknown>);
  } catch (error) {
    console.error('Error persisting/publishing anomaly:', error);
  }

  return { success: true, product, anomaly };
}
