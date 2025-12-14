import { PricingAnomaly, ValidatedGlitch, ValidationResult } from '@/types';
import { publishConfirmedGlitch } from '@/lib/clients/redis';

// OpenRouter API configuration
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'deepseek/deepseek-chat'; // DeepSeek V3

// System prompt for glitch analysis
const SYSTEM_PROMPT = `You are an AI expert in e-commerce pricing analysis. Your job is to determine if a price is a genuine pricing error (glitch) or a legitimate sale/discount.

Analyze the provided product data and determine:
1. Whether this is likely a pricing glitch (is_glitch: true/false)
2. Your confidence level (0-100)
3. Brief reasoning for your decision
4. The type of glitch if applicable

Consider these factors:
- Discount percentage (>70% is suspicious, >90% is very likely a glitch)
- Z-score (>3 indicates significant deviation from historical prices)
- Common glitch patterns:
  - Decimal errors (e.g., $19.99 instead of $199.99)
  - Database errors (wrong product linked to price)
  - Coupon stacking (multiple discounts applied incorrectly)
  - Clearance mistakes
- Retailer context (some retailers have frequent glitches)
- Product category (electronics, appliances more prone to glitches)
- Time of day (late night updates often cause errors)

Respond ONLY with valid JSON in this exact format:
{
  "is_glitch": boolean,
  "confidence": number,
  "reasoning": "string",
  "glitch_type": "decimal_error" | "database_error" | "clearance" | "coupon_stack" | "unknown"
}`;

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
  };
}

/**
 * Validate a pricing anomaly using AI (OpenRouter/DeepSeek)
 */
export async function validateAnomaly(anomaly: PricingAnomaly): Promise<ValidationResult> {
  if (!OPENROUTER_API_KEY) {
    console.warn('OpenRouter API key not configured');
    // Return a conservative estimate based on rule-based logic
    return fallbackValidation(anomaly);
  }

  const userPrompt = formatAnomalyForAI(anomaly);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Pricing Glitch Monitor',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // Low temperature for consistent analysis
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter API error:', error);
      return fallbackValidation(anomaly);
    }

    const data: OpenRouterResponse = await response.json();
    
    if (data.error) {
      console.error('OpenRouter error:', data.error.message);
      return fallbackValidation(anomaly);
    }

    const content = data.choices[0]?.message?.content;
    if (!content) {
      return fallbackValidation(anomaly);
    }

    // Parse AI response
    const parsed = JSON.parse(content);
    return {
      is_glitch: parsed.is_glitch ?? false,
      confidence: Math.min(Math.max(parsed.confidence ?? 0, 0), 100),
      reasoning: parsed.reasoning ?? 'AI analysis completed',
      glitch_type: parsed.glitch_type ?? 'unknown',
    };
  } catch (error) {
    console.error('Error calling OpenRouter:', error);
    return fallbackValidation(anomaly);
  }
}

/**
 * Format anomaly data for AI analysis
 */
function formatAnomalyForAI(anomaly: PricingAnomaly): string {
  // Use non-null assertion or optional chaining for optional product properties
  const product = anomaly.product!;
  const { anomalyType, zScore, discountPercentage, initialConfidence } = anomaly;
  
  return `Analyze this potential pricing error:

Product: ${product.title}
Retailer: ${product.retailer}
Category: ${product.category || 'Unknown'}

Pricing:
- Current Price: $${product.price.toFixed(2)}
- Original Price: ${product.originalPrice ? `$${product.originalPrice.toFixed(2)}` : 'Not listed'}
- Discount: ${discountPercentage.toFixed(1)}%

Detection Signals:
- Anomaly Type: ${anomalyType}
- Z-Score: ${zScore?.toFixed(2) || 'N/A'}
- Initial Confidence: ${initialConfidence}%

Stock Status: ${product.stockStatus}
Detection Time: ${anomaly.detectedAt}

Is this a pricing glitch or a legitimate sale?`;
}

/**
 * Fallback validation using rule-based logic (when AI is unavailable)
 */
function fallbackValidation(anomaly: PricingAnomaly): ValidationResult {
  const { discountPercentage, zScore, anomalyType, initialConfidence } = anomaly;
  
  // Rule-based decision making
  let isGlitch = false;
  let confidence = initialConfidence;
  let reasoning = '';
  let glitchType: ValidationResult['glitch_type'] = 'unknown';

  if (anomalyType === 'decimal_error') {
    isGlitch = true;
    confidence = Math.min(95, confidence + 10);
    reasoning = 'Price ratio suggests decimal point error (price is less than 1% of original).';
    glitchType = 'decimal_error';
  } else if (discountPercentage > 90) {
    isGlitch = true;
    confidence = Math.min(90, confidence + 5);
    reasoning = `Extremely high discount (${discountPercentage.toFixed(0)}%) is very likely a pricing error.`;
    glitchType = 'database_error';
  } else if (zScore && zScore > 4 && discountPercentage > 60) {
    isGlitch = true;
    confidence = Math.min(85, confidence);
    reasoning = `High Z-score (${zScore.toFixed(1)}) combined with ${discountPercentage.toFixed(0)}% discount indicates anomaly.`;
    glitchType = 'database_error';
  } else if (discountPercentage > 70) {
    isGlitch = discountPercentage > 80;
    confidence = Math.min(70, confidence);
    reasoning = `Significant discount (${discountPercentage.toFixed(0)}%). May be legitimate sale or error.`;
    glitchType = discountPercentage > 80 ? 'clearance' : 'unknown';
  } else {
    isGlitch = false;
    confidence = 100 - confidence;
    reasoning = 'Discount is within normal sale range. Likely legitimate promotion.';
  }

  return {
    is_glitch: isGlitch,
    confidence,
    reasoning,
    glitch_type: glitchType,
  };
}

