/**
 * OpenRouter Weighted Round-Robin Router
 *
 * Implements intelligent model routing across OpenRouter's free tier models
 * with weighted distribution and SOTA model escalation for "unicorn" opportunities.
 *
 * Architecture:
 * - Standard Tier: Top 12 free-performing models with weighted round-robin
 * - SOTA Tier: Premium models reserved for high-value "unicorn" opportunities
 *
 * Unicorn Detection:
 * - Discount > 85% with high initial confidence
 * - Z-score > 4.5 (extreme statistical anomaly)
 * - Product value > $500 with > 70% discount
 * - Decimal error pattern detected (10x or 100x price difference)
 */

// ============================================================================
// Model Definitions
// ============================================================================

export interface ModelConfig {
  id: string;
  name: string;
  weight: number; // Higher weight = more requests routed here
  tier: 'standard' | 'sota';
  contextWindow: number;
  strengths: string[];
  costPer1kTokens: number; // $0 for free models
}

/**
 * Top 12 Free Models on OpenRouter (as of Jan 2026)
 * Ranked by performance benchmarks and real-world usage
 * Weights adjusted based on reliability and output quality
 */
export const FREE_MODELS: ModelConfig[] = [
  // Tier 1: Best performers (highest weights)
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash',
    weight: 15,
    tier: 'standard',
    contextWindow: 1048576,
    strengths: ['fast', 'json', 'reasoning'],
    costPer1kTokens: 0,
  },
  {
    id: 'google/gemini-exp-1206:free',
    name: 'Gemini Exp 1206',
    weight: 14,
    tier: 'standard',
    contextWindow: 32768,
    strengths: ['reasoning', 'analysis', 'json'],
    costPer1kTokens: 0,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B',
    weight: 13,
    tier: 'standard',
    contextWindow: 131072,
    strengths: ['instruction-following', 'json', 'coding'],
    costPer1kTokens: 0,
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct:free',
    name: 'Qwen 2.5 72B',
    weight: 12,
    tier: 'standard',
    contextWindow: 131072,
    strengths: ['multilingual', 'reasoning', 'json'],
    costPer1kTokens: 0,
  },

  // Tier 2: Strong performers (medium weights)
  {
    id: 'deepseek/deepseek-r1-distill-llama-70b:free',
    name: 'DeepSeek R1 Distill 70B',
    weight: 11,
    tier: 'standard',
    contextWindow: 131072,
    strengths: ['reasoning', 'math', 'analysis'],
    costPer1kTokens: 0,
  },
  {
    id: 'nvidia/llama-3.1-nemotron-70b-instruct:free',
    name: 'Nemotron 70B',
    weight: 10,
    tier: 'standard',
    contextWindow: 131072,
    strengths: ['instruction-following', 'helpfulness'],
    costPer1kTokens: 0,
  },
  {
    id: 'qwen/qwq-32b-preview:free',
    name: 'QwQ 32B Preview',
    weight: 9,
    tier: 'standard',
    contextWindow: 32768,
    strengths: ['reasoning', 'chain-of-thought'],
    costPer1kTokens: 0,
  },
  {
    id: 'google/gemini-2.0-flash-thinking-exp:free',
    name: 'Gemini 2.0 Flash Thinking',
    weight: 8,
    tier: 'standard',
    contextWindow: 1048576,
    strengths: ['reasoning', 'analysis'],
    costPer1kTokens: 0,
  },

  // Tier 3: Reliable fallbacks (lower weights)
  {
    id: 'mistralai/mistral-small-24b-instruct-2501:free',
    name: 'Mistral Small 24B',
    weight: 7,
    tier: 'standard',
    contextWindow: 32768,
    strengths: ['fast', 'efficient', 'json'],
    costPer1kTokens: 0,
  },
  {
    id: 'deepseek/deepseek-r1-distill-qwen-32b:free',
    name: 'DeepSeek R1 Qwen 32B',
    weight: 6,
    tier: 'standard',
    contextWindow: 131072,
    strengths: ['reasoning', 'analysis'],
    costPer1kTokens: 0,
  },
  {
    id: 'google/learnlm-1.5-pro-experimental:free',
    name: 'LearnLM 1.5 Pro',
    weight: 5,
    tier: 'standard',
    contextWindow: 32768,
    strengths: ['educational', 'explanation'],
    costPer1kTokens: 0,
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-405b:free',
    name: 'Hermes 3 405B',
    weight: 4,
    tier: 'standard',
    contextWindow: 131072,
    strengths: ['general', 'creative'],
    costPer1kTokens: 0,
  },
];

