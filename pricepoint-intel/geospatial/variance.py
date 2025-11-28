"""
Regional pricing variance detection and anomaly flagging.
Identifies pricing anomalies across geographic regions.
"""

import math
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class AnomalyType(Enum):
    """Types of pricing anomalies."""
    PRICE_SPIKE = "price_spike"
    PRICE_DROP = "price_drop"
    REGIONAL_VARIANCE = "regional_variance"
    COMPETITOR_GAP = "competitor_gap"
    HISTORICAL_DEVIATION = "historical_deviation"
    CURRENCY_MISMATCH = "currency_mismatch"


class Severity(Enum):
    """Anomaly severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class PricingVariance:
    """Represents pricing variance for a SKU across regions."""

    sku_id: str
    product_name: str
    base_region_id: str
    base_region_name: str
    base_price: float
    currency_code: str

    comparison_region_id: str
    comparison_region_name: str
    comparison_price: float

    absolute_variance: float
    percentage_variance: float
    normalized_variance: float  # Adjusted for regional factors

    def to_dict(self) -> dict:
        return {
            "sku_id": self.sku_id,
            "product_name": self.product_name,
            "base_region_id": self.base_region_id,
            "base_region_name": self.base_region_name,
            "base_price": round(self.base_price, 2),
            "comparison_region_id": self.comparison_region_id,
            "comparison_region_name": self.comparison_region_name,
            "comparison_price": round(self.comparison_price, 2),
            "absolute_variance": round(self.absolute_variance, 2),
            "percentage_variance": round(self.percentage_variance, 2),
            "normalized_variance": round(self.normalized_variance, 2),
            "currency_code": self.currency_code,
        }


@dataclass
class AnomalyFlag:
    """Represents a detected pricing anomaly."""

    anomaly_id: str
    sku_id: str
    product_name: str
    vendor_id: str
    vendor_name: str
    market_id: Optional[str]
    region_name: Optional[str]

    anomaly_type: AnomalyType
    severity: Severity

    expected_price: Optional[float]
    actual_price: float
    variance_percentage: float
    z_score: Optional[float]

    description: str
    detected_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict:
        return {
            "anomaly_id": self.anomaly_id,
            "sku_id": self.sku_id,
            "product_name": self.product_name,
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor_name,
            "market_id": self.market_id,
            "region_name": self.region_name,
            "anomaly_type": self.anomaly_type.value,
            "severity": self.severity.value,
            "expected_price": round(self.expected_price, 2) if self.expected_price else None,
            "actual_price": round(self.actual_price, 2),
            "variance_percentage": round(self.variance_percentage, 2),
            "z_score": round(self.z_score, 2) if self.z_score else None,
            "description": self.description,
            "detected_at": self.detected_at.isoformat(),
        }


@dataclass
class RegionalStats:
    """Statistical summary of pricing for a region."""

    market_id: str
    region_name: str
    sku_id: str
    vendor_count: int
    mean_price: float
    median_price: float
    std_deviation: float
    min_price: float
    max_price: float
    price_range: float
    coefficient_of_variation: float

    def to_dict(self) -> dict:
        return {
            "market_id": self.market_id,
            "region_name": self.region_name,
            "sku_id": self.sku_id,
            "vendor_count": self.vendor_count,
            "mean_price": round(self.mean_price, 2),
            "median_price": round(self.median_price, 2),
            "std_deviation": round(self.std_deviation, 2),
            "min_price": round(self.min_price, 2),
            "max_price": round(self.max_price, 2),
            "price_range": round(self.price_range, 2),
            "coefficient_of_variation": round(self.coefficient_of_variation, 4),
        }


def calculate_statistics(prices: List[float]) -> Dict[str, float]:
    """Calculate basic statistics for a list of prices."""
    if not prices:
        return {
            "mean": 0.0,
            "median": 0.0,
            "std_dev": 0.0,
            "min": 0.0,
            "max": 0.0,
            "range": 0.0,
            "cv": 0.0,
        }

    n = len(prices)
    sorted_prices = sorted(prices)

    # Mean
    mean = sum(prices) / n

    # Median
    if n % 2 == 0:
        median = (sorted_prices[n // 2 - 1] + sorted_prices[n // 2]) / 2
    else:
        median = sorted_prices[n // 2]

    # Standard deviation
    if n > 1:
        variance = sum((p - mean) ** 2 for p in prices) / (n - 1)
        std_dev = math.sqrt(variance)
    else:
        std_dev = 0.0

    # Min/Max/Range
    min_price = min(prices)
    max_price = max(prices)
    price_range = max_price - min_price

    # Coefficient of variation
    cv = std_dev / mean if mean > 0 else 0.0

    return {
        "mean": mean,
        "median": median,
        "std_dev": std_dev,
        "min": min_price,
        "max": max_price,
        "range": price_range,
        "cv": cv,
    }


def calculate_z_score(value: float, mean: float, std_dev: float) -> float:
    """Calculate z-score for a value."""
    if std_dev == 0:
        return 0.0
    return (value - mean) / std_dev


def determine_severity(
    z_score: Optional[float],
    variance_percentage: float,
) -> Severity:
    """Determine anomaly severity based on statistical measures."""
    abs_z = abs(z_score) if z_score else 0
    abs_var = abs(variance_percentage)

    if abs_z >= 4 or abs_var >= 50:
        return Severity.CRITICAL
    elif abs_z >= 3 or abs_var >= 30:
        return Severity.HIGH
    elif abs_z >= 2 or abs_var >= 15:
        return Severity.MEDIUM
    else:
        return Severity.LOW


class VarianceDetector:
    """
    Detects pricing variances and anomalies across regions.
    """

    def __init__(
        self,
        z_score_threshold: float = 2.0,
        variance_threshold_pct: float = 15.0,
        regional_adjustment_factors: Optional[Dict[str, float]] = None,
    ):
        """
        Initialize the variance detector.

        Args:
            z_score_threshold: Z-score threshold for anomaly detection
            variance_threshold_pct: Percentage variance threshold for flagging
            regional_adjustment_factors: Dict of market_id to cost adjustment factor
        """
        self.z_score_threshold = z_score_threshold
        self.variance_threshold_pct = variance_threshold_pct
        self.regional_adjustments = regional_adjustment_factors or {}

    def calculate_regional_variance(
        self,
        pricing_data: List[Dict[str, Any]],
        base_region_id: Optional[str] = None,
    ) -> List[PricingVariance]:
        """
        Calculate pricing variance between regions for each SKU.

        Args:
            pricing_data: List of pricing records with sku_id, market_id, unit_price, etc.
            base_region_id: Optional base region for comparison (uses average if not specified)

        Returns:
            List of PricingVariance objects
        """
        variances = []

        # Group by SKU
        sku_prices: Dict[str, Dict[str, List[Dict]]] = {}
        for record in pricing_data:
            sku_id = record.get("sku_id", "")
            market_id = record.get("market_id", "")

            if sku_id not in sku_prices:
                sku_prices[sku_id] = {}
            if market_id not in sku_prices[sku_id]:
                sku_prices[sku_id][market_id] = []

            sku_prices[sku_id][market_id].append(record)

        # Calculate variance for each SKU
        for sku_id, markets in sku_prices.items():
            if len(markets) < 2:
                continue

            # Get product name from first record
            first_record = next(iter(next(iter(markets.values()))))
            product_name = first_record.get("product_name", sku_id)
            currency = first_record.get("currency_code", "USD")

            # Calculate average price per region
            region_avg_prices: Dict[str, Tuple[float, str]] = {}
            for market_id, records in markets.items():
                prices = [r.get("unit_price", 0) for r in records if r.get("unit_price")]
                if prices:
                    region_name = records[0].get("region_name", market_id)
                    region_avg_prices[market_id] = (sum(prices) / len(prices), region_name)

            if len(region_avg_prices) < 2:
                continue

            # Determine base region
            if base_region_id and base_region_id in region_avg_prices:
                base_price, base_name = region_avg_prices[base_region_id]
            else:
                # Use global average as base
                all_prices = [p for p, _ in region_avg_prices.values()]
                base_price = sum(all_prices) / len(all_prices)
                base_region_id = "global_avg"
                base_name = "Global Average"

            # Calculate variance for each region
            for market_id, (price, region_name) in region_avg_prices.items():
                if market_id == base_region_id:
                    continue

                absolute_var = price - base_price
                pct_var = (absolute_var / base_price * 100) if base_price > 0 else 0

                # Apply regional adjustment if available
                adjustment = self.regional_adjustments.get(market_id, 1.0)
                normalized_var = pct_var / adjustment

                variances.append(PricingVariance(
                    sku_id=sku_id,
                    product_name=product_name,
                    base_region_id=base_region_id,
                    base_region_name=base_name,
                    base_price=base_price,
                    currency_code=currency,
                    comparison_region_id=market_id,
                    comparison_region_name=region_name,
                    comparison_price=price,
                    absolute_variance=absolute_var,
                    percentage_variance=pct_var,
                    normalized_variance=normalized_var,
                ))

        return variances

    def detect_anomalies(
        self,
        pricing_data: List[Dict[str, Any]],
        historical_data: Optional[List[Dict[str, Any]]] = None,
    ) -> List[AnomalyFlag]:
        """
        Detect pricing anomalies across the dataset.

        Args:
            pricing_data: Current pricing records
            historical_data: Optional historical pricing for trend analysis

        Returns:
            List of detected anomalies
        """
        anomalies = []
        import uuid

        # Group by SKU for cross-vendor analysis
        sku_data: Dict[str, List[Dict]] = {}
        for record in pricing_data:
            sku_id = record.get("sku_id", "")
            if sku_id not in sku_data:
                sku_data[sku_id] = []
            sku_data[sku_id].append(record)

        # Detect anomalies for each SKU
        for sku_id, records in sku_data.items():
            if not records:
                continue

            product_name = records[0].get("product_name", sku_id)
            prices = [r.get("unit_price", 0) for r in records if r.get("unit_price")]

            if len(prices) < 2:
                continue

            stats = calculate_statistics(prices)

            for record in records:
                price = record.get("unit_price", 0)
                if price <= 0:
                    continue

                vendor_id = record.get("vendor_id", "")
                vendor_name = record.get("vendor_name", vendor_id)
                market_id = record.get("market_id")
                region_name = record.get("region_name")

                z_score = calculate_z_score(price, stats["mean"], stats["std_dev"])
                variance_pct = ((price - stats["mean"]) / stats["mean"] * 100) if stats["mean"] > 0 else 0

                # Check for anomaly
                if abs(z_score) >= self.z_score_threshold or abs(variance_pct) >= self.variance_threshold_pct:
                    # Determine anomaly type
                    if z_score > 0:
                        anomaly_type = AnomalyType.PRICE_SPIKE
                        description = f"Price {price:.2f} is {variance_pct:.1f}% above market average ({stats['mean']:.2f})"
                    else:
                        anomaly_type = AnomalyType.PRICE_DROP
                        description = f"Price {price:.2f} is {abs(variance_pct):.1f}% below market average ({stats['mean']:.2f})"

                    severity = determine_severity(z_score, variance_pct)

                    anomalies.append(AnomalyFlag(
                        anomaly_id=str(uuid.uuid4()),
                        sku_id=sku_id,
                        product_name=product_name,
                        vendor_id=vendor_id,
                        vendor_name=vendor_name,
                        market_id=market_id,
                        region_name=region_name,
                        anomaly_type=anomaly_type,
                        severity=severity,
                        expected_price=stats["mean"],
                        actual_price=price,
                        variance_percentage=variance_pct,
                        z_score=z_score,
                        description=description,
                    ))

        # Check regional variances
        regional_variances = self.calculate_regional_variance(pricing_data)
        for variance in regional_variances:
            if abs(variance.percentage_variance) >= self.variance_threshold_pct:
                severity = determine_severity(None, variance.percentage_variance)

                if severity.value in ("high", "critical"):
                    anomalies.append(AnomalyFlag(
                        anomaly_id=str(uuid.uuid4()),
                        sku_id=variance.sku_id,
                        product_name=variance.product_name,
                        vendor_id="",
                        vendor_name="Multiple Vendors",
                        market_id=variance.comparison_region_id,
                        region_name=variance.comparison_region_name,
                        anomaly_type=AnomalyType.REGIONAL_VARIANCE,
                        severity=severity,
                        expected_price=variance.base_price,
                        actual_price=variance.comparison_price,
                        variance_percentage=variance.percentage_variance,
                        z_score=None,
                        description=f"Regional price variance: {variance.comparison_region_name} is {variance.percentage_variance:.1f}% different from {variance.base_region_name}",
                    ))

        # Sort by severity
        severity_order = {Severity.CRITICAL: 0, Severity.HIGH: 1, Severity.MEDIUM: 2, Severity.LOW: 3}
        anomalies.sort(key=lambda x: severity_order[x.severity])

        return anomalies

    def calculate_regional_stats(
        self,
        pricing_data: List[Dict[str, Any]],
    ) -> List[RegionalStats]:
        """
        Calculate statistical summary for each region/SKU combination.

        Args:
            pricing_data: Pricing records

        Returns:
            List of RegionalStats
        """
        stats_list = []

        # Group by market and SKU
        grouped: Dict[Tuple[str, str], List[Dict]] = {}
        for record in pricing_data:
            market_id = record.get("market_id", "")
            sku_id = record.get("sku_id", "")
            key = (market_id, sku_id)

            if key not in grouped:
                grouped[key] = []
            grouped[key].append(record)

        for (market_id, sku_id), records in grouped.items():
            prices = [r.get("unit_price", 0) for r in records if r.get("unit_price")]
            if not prices:
                continue

            region_name = records[0].get("region_name", market_id)
            stats = calculate_statistics(prices)

            stats_list.append(RegionalStats(
                market_id=market_id,
                region_name=region_name,
                sku_id=sku_id,
                vendor_count=len(set(r.get("vendor_id") for r in records)),
                mean_price=stats["mean"],
                median_price=stats["median"],
                std_deviation=stats["std_dev"],
                min_price=stats["min"],
                max_price=stats["max"],
                price_range=stats["range"],
                coefficient_of_variation=stats["cv"],
            ))

        return stats_list

    def get_high_variance_skus(
        self,
        pricing_data: List[Dict[str, Any]],
        threshold_cv: float = 0.2,
    ) -> List[Dict[str, Any]]:
        """
        Identify SKUs with high price variance across vendors/regions.

        Args:
            pricing_data: Pricing records
            threshold_cv: Coefficient of variation threshold

        Returns:
            List of high-variance SKU summaries
        """
        high_variance = []

        # Group by SKU
        sku_data: Dict[str, List[Dict]] = {}
        for record in pricing_data:
            sku_id = record.get("sku_id", "")
            if sku_id not in sku_data:
                sku_data[sku_id] = []
            sku_data[sku_id].append(record)

        for sku_id, records in sku_data.items():
            prices = [r.get("unit_price", 0) for r in records if r.get("unit_price")]
            if len(prices) < 2:
                continue

            stats = calculate_statistics(prices)

            if stats["cv"] >= threshold_cv:
                high_variance.append({
                    "sku_id": sku_id,
                    "product_name": records[0].get("product_name", sku_id),
                    "vendor_count": len(set(r.get("vendor_id") for r in records)),
                    "region_count": len(set(r.get("market_id") for r in records)),
                    "mean_price": round(stats["mean"], 2),
                    "min_price": round(stats["min"], 2),
                    "max_price": round(stats["max"], 2),
                    "price_range": round(stats["range"], 2),
                    "coefficient_of_variation": round(stats["cv"], 4),
                    "price_spread_pct": round(stats["range"] / stats["mean"] * 100, 2) if stats["mean"] > 0 else 0,
                })

        # Sort by CV (highest first)
        high_variance.sort(key=lambda x: x["coefficient_of_variation"], reverse=True)

        return high_variance
