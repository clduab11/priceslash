import { describe, it, expect } from 'vitest';
import {
  CATEGORY_THRESHOLDS,
  getThresholdsForCategory,
  analyzeTemporalContext,
} from './thresholds';
import { detectAnomaly } from './detection';

describe('Category Thresholds', () => {
  it('should return electronics thresholds for electronics category', () => {
    const thresholds = getThresholdsForCategory('electronics');
    expect(thresholds.madThreshold).toBe(2.5);
    expect(thresholds.dropThreshold).toBe(40);
  });

  it('should return computers thresholds for computers category', () => {
    const thresholds = getThresholdsForCategory('computers');
    expect(thresholds.madThreshold).toBe(2.5);
    expect(thresholds.dropThreshold).toBe(40);
    expect(thresholds.iqrMultiplier).toBe(2.0);
    expect(thresholds.minConfidenceBoost).toBe(10);
  });

  it('should return fashion thresholds for fashion category', () => {
    const thresholds = getThresholdsForCategory('fashion');
    expect(thresholds.madThreshold).toBe(3.5);
    expect(thresholds.dropThreshold).toBe(60);
    expect(thresholds.iqrMultiplier).toBe(2.5);
    expect(thresholds.minConfidenceBoost).toBe(0);
  });

  it('should return grocery thresholds for grocery category', () => {
    const thresholds = getThresholdsForCategory('grocery');
    expect(thresholds.madThreshold).toBe(2.0);
    expect(thresholds.dropThreshold).toBe(30);
    expect(thresholds.minConfidenceBoost).toBe(15);
  });

  it('should return default thresholds for unknown category', () => {
    const thresholds = getThresholdsForCategory('unknown-category');
    expect(thresholds).toEqual(CATEGORY_THRESHOLDS.default);
  });

  it('should handle null category', () => {
    expect(getThresholdsForCategory(null)).toEqual(CATEGORY_THRESHOLDS.default);
  });

  it('should handle undefined category', () => {
    expect(getThresholdsForCategory(undefined)).toEqual(CATEGORY_THRESHOLDS.default);
  });

  it('should normalize category case', () => {
    expect(getThresholdsForCategory('ELECTRONICS')).toEqual(CATEGORY_THRESHOLDS.electronics);
    expect(getThresholdsForCategory('Electronics')).toEqual(CATEGORY_THRESHOLDS.electronics);
    expect(getThresholdsForCategory('eLECTRONICS')).toEqual(CATEGORY_THRESHOLDS.electronics);
  });

  it('should handle category with whitespace', () => {
    expect(getThresholdsForCategory('  electronics  ')).toEqual(CATEGORY_THRESHOLDS.electronics);
    expect(getThresholdsForCategory('\telectronics\n')).toEqual(CATEGORY_THRESHOLDS.electronics);
  });
});

