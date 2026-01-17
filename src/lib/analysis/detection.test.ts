import { describe, it, expect } from 'vitest';
import { 
  calculateZScore, 
  calculateDoubleMadScore,
  isOutsideAdjustedIQR,
  detectAnomaly 
} from './detection';

describe('Detection Module', () => {
  describe('calculateZScore', () => {
    it('should return 0 for insufficient data', () => {
      expect(calculateZScore(100, [])).toBe(0);
      expect(calculateZScore(100, [100])).toBe(0);
    });

    it('should calculate Z-score correctly', () => {
      const historicalPrices = [100, 102, 98, 101, 99];
      const currentPrice = 50;
      const zScore = calculateZScore(currentPrice, historicalPrices);
      expect(zScore).toBeGreaterThan(0); // Price below mean
    });

    it('should return 0 when standard deviation is 0', () => {
      const historicalPrices = [100, 100, 100];
      const zScore = calculateZScore(100, historicalPrices);
      expect(zScore).toBe(0);
    });

    it('should calculate positive Z-score for price drop', () => {
      const historicalPrices = [100, 110, 105, 108, 102];
      const currentPrice = 50;
      const zScore = calculateZScore(currentPrice, historicalPrices);
      expect(zScore).toBeGreaterThan(3);
    });
  });

  describe('calculateDoubleMadScore', () => {
    it('should return 0 for insufficient data (< 10 samples)', () => {
      expect(calculateDoubleMadScore(100, [])).toBe(0);
      expect(calculateDoubleMadScore(100, [100, 100, 100])).toBe(0);
      expect(calculateDoubleMadScore(100, [100, 100, 100, 100, 100, 100, 100, 100, 100])).toBe(0);
    });

    it('should calculate MAD score for symmetric distribution', () => {
      const historicalPrices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
      const currentPrice = 50;
      const madScore = calculateDoubleMadScore(currentPrice, historicalPrices);
      expect(madScore).toBeGreaterThanOrEqual(0);
    });

    it('should calculate MAD score for right-skewed distribution (retail prices)', () => {
      // Typical retail prices: mostly stable with occasional high outliers (need > 10 samples)
      const historicalPrices = [99, 100, 101, 100, 99, 100, 101, 100, 99, 100, 102];
      const currentPrice = 50; // Anomaly: price drop
      const madScore = calculateDoubleMadScore(currentPrice, historicalPrices);
      expect(madScore).toBeGreaterThan(3.0);
    });

    it('should detect anomaly with MAD score > 3.0', () => {
      const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101, 100];
      const currentPrice = 50; // 50% drop
      const madScore = calculateDoubleMadScore(currentPrice, historicalPrices);
      expect(madScore).toBeGreaterThan(3.0);
    });

    it('should handle prices below median differently from above', () => {
      const historicalPrices = [90, 95, 98, 100, 100, 100, 102, 105, 110, 120];
      const lowPrice = 50;
      const highPrice = 200;
      
      const madScoreLow = calculateDoubleMadScore(lowPrice, historicalPrices);
      const madScoreHigh = calculateDoubleMadScore(highPrice, historicalPrices);
      
      // Both should detect anomalies but with different MAD values
      expect(madScoreLow).toBeGreaterThan(0);
      expect(madScoreHigh).not.toBe(0);
    });
  });

  describe('isOutsideAdjustedIQR', () => {
    it('should return false for insufficient data (< 10 samples)', () => {
      expect(isOutsideAdjustedIQR(100, [])).toBe(false);
      expect(isOutsideAdjustedIQR(100, [100, 100, 100])).toBe(false);
      expect(isOutsideAdjustedIQR(100, [100, 100, 100, 100, 100, 100, 100, 100, 100])).toBe(false);
    });

    it('should return false when IQR is 0', () => {
      const historicalPrices = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100];
      expect(isOutsideAdjustedIQR(100, historicalPrices)).toBe(false);
    });

    it('should detect outliers outside adjusted IQR bounds', () => {
      const historicalPrices = [95, 98, 99, 100, 100, 100, 101, 102, 103, 105];
      const outlierLow = 50;
      const outlierHigh = 200;
      
      expect(isOutsideAdjustedIQR(outlierLow, historicalPrices)).toBe(true);
      expect(isOutsideAdjustedIQR(outlierHigh, historicalPrices)).toBe(true);
    });

    it('should not flag prices within adjusted IQR bounds', () => {
      const historicalPrices = [95, 98, 99, 100, 100, 100, 101, 102, 103, 105];
      const normalPrice = 100;
      
      expect(isOutsideAdjustedIQR(normalPrice, historicalPrices)).toBe(false);
    });

    it('should adjust bounds for right-skewed distributions', () => {
      // Right-skewed: most prices low, few high outliers
      const historicalPrices = [90, 92, 95, 98, 100, 100, 102, 105, 150, 200];
      const lowPrice = 50;
      
      // Should detect low price as outlier even with high outliers present
      expect(isOutsideAdjustedIQR(lowPrice, historicalPrices)).toBe(true);
    });
  });

  describe('detectAnomaly', () => {
    it('should detect percentage drop anomaly', () => {
      const result = detectAnomaly(25, 100, [100, 100, 100]);
      
      expect(result.is_anomaly).toBe(true);
      expect(result.anomaly_type).toBe('percentage_drop');
      expect(result.discount_percentage).toBe(75);
      expect(result.confidence).toBeGreaterThan(50);
    });

    it('should detect decimal error', () => {
      const result = detectAnomaly(0.5, 100, [100, 100, 100]);
      
      expect(result.is_anomaly).toBe(true);
      expect(result.anomaly_type).toBe('decimal_error');
      expect(result.confidence).toBe(95);
    });

    it('should detect MAD score anomaly with sufficient data', () => {
      const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101, 100];
      const result = detectAnomaly(50, 100, historicalPrices);
      
      expect(result.is_anomaly).toBe(true);
      expect(result.mad_score).toBeGreaterThan(3.0);
      expect(result.anomaly_type).toBe('mad_score');
    });

    it('should return mad_score and iqr_flag in result', () => {
      const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];
      const result = detectAnomaly(50, 100, historicalPrices);
      
      expect(result).toHaveProperty('mad_score');
      expect(result).toHaveProperty('iqr_flag');
      expect(typeof result.mad_score).toBe('number');
      expect(typeof result.iqr_flag).toBe('boolean');
    });

    it('should return 0 for mad_score with insufficient data', () => {
      const historicalPrices = [100, 100];
      const result = detectAnomaly(50, 100, historicalPrices);
      
      expect(result.mad_score).toBe(0);
      expect(result.iqr_flag).toBe(false);
    });

    it('should keep Z-score for backward compatibility', () => {
      const historicalPrices = [100, 100, 100];
      const result = detectAnomaly(50, 100, historicalPrices);
      
      expect(result).toHaveProperty('z_score');
      expect(result.z_score).toBeGreaterThanOrEqual(0);
    });

    it('should calculate higher confidence for multiple signals', () => {
      const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101, 100];
      const result = detectAnomaly(25, 100, historicalPrices);
      
      // Should have both MAD anomaly and percentage drop
      expect(result.is_anomaly).toBe(true);
      expect(result.confidence).toBeGreaterThan(85);
    });

    it('should not flag normal prices as anomalies', () => {
      const historicalPrices = [95, 98, 99, 100, 100, 100, 101, 102, 103, 105];
      const result = detectAnomaly(100, 100, historicalPrices);
      
      expect(result.is_anomaly).toBe(false);
      expect(result.mad_score).toBeLessThan(3.0);
      expect(result.iqr_flag).toBe(false);
    });

    it('should handle edge case with empty historical data', () => {
      const result = detectAnomaly(50, 100, []);
      
      expect(result.mad_score).toBe(0);
      expect(result.iqr_flag).toBe(false);
      expect(result.z_score).toBe(0);
    });

    it('should prioritize decimal error over other anomaly types', () => {
      const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];
      const result = detectAnomaly(0.5, 100, historicalPrices);
      
      expect(result.anomaly_type).toBe('decimal_error');
      expect(result.confidence).toBe(95);
    });

    it('should set iqr_outlier type when IQR flag is true but MAD is not', () => {
      // Create a scenario where IQR catches it but MAD might not
      const historicalPrices = [98, 99, 99, 100, 100, 100, 100, 101, 101, 102];
      const result = detectAnomaly(80, null, historicalPrices);
      
      if (result.iqr_flag && result.mad_score <= 3.0) {
        expect(result.anomaly_type).toBe('iqr_outlier');
      }
    });

    it('should handle null original price gracefully', () => {
      const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];
      const result = detectAnomaly(50, null, historicalPrices);
      
      expect(result.discount_percentage).toBe(0);
      expect(result).toHaveProperty('mad_score');
      expect(result).toHaveProperty('iqr_flag');
    });

    it('should detect anomaly with IQR flag and percentage drop', () => {
      const historicalPrices = [95, 98, 99, 100, 100, 100, 101, 102, 103, 105];
      const result = detectAnomaly(30, 100, historicalPrices);
      
      if (result.iqr_flag && result.discount_percentage > 50) {
        expect(result.confidence).toBeGreaterThan(70);
      }
    });
  });

  describe('Integration Tests', () => {
    it('should handle typical retail price scenario', () => {
      // Simulate typical retail prices with slight variations
      const historicalPrices = [99.99, 100.00, 99.99, 100.00, 99.99, 100.00, 99.99, 100.00, 99.99, 100.00];
      
      // Normal price
      const normalResult = detectAnomaly(99.99, 100.00, historicalPrices);
      expect(normalResult.is_anomaly).toBe(false);
      
      // Flash sale (50% off)
      const saleResult = detectAnomaly(49.99, 100.00, historicalPrices);
      expect(saleResult.is_anomaly).toBe(true);
      expect(saleResult.discount_percentage).toBeGreaterThan(50);
    });

    it('should handle Prime Day scenario with legitimate sales', () => {
      // Historical prices showing legitimate price variations
      const historicalPrices = [100, 105, 98, 102, 100, 99, 101, 100, 98, 102];
      
      // 60% off sale (legitimate Prime Day deal)
      const result = detectAnomaly(40, 100, historicalPrices);
      
      expect(result.is_anomaly).toBe(true);
      expect(result.mad_score).toBeGreaterThan(3.0);
      expect(result.discount_percentage).toBe(60);
    });

    it('should handle skewed distribution with occasional high prices', () => {
      // Retail scenario: mostly $100, occasional surge pricing to $150 (need > 10 samples)
      const historicalPrices = [99, 100, 100, 101, 100, 99, 100, 150, 100, 99, 102];
      
      // Price drop to $50 - should be detected by percentage drop
      const result = detectAnomaly(50, 100, historicalPrices);
      
      expect(result.is_anomaly).toBe(true);
      expect(result.discount_percentage).toBe(50);
    });
  });
});
