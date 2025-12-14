import type { DetectResult } from '@/types';

/**
 * Calculate Z-score for anomaly detection
 * Z-score = (mean - current_price) / standard_deviation
 * (Positive values indicate the current price is below average)
 */
export function calculateZScore(currentPrice: number, historicalPrices: number[]): number {
  if (historicalPrices.length < 2) return 0;

  const mean = historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length;
  const squaredDiffs = historicalPrices.map((price) => Math.pow(price - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / historicalPrices.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  return (mean - currentPrice) / stdDev;
}

/**
 * Detect pricing anomalies using Z-score and percentage drop
 * Triggers: Price Drop > 50% OR Z-score > 3 OR Decimal error ratio < 1%
 */
export function detectAnomaly(
  currentPrice: number,
  originalPrice: number | null,
  historicalPrices: number[] = []
): DetectResult {
  // Calculate discount percentage if original price available
  let discountPercentage = 0;
  if (originalPrice && originalPrice > 0) {
    discountPercentage = ((originalPrice - currentPrice) / originalPrice) * 100;
  }

  // Calculate Z-score from historical data
  const zScore = calculateZScore(currentPrice, historicalPrices);

  // Anomaly detection logic
  const isPercentageDrop = discountPercentage > 50;
  const isZScoreAnomaly = zScore > 3;
  const isDecimalError = originalPrice !== null && originalPrice > 0 && currentPrice / originalPrice < 0.01;

  const isAnomaly = isPercentageDrop || isZScoreAnomaly || isDecimalError;

  // Determine anomaly type
  let anomalyType: DetectResult['anomaly_type'];
  if (isDecimalError) {
    anomalyType = 'decimal_error';
  } else if (isZScoreAnomaly) {
    anomalyType = 'z_score';
  } else if (isPercentageDrop) {
    anomalyType = 'percentage_drop';
  }

  // Calculate confidence based on signals
  let confidence = 0;
  if (isDecimalError) confidence = 95;
  else if (isZScoreAnomaly && isPercentageDrop) confidence = 90;
  else if (isZScoreAnomaly) confidence = 70 + Math.min(zScore * 5, 20);
  else if (isPercentageDrop) confidence = 50 + Math.min(discountPercentage / 2, 30);

  return {
    is_anomaly: isAnomaly,
    anomaly_type: anomalyType,
    z_score: zScore,
    discount_percentage: discountPercentage,
    confidence: Math.min(confidence, 100),
  };
}

