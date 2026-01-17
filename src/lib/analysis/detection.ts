import type { DetectResult } from '@/types';

/**
 * Calculate median of an array
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate medcouple for skewness measurement (simplified Brys et al. algorithm)
 * Returns value between -1 (left-skewed) and +1 (right-skewed), 0 = symmetric
 * Uses simplified O(n²) algorithm for production use
 */
function calculateMedcouple(values: number[]): number {
  if (values.length < 4) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const med = median(sorted);
  
  // Split into left and right of median
  const left = sorted.filter(x => x <= med);
  const right = sorted.filter(x => x >= med);
  
  if (left.length === 0 || right.length === 0) return 0;
  
  // Calculate h-kernel for all pairs
  const hValues: number[] = [];
  
  for (const xi of left) {
    for (const xj of right) {
      if (xi === med && xj === med) continue;
      
      const num = (xj - med) - (med - xi);
      const denom = xj - xi;
      
      if (Math.abs(denom) < 1e-10) {
        // Handle identical values
        hValues.push(Math.sign(num));
      } else {
        hValues.push(num / denom);
      }
    }
  }
  
  if (hValues.length === 0) return 0;
  
  // Return median of h-values
  return median(hValues);
}

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
 * Calculate Double MAD score for asymmetric distributions
 * Uses separate MAD values for prices below and above median
 * MAD = 1.4826 × median(|Xi - median(X)|)
 * Modified Z-Score = (median(X) - Xi) / MAD
 * (Positive values indicate the current price is below median)
 * Returns 0 if insufficient data (< 10 samples)
 */
export function calculateDoubleMadScore(currentPrice: number, historicalPrices: number[]): number {
  // Require at least 10 samples for robust MAD calculation
  if (historicalPrices.length < 10) return 0;
  
  const med = median(historicalPrices);
  
  // Split into lower and upper groups
  const lowerPrices = historicalPrices.filter(p => p <= med);
  const upperPrices = historicalPrices.filter(p => p > med);
  
  // Calculate deviations from median
  const lowerDeviations = lowerPrices.map(p => Math.abs(p - med));
  const upperDeviations = upperPrices.map(p => Math.abs(p - med));
  
  // Calculate MAD for each side
  const madLower = lowerDeviations.length > 0 ? 1.4826 * median(lowerDeviations) : 0;
  const madUpper = upperDeviations.length > 0 ? 1.4826 * median(upperDeviations) : 0;
  
  // Choose appropriate MAD based on current price position
  let mad = currentPrice <= med ? madLower : madUpper;
  
  // If the chosen MAD is 0 (no variance on that side), use the other side's MAD
  // or fall back to overall MAD if both are 0
  if (mad === 0) {
    mad = currentPrice <= med ? madUpper : madLower;
    if (mad === 0) {
      // Both sides have no variance, calculate overall MAD
      const allDeviations = historicalPrices.map(p => Math.abs(p - med));
      mad = 1.4826 * median(allDeviations);
    }
  }
  
  if (mad === 0) return 0;
  
  // Calculate Modified Z-score
  return (med - currentPrice) / mad;
}

/**
 * Check if price is outside adjusted IQR bounds using medcouple correction
 * Adjusted for right-skewed distributions (retail prices)
 * Lower Fence = Q1 - 2.2 × e^(-4×MC) × IQR
 * Upper Fence = Q3 + 2.2 × e^(3×MC) × IQR
 * Returns false if insufficient data (< 10 samples)
 */
export function isOutsideAdjustedIQR(currentPrice: number, historicalPrices: number[]): boolean {
  // Require at least 10 samples for robust IQR calculation
  if (historicalPrices.length < 10) return false;
  
  const sorted = [...historicalPrices].sort((a, b) => a - b);
  const n = sorted.length;
  
  // Calculate quartiles using linear interpolation (R type 7 - default in R and NumPy)
  const q1Index = (n - 1) * 0.25;
  const q3Index = (n - 1) * 0.75;
  
  const q1Lower = Math.floor(q1Index);
  const q1Upper = Math.ceil(q1Index);
  const q1 = sorted[q1Lower] + (sorted[q1Upper] - sorted[q1Lower]) * (q1Index - q1Lower);
  
  const q3Lower = Math.floor(q3Index);
  const q3Upper = Math.ceil(q3Index);
  const q3 = sorted[q3Lower] + (sorted[q3Upper] - sorted[q3Lower]) * (q3Index - q3Lower);
  
  const iqr = q3 - q1;
  
  if (iqr === 0) return false;
  
  // Calculate medcouple for skewness adjustment
  const mc = calculateMedcouple(sorted);
  
  // Calculate adjusted fences for right-skewed distributions
  const multiplier = 2.2; // Hoaglin & Iglewicz tuned for production
  const lowerFence = q1 - multiplier * Math.exp(-4 * mc) * iqr;
  const upperFence = q3 + multiplier * Math.exp(3 * mc) * iqr;
  
  return currentPrice < lowerFence || currentPrice > upperFence;
}

/**
 * Detect pricing anomalies using Z-score, MAD, IQR, and percentage drop
 * Triggers: Price Drop > 50% OR Z-score > 3 OR MAD score > 3 OR Decimal error ratio < 1%
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

  // Calculate Z-score from historical data (keep for backward compatibility)
  const zScore = calculateZScore(currentPrice, historicalPrices);
  
  // Calculate MAD score using Double MAD
  const madScore = calculateDoubleMadScore(currentPrice, historicalPrices);
  
  // Calculate IQR flag using adjusted boxplot
  const iqrFlag = isOutsideAdjustedIQR(currentPrice, historicalPrices);

  // Anomaly detection logic
  const isPercentageDrop = discountPercentage > 50;
  const isZScoreAnomaly = zScore > 3;
  const isMadAnomaly = madScore > 3.0; // Primary statistical signal
  const isDecimalError = originalPrice !== null && originalPrice > 0 && currentPrice / originalPrice < 0.01;

  // Include both MAD and Z-score for backward compatibility
  const isAnomaly = isPercentageDrop || isMadAnomaly || isZScoreAnomaly || isDecimalError;

  // Determine anomaly type (prioritize decimal error, then MAD, then Z-score, then percentage)
  let anomalyType: DetectResult['anomaly_type'];
  if (isDecimalError) {
    anomalyType = 'decimal_error';
  } else if (isMadAnomaly) {
    anomalyType = 'mad_score';
  } else if (iqrFlag) {
    anomalyType = 'iqr_outlier';
  } else if (isZScoreAnomaly) {
    anomalyType = 'z_score';
  } else if (isPercentageDrop) {
    anomalyType = 'percentage_drop';
  }

  // Calculate confidence based on signals
  let confidence = 0;
  if (isDecimalError) {
    confidence = 95;
  } else if (isMadAnomaly && isPercentageDrop) {
    confidence = 90;
  } else if (isMadAnomaly && iqrFlag) {
    confidence = 85;
  } else if (isMadAnomaly) {
    confidence = 70 + Math.min(madScore * 5, 20);
  } else if (iqrFlag && isPercentageDrop) {
    confidence = 75;
  } else if (isPercentageDrop) {
    confidence = 50 + Math.min(discountPercentage / 2, 30);
  } else if (isZScoreAnomaly) {
    confidence = 70 + Math.min(zScore * 5, 20);
  }

  return {
    is_anomaly: isAnomaly,
    anomaly_type: anomalyType,
    z_score: zScore,
    discount_percentage: discountPercentage,
    confidence: Math.min(confidence, 100),
    mad_score: madScore,
    iqr_flag: iqrFlag,
  };
}