/**
 * Complete validation pipeline for an anomaly
 */
export async function validateAndProcess(anomaly: PricingAnomaly): Promise<ValidatedGlitch | null> {
  // Idempotency: if this anomaly was already processed, return the existing result
  try {
    const { db } = await import('@/db');
    const existing = await db.validatedGlitch.findUnique({
      where: { anomalyId: anomaly.id },
      include: { product: true },
    });

    if (existing) {
      return {
        id: existing.id,
        anomalyId: existing.anomalyId,
        productId: existing.productId,
        product: {
          id: existing.product.id,
          title: existing.product.title,
          price: Number(existing.product.price),
          originalPrice: existing.product.originalPrice ? Number(existing.product.originalPrice) : undefined,
          stockStatus: existing.product.stockStatus as ValidatedGlitch['product']['stockStatus'],
          retailer: existing.product.retailer,
          url: existing.product.url,
          imageUrl: existing.product.imageUrl ?? undefined,
          category: existing.product.category ?? undefined,
          retailerSku: existing.product.retailerSku ?? undefined,
          scrapedAt: existing.product.scrapedAt,
          description: existing.product.description ?? undefined,
        },
        isGlitch: existing.isGlitch,
        confidence: existing.confidence,
        reasoning: existing.reasoning,
        glitchType: existing.glitchType as ValidationResult['glitch_type'],
        profitMargin: Number(existing.profitMargin),
        estimatedDuration: existing.estimatedDuration ?? undefined,
        validatedAt: existing.validatedAt.toISOString(),
      };
    }
  } catch (error) {
    // If DB lookup fails, continue with best-effort processing.
    console.warn('Validated glitch lookup failed; continuing:', error);
  }

  // Run AI validation
  const validation = await validateAnomaly(anomaly);

  // Only process confirmed glitches with sufficient confidence
  if (!validation.is_glitch || validation.confidence < 60) {
    // Update anomaly status to rejected
    await updateAnomalyStatus(anomaly.id, 'rejected');
    return null;
  }

  // Create validated glitch record
  const glitchId = `glitch_${crypto.randomUUID()}`;
  const validatedGlitch: ValidatedGlitch = {
    id: glitchId,
    anomalyId: anomaly.id,
    productId: anomaly.productId,
    product: anomaly.product!,
    isGlitch: validation.is_glitch,
    confidence: validation.confidence,
    reasoning: validation.reasoning,
    glitchType: validation.glitch_type,
    profitMargin: anomaly.discountPercentage,
    estimatedDuration: estimateGlitchDuration(validation.glitch_type),
    validatedAt: new Date().toISOString(),
  };

  // Save to database
  await saveValidatedGlitch(validatedGlitch);

  // Publish to Redis for notification workers
  await publishConfirmedGlitch(glitchId, validatedGlitch as unknown as Record<string, unknown>);

  // Update anomaly status
  await updateAnomalyStatus(anomaly.id, 'validated');

  return validatedGlitch;
}

/**
 * Estimate how long a glitch might last based on type
 */
function estimateGlitchDuration(glitchType: ValidationResult['glitch_type']): string {
  switch (glitchType) {
    case 'decimal_error':
      return '15-30 minutes';
    case 'database_error':
      return '30-60 minutes';
    case 'clearance':
      return '2-4 hours';
    case 'coupon_stack':
      return '1-2 hours';
    default:
      return '30 minutes';
  }
}

/**
 * Update anomaly status in database
 */
async function updateAnomalyStatus(anomalyId: string, status: PricingAnomaly['status']): Promise<void> {
  const { db } = await import('@/db');
  
  try {
    await db.pricingAnomaly.update({
      where: { id: anomalyId },
      data: { status },
    });
  } catch (error) {
    console.error('Error updating anomaly status:', error);
  }
}

/**
 * Save validated glitch to database
 */
async function saveValidatedGlitch(glitch: ValidatedGlitch): Promise<void> {
  const { db } = await import('@/db');
  
  try {
    await db.validatedGlitch.create({
      data: {
        id: glitch.id,
        anomalyId: glitch.anomalyId,
        productId: glitch.productId, // Added required field
        isGlitch: glitch.isGlitch,
        confidence: glitch.confidence,
        reasoning: glitch.reasoning,
        glitchType: glitch.glitchType,
        profitMargin: glitch.profitMargin,
        validatedAt: new Date(glitch.validatedAt),
      },
    });
  } catch (error) {
    console.error('Error saving validated glitch:', error);
    throw error;
  }
}