describe('Temporal Context', () => {
  it('should detect maintenance window at 3 AM', () => {
    const timestamp = new Date('2025-01-15T03:00:00');
    const context = analyzeTemporalContext(timestamp);
    expect(context.isMaintenanceWindow).toBe(true);
    expect(context.confidenceModifier).toBeGreaterThan(0);
  });

  it('should detect maintenance window at 2 AM', () => {
    const timestamp = new Date('2025-01-15T02:00:00');
    const context = analyzeTemporalContext(timestamp);
    expect(context.isMaintenanceWindow).toBe(true);
  });

  it('should detect maintenance window at 5 AM', () => {
    const timestamp = new Date('2025-01-15T05:00:00');
    const context = analyzeTemporalContext(timestamp);
    expect(context.isMaintenanceWindow).toBe(true);
  });

  it('should not detect maintenance window at 6 AM', () => {
    const timestamp = new Date('2025-01-15T06:00:00');
    const context = analyzeTemporalContext(timestamp);
    expect(context.isMaintenanceWindow).toBe(false);
  });

  it('should detect Sunday night maintenance window', () => {
    const timestamp = new Date('2025-01-19T23:00:00'); // Sunday 11 PM
    const context = analyzeTemporalContext(timestamp);
    expect(context.isMaintenanceWindow).toBe(true);
    expect(context.dayOfWeek).toBe(0); // Sunday
  });

  it('should detect Sunday 10 PM as maintenance window', () => {
    const timestamp = new Date('2025-01-19T22:00:00'); // Sunday 10 PM
    const context = analyzeTemporalContext(timestamp);
    expect(context.isMaintenanceWindow).toBe(true);
  });

  it('should detect Monday early AM (continuation of Sunday night) as maintenance window', () => {
    const timestamp = new Date('2025-01-20T01:00:00'); // Monday 1 AM
    const context = analyzeTemporalContext(timestamp);
    expect(context.isMaintenanceWindow).toBe(true);
  });

  it('should not flag normal business hours', () => {
    const timestamp = new Date('2025-01-15T14:00:00'); // Wednesday 2 PM
    const context = analyzeTemporalContext(timestamp);
    expect(context.isMaintenanceWindow).toBe(false);
    expect(context.confidenceModifier).toBe(0);
  });

  it('should not flag evening hours', () => {
    const timestamp = new Date('2025-01-15T20:00:00'); // Wednesday 8 PM
    const context = analyzeTemporalContext(timestamp);
    expect(context.isMaintenanceWindow).toBe(false);
  });

  it('should handle null timestamp gracefully', () => {
    const context = analyzeTemporalContext(null);
    expect(context.isMaintenanceWindow).toBe(false);
    expect(context.confidenceModifier).toBe(0);
    expect(context.hourOfDay).toBe(null);
    expect(context.dayOfWeek).toBe(null);
  });

  it('should handle undefined timestamp gracefully', () => {
    const context = analyzeTemporalContext(undefined);
    expect(context.isMaintenanceWindow).toBe(false);
    expect(context.confidenceModifier).toBe(0);
  });

  it('should detect weekend correctly', () => {
    const saturday = new Date('2025-01-18T12:00:00');
    const sunday = new Date('2025-01-19T12:00:00');
    const monday = new Date('2025-01-20T12:00:00');

    expect(analyzeTemporalContext(saturday).isWeekend).toBe(true);
    expect(analyzeTemporalContext(sunday).isWeekend).toBe(true);
    expect(analyzeTemporalContext(monday).isWeekend).toBe(false);
  });

  it('should add extra confidence modifier for peak glitch hours (2-4 AM)', () => {
    const peakHour = new Date('2025-01-15T03:30:00');
    const nonPeakMaintenance = new Date('2025-01-15T05:00:00');

    const peakContext = analyzeTemporalContext(peakHour);
    const nonPeakContext = analyzeTemporalContext(nonPeakMaintenance);

    expect(peakContext.confidenceModifier).toBeGreaterThan(nonPeakContext.confidenceModifier);
  });

  it('should return correct hour and day of week', () => {
    // Wednesday, January 15, 2025 at 2:30 PM
    const timestamp = new Date('2025-01-15T14:30:00');
    const context = analyzeTemporalContext(timestamp);

    expect(context.hourOfDay).toBe(14);
    expect(context.dayOfWeek).toBe(3); // Wednesday
  });
});

