import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FREE_MODELS,
  SOTA_MODELS,
  isUnicornOpportunity,
  selectModel,
  getRouterStats,
  resetRouterStats,
  reportModelError,
  reportModelSuccess,
  routedCompletion,
  UnicornContext,
} from './openrouter-router';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenRouter Weighted Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRouterStats();
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Model Configuration', () => {
    it('should have 12 free models configured', () => {
      expect(FREE_MODELS).toHaveLength(12);
    });

    it('should have 3 SOTA models configured', () => {
      expect(SOTA_MODELS).toHaveLength(3);
    });

    it('all free models should have zero cost', () => {
      for (const model of FREE_MODELS) {
        expect(model.costPer1kTokens).toBe(0);
        expect(model.tier).toBe('standard');
      }
    });

    it('all SOTA models should have standard tier', () => {
      for (const model of SOTA_MODELS) {
        expect(model.tier).toBe('sota');
        expect(model.costPer1kTokens).toBeGreaterThan(0);
      }
    });

    it('all models should have valid weight', () => {
      for (const model of [...FREE_MODELS, ...SOTA_MODELS]) {
        expect(model.weight).toBeGreaterThan(0);
      }
    });
  });

  describe('Unicorn Detection', () => {
    it('should detect high discount with high confidence as unicorn', () => {
      const context: UnicornContext = {
        discountPercentage: 90,
        initialConfidence: 75,
      };
      expect(isUnicornOpportunity(context)).toBe(true);
    });

    it('should not detect moderate discount as unicorn', () => {
      const context: UnicornContext = {
        discountPercentage: 60,
        initialConfidence: 50,
      };
      expect(isUnicornOpportunity(context)).toBe(false);
    });

    it('should detect extreme z-score as unicorn', () => {
      const context: UnicornContext = {
        zScore: 5.0,
        discountPercentage: 50,
      };
      expect(isUnicornOpportunity(context)).toBe(true);
    });

    it('should detect high-value item with significant discount as unicorn', () => {
      const context: UnicornContext = {
        originalPrice: 800,
        productPrice: 200,
        discountPercentage: 75,
      };
      expect(isUnicornOpportunity(context)).toBe(true);
    });

    it('should detect decimal error patterns as unicorn', () => {
      const context: UnicornContext = {
        anomalyType: 'decimal_error',
        discountPercentage: 50,
      };
      expect(isUnicornOpportunity(context)).toBe(true);
    });

    it('should detect 10x price ratio as unicorn', () => {
      const context: UnicornContext = {
        originalPrice: 1000,
        productPrice: 100,
        discountPercentage: 50,
      };
      expect(isUnicornOpportunity(context)).toBe(true);
    });

    it('should not trigger for low-value items even with high discount', () => {
      const context: UnicornContext = {
        originalPrice: 50,
        productPrice: 10,
        discountPercentage: 80,
        initialConfidence: 60,
      };
      expect(isUnicornOpportunity(context)).toBe(false);
    });
  });

  describe('Model Selection', () => {
    it('should select from free models for standard requests', () => {
      const model = selectModel();
      expect(FREE_MODELS.map((m) => m.id)).toContain(model.id);
      expect(model.tier).toBe('standard');
    });

    it('should select SOTA model for unicorn opportunities', () => {
      const context: UnicornContext = {
        discountPercentage: 95,
        initialConfidence: 80,
        anomalyType: 'decimal_error',
      };
      const model = selectModel(context);
      expect(SOTA_MODELS.map((m) => m.id)).toContain(model.id);
      expect(model.tier).toBe('sota');
    });

    it('should track model usage statistics', () => {
      // Make several selections
      for (let i = 0; i < 10; i++) {
        selectModel();
      }

      const stats = getRouterStats();
      expect(stats.totalCalls).toBe(10);
      expect(stats.sotaCalls).toBe(0);
    });

    it('should track SOTA calls separately', () => {
      const unicornContext: UnicornContext = {
        discountPercentage: 95,
        initialConfidence: 90,
      };

      for (let i = 0; i < 5; i++) {
        selectModel(unicornContext);
      }

      const stats = getRouterStats();
      expect(stats.sotaCalls).toBe(5);
    });
  });

  describe('Weighted Distribution', () => {
    it('should distribute calls according to weights over many selections', () => {
      const iterations = 10000;
      const counts: Record<string, number> = {};

      for (let i = 0; i < iterations; i++) {
        const model = selectModel();
        counts[model.id] = (counts[model.id] || 0) + 1;
      }

      // Higher weight models should have more calls
      // Gemini 2.5 Flash (weight 16) should have more than Llama 3.3 (weight 5)
      const geminiFlash = FREE_MODELS.find(
        (m) => m.id === 'google/gemini-2.5-flash:free'
      )!;
      const llama33 = FREE_MODELS.find(
        (m) => m.id === 'meta-llama/llama-3.3-70b-instruct:free'
      )!;

      expect(counts[geminiFlash.id]).toBeGreaterThan(counts[llama33.id]);
    });
  });

  describe('Circuit Breaker', () => {
    it('should skip models with too many errors', () => {
      const firstModel = FREE_MODELS[0];

      // Report 3 errors to trigger circuit breaker
      reportModelError(firstModel.id);
      reportModelError(firstModel.id);
      reportModelError(firstModel.id);

      // Make selections - should avoid the first model
      let selectedFirst = 0;
      for (let i = 0; i < 100; i++) {
        const model = selectModel();
        if (model.id === firstModel.id) {
          selectedFirst++;
        }
      }

      // Circuit breaker should prevent selection of errored model
      // (It might still get selected as fallback occasionally)
      expect(selectedFirst).toBeLessThan(10);
    });

    it('should reset error count on success', () => {
      const model = FREE_MODELS[0];

      reportModelError(model.id);
      reportModelError(model.id);
      reportModelSuccess(model.id);

      const stats = getRouterStats();
      expect(stats.errorRates[model.id]).toBe(0);
    });
  });

  describe('routedCompletion', () => {
    it('should throw error if API key not configured', async () => {
      delete process.env.OPENROUTER_API_KEY;

      await expect(
        routedCompletion({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('OPENROUTER_API_KEY not configured');
    });

    it('should make API call with selected model', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"result": "test"}' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await routedCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.content).toBe('{"result": "test"}');
      expect(result.model).toBeDefined();
      expect(result.usage?.totalTokens).toBe(15);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use SOTA model for unicorn context', async () => {
      const mockResponse = {
        choices: [{ message: { content: '{"result": "test"}' } }],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await routedCompletion({
        messages: [{ role: 'user', content: 'test' }],
        unicornContext: {
          discountPercentage: 95,
          initialConfidence: 85,
        },
      });

      expect(result.isUnicorn).toBe(true);
      expect(SOTA_MODELS.map((m) => m.id)).toContain(result.model);
    });

    it('should fallback to another model on error', async () => {
      let callCount = 0;

      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 429,
            text: () => Promise.resolve('Rate limited'),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: '{"result": "fallback"}' } }],
            }),
        });
      });

      const result = await routedCompletion({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(result.content).toBe('{"result": "fallback"}');
      expect(callCount).toBe(2);
    });

    it('should throw if all models fail', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('All models down'),
      });

      await expect(
        routedCompletion({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should reset statistics correctly', () => {
      // Make some calls
      for (let i = 0; i < 5; i++) {
        selectModel();
      }

      resetRouterStats();
      const stats = getRouterStats();

      expect(stats.totalCalls).toBe(0);
      expect(stats.sotaCalls).toBe(0);
      expect(Object.keys(stats.modelDistribution)).toHaveLength(0);
    });

    it('should track last model used', () => {
      selectModel();
      const stats = getRouterStats();
      expect(stats.lastModelUsed).not.toBeNull();
      expect(FREE_MODELS.map((m) => m.id)).toContain(stats.lastModelUsed);
    });
  });
});
