import { ProductData } from '@/scrapers/types';
import { routedCompletion } from './openrouter-router';

const SYSTEM_PROMPT = `You are an expert data extraction AI. Your job is to extract e-commerce product information from raw markdown content.

Input: Markdown text from a scraped webpage.
Output: A JSON object containing an array of products.

Product Schema:
{
  "title": string,
  "price": number, (extract numeric value only, handle currency symbols)
  "originalPrice": number | null, (if available)
  "description": string | null,
  "url": string, (absolute URL preferred, if relative use as provided)
  "imageUrl": string | null,
  "stockStatus": "in_stock" | "out_of_stock" | "pre_order" | "unknown",
  "retailerSku": string | null
}

Instructions:
1. Identify all distinct products in the markdown.
2. If the page is a single product page, return an array with one item.
3. If the page is a search result or category page, return all relevant products.
4. Clean up titles and descriptions (remove extra whitespace).
5. Ensure prices are numbers (e.g., "$19.99" -> 19.99).
6. Infer stock status from keywords like "Sold Out", "Add to Cart", etc.
7. Return ONLY valid JSON in the format: { "products": [...results] }`;

export async function extractProductsFromMarkdown(markdown: string, sourceUrl: string): Promise<ProductData[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('OpenRouter API key not configured, returning empty extraction');
    return [];
  }

  try {
    // Use weighted round-robin router for model selection
    const response = await routedCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Source URL: ${sourceUrl}\n\nMarkdown Content:\n${markdown.slice(0, 15000)}` },
      ],
      temperature: 0.1,
      responseFormat: { type: 'json_object' },
      // No unicorn context for extraction - use standard tier
    });

    console.log(`Extraction completed using model: ${response.model}`);

    const content = response.content;
    if (!content) return [];

    const parsed = JSON.parse(content);
    
    if (!parsed.products || !Array.isArray(parsed.products)) {
        console.warn('Extractor returned invalid structure:', content.slice(0, 100));
        return [];
    }

    // Post-process and validate structure
    const products: ProductData[] = parsed.products.map((p: any) => ({
      title: p.title || 'Unknown Product',
      price: typeof p.price === 'number' ? p.price : 0,
      originalPrice: typeof p.originalPrice === 'number' ? p.originalPrice : undefined,
      description: p.description || undefined,
      url: resolveUrl(p.url, sourceUrl),
      imageUrl: p.imageUrl || undefined,
      stockStatus: p.stockStatus || 'unknown',
      retailerSku: p.retailerSku || undefined,
      retailer: new URL(sourceUrl).hostname.replace('www.', ''), // Infer retailer from source
      scrapedAt: new Date().toISOString()
    }));

    return products;

  } catch (error) {
    console.error('Extraction exception:', error);
    return [];
  }
}

function resolveUrl(href: string | undefined, base: string): string {
    if (!href) return base;
    try {
        return new URL(href, base).href;
    } catch {
        return href;
    }
}