describe('detectAnomaly with category and temporal context', () => {
  it('should apply electronics thresholds (more sensitive)', () => {
    const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];

    // 45% drop - would NOT trigger default (50%) but SHOULD trigger electronics (40%)
    const result = detectAnomaly(55, 100, historicalPrices, { category: 'electronics' });

    expect(result.is_anomaly).toBe(true);
    expect(result.category_applied).toBe('electronics');
    expect(result.thresholds_used.drop_threshold).toBe(40);
  });

  it('should apply fashion thresholds (less sensitive)', () => {
    const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];

    // 55% drop - would trigger default (50%) percentage drop but NOT fashion (60%)
    const result = detectAnomaly(45, 100, historicalPrices, { category: 'fashion' });

    // Should still trigger on MAD, but percentage_drop specifically uses higher threshold
    expect(result.category_applied).toBe('fashion');
    expect(result.thresholds_used.drop_threshold).toBe(60);
  });

  it('should apply grocery thresholds (very sensitive)', () => {
    const historicalPrices = [10, 10.1, 10, 9.9, 10, 10.1, 10, 9.9, 10, 10.1];

    // 35% drop - would NOT trigger default (50%) or fashion (60%) but SHOULD trigger grocery (30%)
    const result = detectAnomaly(6.5, 10, historicalPrices, { category: 'grocery' });

    expect(result.is_anomaly).toBe(true);
    expect(result.category_applied).toBe('grocery');
    expect(result.thresholds_used.drop_threshold).toBe(30);
  });

  it('should boost confidence during maintenance window', () => {
    const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];
    const maintenanceTime = new Date('2025-01-15T03:30:00');
    const normalTime = new Date('2025-01-15T14:00:00');

    const resultMaintenance = detectAnomaly(50, 100, historicalPrices, {
      timestamp: maintenanceTime
    });
    const resultNormal = detectAnomaly(50, 100, historicalPrices, {
      timestamp: normalTime
    });

    expect(resultMaintenance.confidence).toBeGreaterThan(resultNormal.confidence);
    expect(resultMaintenance.temporal_context.is_maintenance_window).toBe(true);
    expect(resultNormal.temporal_context.is_maintenance_window).toBe(false);
  });

  it('should include temporal context in result', () => {
    const timestamp = new Date('2025-01-15T03:30:00');
    const result = detectAnomaly(50, 100, [100, 100, 100], { timestamp });

    expect(result.temporal_context).toBeDefined();
    expect(result.temporal_context.is_maintenance_window).toBe(true);
    expect(result.temporal_context.hour_of_day).toBe(3);
    expect(result.temporal_context.day_of_week).toBe(3); // Wednesday
  });

  it('should include thresholds used in result', () => {
    const result = detectAnomaly(50, 100, [100, 100, 100], { category: 'electronics' });

    expect(result.thresholds_used).toBeDefined();
    expect(result.thresholds_used.mad_threshold).toBe(2.5);
    expect(result.thresholds_used.drop_threshold).toBe(40);
  });

  it('should work without options (backward compatibility)', () => {
    const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];
    const result = detectAnomaly(25, 100, historicalPrices);

    expect(result.is_anomaly).toBe(true);
    expect(result.category_applied).toBe('default');
    expect(result.thresholds_used.drop_threshold).toBe(50);
    expect(result.temporal_context.is_maintenance_window).toBe(false);
  });

  it('should apply category confidence boost', () => {
    const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];

    // Same price drop, different categories
    const electronicsResult = detectAnomaly(50, 100, historicalPrices, { category: 'electronics' });
    const fashionResult = detectAnomaly(50, 100, historicalPrices, { category: 'fashion' });

    // Electronics has minConfidenceBoost of 10, fashion has 0
    expect(electronicsResult.confidence).toBeGreaterThan(fashionResult.confidence);
  });

  it('should apply grocery confidence boost (highest)', () => {
    const historicalPrices = [10, 10.1, 10, 9.9, 10, 10.1, 10, 9.9, 10, 10.1];

    const groceryResult = detectAnomaly(5, 10, historicalPrices, { category: 'grocery' });
    const defaultResult = detectAnomaly(5, 10, historicalPrices);

    // Grocery has minConfidenceBoost of 15, default has 0
    expect(groceryResult.confidence).toBeGreaterThan(defaultResult.confidence);
  });

  it('should combine category and temporal boosts', () => {
    // Use a scenario that doesn't hit the 100% cap
    // Fashion has no category boost, so we can see the temporal boost effect
    const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];
    const maintenanceTime = new Date('2025-01-15T03:30:00'); // Peak maintenance window: +15 confidence

    const combinedResult = detectAnomaly(50, 100, historicalPrices, {
      category: 'fashion', // No confidence boost from category
      timestamp: maintenanceTime
    });
    const categoryOnlyResult = detectAnomaly(50, 100, historicalPrices, {
      category: 'fashion'
    });

    // Temporal boost should add to confidence
    expect(combinedResult.confidence).toBeGreaterThan(categoryOnlyResult.confidence);
    expect(combinedResult.temporal_context.is_maintenance_window).toBe(true);
  });

  it('should cap confidence at 100', () => {
    const historicalPrices = [100, 101, 100, 99, 100, 101, 100, 99, 100, 101];
    const maintenanceTime = new Date('2025-01-15T03:30:00');

    // Decimal error (95) + grocery boost (15) + maintenance boost (15) = 125, should cap at 100
    const result = detectAnomaly(0.5, 100, historicalPrices, {
      category: 'grocery',
      timestamp: maintenanceTime
    });

    expect(result.confidence).toBe(100);
  });

  it('should normalize category case in result', () => {
    const result = detectAnomaly(50, 100, [], { category: 'ELECTRONICS' });
    expect(result.category_applied).toBe('electronics');
  });

  it('should trim whitespace from category in result', () => {
    const result = detectAnomaly(50, 100, [], { category: '  fashion  ' });
    expect(result.category_applied).toBe('fashion');
  });
});