/**
 * SOTA Models for Unicorn Opportunities
 * These are paid but reserved for high-value validations
 */
export const SOTA_MODELS: ModelConfig[] = [
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    weight: 50,
    tier: 'sota',
    contextWindow: 200000,
    strengths: ['reasoning', 'analysis', 'json', 'safety'],
    costPer1kTokens: 0.003,
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    weight: 30,
    tier: 'sota',
    contextWindow: 128000,
    strengths: ['multimodal', 'reasoning', 'json'],
    costPer1kTokens: 0.005,
  },
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    weight: 20,
    tier: 'sota',
    contextWindow: 2097152,
    strengths: ['long-context', 'reasoning'],
    costPer1kTokens: 0.00125,
  },
];

// ============================================================================
// Router State & Tracking
// ============================================================================

interface RouterState {
  currentIndex: number;
  weightAccumulator: number[];
  totalWeight: number;
  callCounts: Map<string, number>;
  errorCounts: Map<string, number>;
  lastModelUsed: string | null;
  sotaCallCount: number;
}

const state: RouterState = {
  currentIndex: 0,
  weightAccumulator: [],
  totalWeight: 0,
  callCounts: new Map(),
  errorCounts: new Map(),
  lastModelUsed: null,
  sotaCallCount: 0,
};

// Initialize weight accumulator
function initializeWeights(): void {
  state.weightAccumulator = [];
  state.totalWeight = 0;

  for (const model of FREE_MODELS) {
    state.totalWeight += model.weight;
    state.weightAccumulator.push(state.totalWeight);
  }
}

// Initialize on module load
initializeWeights();

// ============================================================================
// Unicorn Detection
// ============================================================================

export interface UnicornContext {
  discountPercentage?: number;
  zScore?: number;
  productPrice?: number;
  originalPrice?: number;
  initialConfidence?: number;
  anomalyType?: string;
}

/**
 * Detect if this is a "unicorn" opportunity that warrants SOTA model usage
 */
export function isUnicornOpportunity(context: UnicornContext): boolean {
  const {
    discountPercentage = 0,
    zScore = 0,
    productPrice = 0,
    originalPrice = 0,
    initialConfidence = 0,
    anomalyType,
  } = context;

  // Criterion 1: Extreme discount with high confidence
  if (discountPercentage > 85 && initialConfidence > 70) {
    return true;
  }

  // Criterion 2: Extreme statistical anomaly
  if (zScore > 4.5) {
    return true;
  }

  // Criterion 3: High-value item with significant discount
  if (originalPrice > 500 && discountPercentage > 70) {
    return true;
  }

  // Criterion 4: Decimal error pattern (10x or 100x difference)
  if (anomalyType === 'decimal_error') {
    return true;
  }

  // Criterion 5: Price ratio suggests major error
  if (originalPrice > 0 && productPrice > 0) {
    const ratio = originalPrice / productPrice;
    if (ratio >= 10 || ratio <= 0.1) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Model Selection
// ============================================================================

/**
 * Select the next model using weighted round-robin
 */
export function selectModel(context?: UnicornContext): ModelConfig {
  // Check for unicorn opportunity
  if (context && isUnicornOpportunity(context)) {
    return selectSotaModel();
  }

  return selectStandardModel();
}

/**
 * Select from standard (free) models using weighted round-robin
 */
function selectStandardModel(): ModelConfig {
  // Generate random value based on total weight
  const random = Math.random() * state.totalWeight;

  // Find the model this falls into
  for (let i = 0; i < state.weightAccumulator.length; i++) {
    if (random < state.weightAccumulator[i]) {
      const model = FREE_MODELS[i];

      // Skip if model has too many recent errors (circuit breaker)
      const errorCount = state.errorCounts.get(model.id) || 0;
      if (errorCount >= 3) {
        // Try next model
        const nextIndex = (i + 1) % FREE_MODELS.length;
        const fallback = FREE_MODELS[nextIndex];
        trackModelSelection(fallback.id);
        return fallback;
      }

      trackModelSelection(model.id);
      return model;
    }
  }

  // Fallback to first model
  const fallback = FREE_MODELS[0];
  trackModelSelection(fallback.id);
  return fallback;
}

/**
 * Select SOTA model using weighted selection
 */
function selectSotaModel(): ModelConfig {
  const totalSotaWeight = SOTA_MODELS.reduce((sum, m) => sum + m.weight, 0);
  const random = Math.random() * totalSotaWeight;

  let cumulative = 0;
  for (const model of SOTA_MODELS) {
    cumulative += model.weight;
    if (random < cumulative) {
      state.sotaCallCount++;
      trackModelSelection(model.id);
      return model;
    }
  }

  // Fallback
  state.sotaCallCount++;
  trackModelSelection(SOTA_MODELS[0].id);
  return SOTA_MODELS[0];
}

function trackModelSelection(modelId: string): void {
  state.lastModelUsed = modelId;
  state.callCounts.set(modelId, (state.callCounts.get(modelId) || 0) + 1);
}

// ============================================================================
// Error Handling & Circuit Breaker
// ============================================================================

/**
 * Report a model error (for circuit breaker logic)
 */
export function reportModelError(modelId: string): void {
  const current = state.errorCounts.get(modelId) || 0;
  state.errorCounts.set(modelId, current + 1);

  // Schedule error count reset after 5 minutes
  setTimeout(() => {
    const count = state.errorCounts.get(modelId) || 0;
    if (count > 0) {
      state.errorCounts.set(modelId, count - 1);
    }
  }, 5 * 60 * 1000);
}

/**
 * Report model success (reset error count)
 */
export function reportModelSuccess(modelId: string): void {
  state.errorCounts.set(modelId, 0);
}

// ============================================================================
// OpenRouter API Call
// ============================================================================

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterOptions {
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' | 'text' };
  unicornContext?: UnicornContext;
}

export interface OpenRouterResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  isUnicorn: boolean;
}

/**
 * Make a request to OpenRouter with automatic model selection and fallback
 */
export async function routedCompletion(
  options: OpenRouterOptions
): Promise<OpenRouterResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const model = selectModel(options.unicornContext);
  const isUnicorn = model.tier === 'sota';

  // Try primary model
  try {
    const response = await callOpenRouter(apiKey, model.id, options);
    reportModelSuccess(model.id);
    return {
      ...response,
      model: model.id,
      isUnicorn,
    };
  } catch (error) {
    reportModelError(model.id);

    // Fallback: try another model
    const fallbackModel = selectStandardModel();
    if (fallbackModel.id !== model.id) {
      try {
        const response = await callOpenRouter(apiKey, fallbackModel.id, options);
        reportModelSuccess(fallbackModel.id);
        return {
          ...response,
          model: fallbackModel.id,
          isUnicorn: false,
        };
      } catch (fallbackError) {
        reportModelError(fallbackModel.id);
        throw fallbackError;
      }
    }

    throw error;
  }
}

