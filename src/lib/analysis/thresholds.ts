/**
 * Category-specific thresholds and temporal context analysis for anomaly detection
 */

export interface CategoryThresholds {
  madThreshold: number;       // MAD score threshold (default: 3.0)
  dropThreshold: number;      // Percentage drop threshold (default: 50)
  iqrMultiplier: number;      // IQR fence multiplier (default: 2.2)
  minConfidenceBoost: number; // Category-specific confidence adjustment
}

export const CATEGORY_THRESHOLDS: Record<string, CategoryThresholds> = {
  electronics: {
    madThreshold: 2.5,      // More sensitive - glitches are common
    dropThreshold: 40,
    iqrMultiplier: 2.0,
    minConfidenceBoost: 10
  },
  computers: {
    madThreshold: 2.5,
    dropThreshold: 40,
    iqrMultiplier: 2.0,
    minConfidenceBoost: 10
  },
  fashion: {
    madThreshold: 3.5,      // Less sensitive - sales are frequent
    dropThreshold: 60,
    iqrMultiplier: 2.5,
    minConfidenceBoost: 0
  },
  apparel: {
    madThreshold: 3.5,
    dropThreshold: 60,
    iqrMultiplier: 2.5,
    minConfidenceBoost: 0
  },
  grocery: {
    madThreshold: 2.0,      // Very sensitive - prices rarely drop significantly
    dropThreshold: 30,
    iqrMultiplier: 1.8,
    minConfidenceBoost: 15
  },
  home: {
    madThreshold: 3.0,
    dropThreshold: 50,
    iqrMultiplier: 2.2,
    minConfidenceBoost: 5
  },
  toys: {
    madThreshold: 3.2,      // Seasonal variance
    dropThreshold: 55,
    iqrMultiplier: 2.3,
    minConfidenceBoost: 0
  },
  default: {
    madThreshold: 3.0,
    dropThreshold: 50,
    iqrMultiplier: 2.2,
    minConfidenceBoost: 0
  },
};

/**
 * Get thresholds for a specific category, falling back to default if not found
 */
export function getThresholdsForCategory(category: string | null | undefined): CategoryThresholds {
  if (!category) return CATEGORY_THRESHOLDS.default;
  const normalized = category.toLowerCase().trim();
  return CATEGORY_THRESHOLDS[normalized] ?? CATEGORY_THRESHOLDS.default;
}

    return {
      isMaintenanceWindow: false,
      isWeekend: false,
      hourOfDay: null,
      dayOfWeek: null,
      confidenceModifier: 0,
    };

/**
 * Analyze temporal context to detect maintenance windows and adjust confidence
 * Maintenance windows are times when pricing glitches are more likely (2-5 AM, Sunday nights)
 */
export function analyzeTemporalContext(timestamp: Date | null | undefined): TemporalContext {
  if (!timestamp) {
    return {
      isMaintenanceWindow: false,
      isWeekend: false,
      hourOfDay: null,
      dayOfWeek: null,
      confidenceModifier: 0,
    };
  }

  const hour = timestamp.getHours();
  const dayOfWeek = timestamp.getDay(); // 0 = Sunday, 6 = Saturday

  // Maintenance windows: 2-5 AM any day, or Sunday 10PM-midnight
  const isMaintenanceWindow =
    (hour >= 2 && hour <= 5) ||
    (dayOfWeek === 0 && hour >= 22) ||
    (dayOfWeek === 1 && hour <= 2); // Monday early AM (continuation)

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Confidence boost for suspicious timing
  let confidenceModifier = 0;
  if (isMaintenanceWindow) confidenceModifier += 10;
  if (hour >= 2 && hour <= 4) confidenceModifier += 5; // Peak glitch hours

  return {
    isMaintenanceWindow,
    isWeekend,
    hourOfDay: hour,
    dayOfWeek,
    confidenceModifier,
  };
}