async function callOpenRouter(
  apiKey: string,
  modelId: string,
  options: OpenRouterOptions
): Promise<Omit<OpenRouterResponse, 'model' | 'isUnicorn'>> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'pricehawk',
    },
    body: JSON.stringify({
      model: modelId,
      messages: options.messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens,
      response_format: options.responseFormat,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content in OpenRouter response');
  }

  return {
    content,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

// ============================================================================
// Statistics & Monitoring
// ============================================================================

export interface RouterStats {
  totalCalls: number;
  sotaCalls: number;
  modelDistribution: Record<string, number>;
  errorRates: Record<string, number>;
  lastModelUsed: string | null;
}

/**
 * Get router statistics for monitoring
 */
export function getRouterStats(): RouterStats {
  const totalCalls = Array.from(state.callCounts.values()).reduce(
    (sum, c) => sum + c,
    0
  );

  const modelDistribution: Record<string, number> = {};
  for (const [modelId, count] of Array.from(state.callCounts.entries())) {
    modelDistribution[modelId] = count;
  }

  const errorRates: Record<string, number> = {};
  for (const [modelId, errors] of Array.from(state.errorCounts.entries())) {
    const calls = state.callCounts.get(modelId) || 0;
    errorRates[modelId] = calls > 0 ? errors / calls : 0;
  }

  return {
    totalCalls,
    sotaCalls: state.sotaCallCount,
    modelDistribution,
    errorRates,
    lastModelUsed: state.lastModelUsed,
  };
}

/**
 * Reset router statistics (useful for testing)
 */
export function resetRouterStats(): void {
  state.callCounts.clear();
  state.errorCounts.clear();
  state.sotaCallCount = 0;
  state.lastModelUsed = null;
}

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Get all available models
 */
export function getAllModels(): ModelConfig[] {
  return [...FREE_MODELS, ...SOTA_MODELS];
}

/**
 * Get a specific model by ID
 */
export function getModelById(id: string): ModelConfig | undefined {
  return getAllModels().find((m) => m.id === id);
}

/**
 * Check if SOTA models are enabled
 */
export function isSotaEnabled(): boolean {
  return process.env.ENABLE_SOTA_MODELS !== 'false';
}
