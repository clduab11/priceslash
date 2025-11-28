"""
Cost benchmarking aggregation by market region.
Provides market-level pricing benchmarks and comparisons.
"""

import math
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, timedelta
import uuid

logger = logging.getLogger(__name__)


@dataclass
class RegionalBenchmark:
    """Pricing benchmark for a specific region and SKU/category."""

    benchmark_id: str
    sku_id: Optional[str]
    category_id: Optional[str]
    market_id: str
    region_name: str

    avg_price: float
    min_price: float
    max_price: float
    median_price: float
    std_deviation: float
    sample_size: int

    vendor_count: int
    price_trend: str  # "stable", "increasing", "decreasing"
    trend_percentage: float

    benchmark_period_start: datetime
    benchmark_period_end: datetime
    currency_code: str = "USD"

    def to_dict(self) -> dict:
        return {
            "benchmark_id": self.benchmark_id,
            "sku_id": self.sku_id,
            "category_id": self.category_id,
            "market_id": self.market_id,
            "region_name": self.region_name,
            "avg_price": round(self.avg_price, 2),
            "min_price": round(self.min_price, 2),
            "max_price": round(self.max_price, 2),
            "median_price": round(self.median_price, 2),
            "std_deviation": round(self.std_deviation, 2),
            "sample_size": self.sample_size,
            "vendor_count": self.vendor_count,
            "price_trend": self.price_trend,
            "trend_percentage": round(self.trend_percentage, 2),
            "benchmark_period_start": self.benchmark_period_start.isoformat(),
            "benchmark_period_end": self.benchmark_period_end.isoformat(),
            "currency_code": self.currency_code,
        }


@dataclass
class VendorBenchmarkComparison:
    """Comparison of a vendor's pricing against market benchmarks."""

    vendor_id: str
    vendor_name: str
    market_id: str
    region_name: str
    sku_id: str
    product_name: str

    vendor_price: float
    benchmark_avg: float
    benchmark_min: float
    benchmark_max: float

    price_position: str  # "below_market", "at_market", "above_market"
    variance_from_avg_pct: float
    percentile_rank: float  # 0-100, where lower is cheaper

    competitiveness_score: float  # 0-100, higher is more competitive

    def to_dict(self) -> dict:
        return {
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor_name,
            "market_id": self.market_id,
            "region_name": self.region_name,
            "sku_id": self.sku_id,
            "product_name": self.product_name,
            "vendor_price": round(self.vendor_price, 2),
            "benchmark_avg": round(self.benchmark_avg, 2),
            "benchmark_min": round(self.benchmark_min, 2),
            "benchmark_max": round(self.benchmark_max, 2),
            "price_position": self.price_position,
            "variance_from_avg_pct": round(self.variance_from_avg_pct, 2),
            "percentile_rank": round(self.percentile_rank, 1),
            "competitiveness_score": round(self.competitiveness_score, 1),
        }


@dataclass
class CategoryBenchmark:
    """Benchmark for an entire product category."""

    category_id: str
    category_name: str
    market_id: str
    region_name: str

    sku_count: int
    vendor_count: int

    avg_price: float
    median_price: float
    price_range_low: float
    price_range_high: float

    avg_margin_potential_pct: float  # Avg difference between min and max prices

    top_vendors: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "category_id": self.category_id,
            "category_name": self.category_name,
            "market_id": self.market_id,
            "region_name": self.region_name,
            "sku_count": self.sku_count,
            "vendor_count": self.vendor_count,
            "avg_price": round(self.avg_price, 2),
            "median_price": round(self.median_price, 2),
            "price_range_low": round(self.price_range_low, 2),
            "price_range_high": round(self.price_range_high, 2),
            "avg_margin_potential_pct": round(self.avg_margin_potential_pct, 2),
            "top_vendors": self.top_vendors,
        }


def calculate_percentile_rank(value: float, values: List[float]) -> float:
    """Calculate the percentile rank of a value within a list."""
    if not values:
        return 50.0

    sorted_values = sorted(values)
    n = len(sorted_values)

    # Count values less than the given value
    count_below = sum(1 for v in sorted_values if v < value)

    # Calculate percentile
    percentile = (count_below / n) * 100

    return percentile


def calculate_competitiveness_score(
    vendor_price: float,
    min_price: float,
    max_price: float,
    avg_price: float,
) -> float:
    """
    Calculate a competitiveness score (0-100).
    Higher score means more competitive (lower price relative to market).
    """
    if max_price == min_price:
        return 50.0

    # Normalize price within the range
    price_range = max_price - min_price
    normalized_position = (vendor_price - min_price) / price_range

    # Invert so lower price = higher score
    score = (1 - normalized_position) * 100

    # Add bonus for being below average
    if vendor_price < avg_price:
        below_avg_bonus = ((avg_price - vendor_price) / avg_price) * 20
        score = min(100, score + below_avg_bonus)

    return max(0, min(100, score))


class MarketBenchmarker:
    """
    Creates and manages market pricing benchmarks.
    Aggregates pricing data by region for analysis.
    """

    def __init__(
        self,
        default_period_days: int = 30,
        min_sample_size: int = 3,
    ):
        """
        Initialize the benchmarker.

        Args:
            default_period_days: Default benchmark period in days
            min_sample_size: Minimum samples required for a valid benchmark
        """
        self.default_period_days = default_period_days
        self.min_sample_size = min_sample_size

    def create_sku_benchmarks(
        self,
        pricing_data: List[Dict[str, Any]],
        historical_data: Optional[List[Dict[str, Any]]] = None,
        period_end: Optional[datetime] = None,
    ) -> List[RegionalBenchmark]:
        """
        Create pricing benchmarks for each SKU by region.

        Args:
            pricing_data: Current pricing records
            historical_data: Optional historical pricing for trend calculation
            period_end: End date for benchmark period (defaults to now)

        Returns:
            List of RegionalBenchmark objects
        """
        benchmarks = []

        if period_end is None:
            period_end = datetime.now()
        period_start = period_end - timedelta(days=self.default_period_days)

        # Group by market and SKU
        grouped: Dict[Tuple[str, str], List[Dict]] = {}
        for record in pricing_data:
            market_id = record.get("market_id", "global")
            sku_id = record.get("sku_id", "")
            key = (market_id, sku_id)

            if key not in grouped:
                grouped[key] = []
            grouped[key].append(record)

        # Calculate historical trends if available
        historical_prices: Dict[Tuple[str, str], List[float]] = {}
        if historical_data:
            for record in historical_data:
                market_id = record.get("market_id", "global")
                sku_id = record.get("sku_id", "")
                key = (market_id, sku_id)

                if key not in historical_prices:
                    historical_prices[key] = []
                if record.get("unit_price"):
                    historical_prices[key].append(record["unit_price"])

        # Create benchmarks
        for (market_id, sku_id), records in grouped.items():
            prices = [r.get("unit_price", 0) for r in records if r.get("unit_price")]

            if len(prices) < self.min_sample_size:
                continue

            region_name = records[0].get("region_name", market_id)
            currency = records[0].get("currency_code", "USD")

            # Calculate statistics
            sorted_prices = sorted(prices)
            n = len(prices)
            mean = sum(prices) / n

            if n % 2 == 0:
                median = (sorted_prices[n // 2 - 1] + sorted_prices[n // 2]) / 2
            else:
                median = sorted_prices[n // 2]

            if n > 1:
                variance = sum((p - mean) ** 2 for p in prices) / (n - 1)
                std_dev = math.sqrt(variance)
            else:
                std_dev = 0

            # Calculate trend
            key = (market_id, sku_id)
            if key in historical_prices and historical_prices[key]:
                hist_mean = sum(historical_prices[key]) / len(historical_prices[key])
                if hist_mean > 0:
                    trend_pct = ((mean - hist_mean) / hist_mean) * 100
                    if trend_pct > 2:
                        trend = "increasing"
                    elif trend_pct < -2:
                        trend = "decreasing"
                    else:
                        trend = "stable"
                else:
                    trend = "stable"
                    trend_pct = 0
            else:
                trend = "stable"
                trend_pct = 0

            # Count unique vendors
            vendor_count = len(set(r.get("vendor_id") for r in records if r.get("vendor_id")))

            benchmarks.append(RegionalBenchmark(
                benchmark_id=str(uuid.uuid4()),
                sku_id=sku_id,
                category_id=records[0].get("category_id"),
                market_id=market_id,
                region_name=region_name,
                avg_price=mean,
                min_price=min(prices),
                max_price=max(prices),
                median_price=median,
                std_deviation=std_dev,
                sample_size=n,
                vendor_count=vendor_count,
                price_trend=trend,
                trend_percentage=trend_pct,
                benchmark_period_start=period_start,
                benchmark_period_end=period_end,
                currency_code=currency,
            ))

        return benchmarks

    def create_category_benchmarks(
        self,
        pricing_data: List[Dict[str, Any]],
        category_mapping: Optional[Dict[str, str]] = None,
    ) -> List[CategoryBenchmark]:
        """
        Create pricing benchmarks aggregated by category and region.

        Args:
            pricing_data: Pricing records with category information
            category_mapping: Optional dict of category_id to category_name

        Returns:
            List of CategoryBenchmark objects
        """
        benchmarks = []

        # Group by market and category
        grouped: Dict[Tuple[str, str], List[Dict]] = {}
        for record in pricing_data:
            market_id = record.get("market_id", "global")
            category_id = record.get("category_id", "uncategorized")
            key = (market_id, category_id)

            if key not in grouped:
                grouped[key] = []
            grouped[key].append(record)

        for (market_id, category_id), records in grouped.items():
            prices = [r.get("unit_price", 0) for r in records if r.get("unit_price")]

            if not prices:
                continue

            region_name = records[0].get("region_name", market_id)

            # Get category name
            if category_mapping and category_id in category_mapping:
                category_name = category_mapping[category_id]
            else:
                category_name = records[0].get("category_name", category_id)

            # Calculate statistics
            sorted_prices = sorted(prices)
            n = len(prices)
            mean = sum(prices) / n

            if n % 2 == 0:
                median = (sorted_prices[n // 2 - 1] + sorted_prices[n // 2]) / 2
            else:
                median = sorted_prices[n // 2]

            # Calculate margin potential
            sku_margins = []
            sku_prices: Dict[str, List[float]] = {}
            for r in records:
                sku_id = r.get("sku_id", "")
                if sku_id not in sku_prices:
                    sku_prices[sku_id] = []
                if r.get("unit_price"):
                    sku_prices[sku_id].append(r["unit_price"])

            for sku_id, sku_price_list in sku_prices.items():
                if len(sku_price_list) >= 2:
                    min_p = min(sku_price_list)
                    max_p = max(sku_price_list)
                    if min_p > 0:
                        margin = ((max_p - min_p) / min_p) * 100
                        sku_margins.append(margin)

            avg_margin = sum(sku_margins) / len(sku_margins) if sku_margins else 0

            # Get top vendors by SKU count
            vendor_sku_count: Dict[str, int] = {}
            vendor_names: Dict[str, str] = {}
            for r in records:
                vendor_id = r.get("vendor_id", "")
                if vendor_id:
                    vendor_sku_count[vendor_id] = vendor_sku_count.get(vendor_id, 0) + 1
                    vendor_names[vendor_id] = r.get("vendor_name", vendor_id)

            top_vendors = sorted(
                [{"vendor_id": vid, "vendor_name": vendor_names.get(vid, vid), "sku_count": count}
                 for vid, count in vendor_sku_count.items()],
                key=lambda x: x["sku_count"],
                reverse=True
            )[:5]

            benchmarks.append(CategoryBenchmark(
                category_id=category_id,
                category_name=category_name,
                market_id=market_id,
                region_name=region_name,
                sku_count=len(sku_prices),
                vendor_count=len(vendor_sku_count),
                avg_price=mean,
                median_price=median,
                price_range_low=min(prices),
                price_range_high=max(prices),
                avg_margin_potential_pct=avg_margin,
                top_vendors=top_vendors,
            ))

        return benchmarks

    def compare_vendor_to_benchmark(
        self,
        vendor_pricing: List[Dict[str, Any]],
        benchmarks: List[RegionalBenchmark],
    ) -> List[VendorBenchmarkComparison]:
        """
        Compare a vendor's pricing against market benchmarks.

        Args:
            vendor_pricing: Vendor's pricing records
            benchmarks: Market benchmarks to compare against

        Returns:
            List of VendorBenchmarkComparison objects
        """
        comparisons = []

        # Create benchmark lookup
        benchmark_lookup: Dict[Tuple[str, str], RegionalBenchmark] = {}
        for bm in benchmarks:
            if bm.sku_id:
                key = (bm.market_id, bm.sku_id)
                benchmark_lookup[key] = bm

        for record in vendor_pricing:
            vendor_id = record.get("vendor_id", "")
            vendor_name = record.get("vendor_name", vendor_id)
            market_id = record.get("market_id", "global")
            sku_id = record.get("sku_id", "")
            product_name = record.get("product_name", sku_id)
            vendor_price = record.get("unit_price", 0)
            region_name = record.get("region_name", market_id)

            if vendor_price <= 0:
                continue

            key = (market_id, sku_id)
            benchmark = benchmark_lookup.get(key)

            if not benchmark:
                continue

            # Calculate variance from average
            variance_pct = ((vendor_price - benchmark.avg_price) / benchmark.avg_price * 100) if benchmark.avg_price > 0 else 0

            # Determine price position
            if variance_pct < -5:
                position = "below_market"
            elif variance_pct > 5:
                position = "above_market"
            else:
                position = "at_market"

            # Calculate percentile rank (need all prices in benchmark)
            # For now, estimate based on position in min-max range
            price_range = benchmark.max_price - benchmark.min_price
            if price_range > 0:
                percentile = ((vendor_price - benchmark.min_price) / price_range) * 100
            else:
                percentile = 50.0

            # Calculate competitiveness score
            comp_score = calculate_competitiveness_score(
                vendor_price,
                benchmark.min_price,
                benchmark.max_price,
                benchmark.avg_price,
            )

            comparisons.append(VendorBenchmarkComparison(
                vendor_id=vendor_id,
                vendor_name=vendor_name,
                market_id=market_id,
                region_name=region_name,
                sku_id=sku_id,
                product_name=product_name,
                vendor_price=vendor_price,
                benchmark_avg=benchmark.avg_price,
                benchmark_min=benchmark.min_price,
                benchmark_max=benchmark.max_price,
                price_position=position,
                variance_from_avg_pct=variance_pct,
                percentile_rank=percentile,
                competitiveness_score=comp_score,
            ))

        return comparisons

    def get_vendor_competitiveness_summary(
        self,
        comparisons: List[VendorBenchmarkComparison],
    ) -> Dict[str, Any]:
        """
        Summarize a vendor's overall competitiveness across markets.

        Args:
            comparisons: List of vendor benchmark comparisons

        Returns:
            Summary dict with overall metrics
        """
        if not comparisons:
            return {
                "vendor_id": "",
                "vendor_name": "",
                "total_skus": 0,
                "avg_competitiveness_score": 0,
                "position_breakdown": {},
                "best_markets": [],
                "improvement_opportunities": [],
            }

        vendor_id = comparisons[0].vendor_id
        vendor_name = comparisons[0].vendor_name

        # Calculate averages
        avg_comp_score = sum(c.competitiveness_score for c in comparisons) / len(comparisons)
        avg_variance = sum(c.variance_from_avg_pct for c in comparisons) / len(comparisons)

        # Position breakdown
        positions = {"below_market": 0, "at_market": 0, "above_market": 0}
        for c in comparisons:
            positions[c.price_position] += 1

        # Best markets (highest competitiveness)
        market_scores: Dict[str, List[float]] = {}
        for c in comparisons:
            if c.market_id not in market_scores:
                market_scores[c.market_id] = []
            market_scores[c.market_id].append(c.competitiveness_score)

        market_avg_scores = [
            {
                "market_id": mid,
                "region_name": comparisons[0].region_name,  # Simplified
                "avg_competitiveness": sum(scores) / len(scores),
                "sku_count": len(scores),
            }
            for mid, scores in market_scores.items()
        ]
        market_avg_scores.sort(key=lambda x: x["avg_competitiveness"], reverse=True)

        # Improvement opportunities (SKUs where vendor is above market)
        opportunities = [
            {
                "sku_id": c.sku_id,
                "product_name": c.product_name,
                "market_id": c.market_id,
                "current_price": c.vendor_price,
                "benchmark_avg": c.benchmark_avg,
                "potential_reduction_pct": c.variance_from_avg_pct,
            }
            for c in comparisons
            if c.price_position == "above_market"
        ]
        opportunities.sort(key=lambda x: x["potential_reduction_pct"], reverse=True)

        return {
            "vendor_id": vendor_id,
            "vendor_name": vendor_name,
            "total_skus": len(comparisons),
            "avg_competitiveness_score": round(avg_comp_score, 1),
            "avg_variance_from_market_pct": round(avg_variance, 2),
            "position_breakdown": {
                "below_market": positions["below_market"],
                "below_market_pct": round(positions["below_market"] / len(comparisons) * 100, 1),
                "at_market": positions["at_market"],
                "at_market_pct": round(positions["at_market"] / len(comparisons) * 100, 1),
                "above_market": positions["above_market"],
                "above_market_pct": round(positions["above_market"] / len(comparisons) * 100, 1),
            },
            "best_markets": market_avg_scores[:3],
            "improvement_opportunities": opportunities[:10],
        }

    def aggregate_market_summary(
        self,
        benchmarks: List[RegionalBenchmark],
    ) -> Dict[str, Any]:
        """
        Create an aggregate summary across all markets.

        Args:
            benchmarks: List of regional benchmarks

        Returns:
            Summary dict with market-level metrics
        """
        if not benchmarks:
            return {
                "total_markets": 0,
                "total_skus": 0,
                "markets": [],
            }

        # Group by market
        market_data: Dict[str, List[RegionalBenchmark]] = {}
        for bm in benchmarks:
            if bm.market_id not in market_data:
                market_data[bm.market_id] = []
            market_data[bm.market_id].append(bm)

        market_summaries = []
        for market_id, market_benchmarks in market_data.items():
            region_name = market_benchmarks[0].region_name

            all_prices = []
            vendor_ids = set()
            for bm in market_benchmarks:
                all_prices.append(bm.avg_price)
                # Would need vendor data to get unique vendors

            market_summaries.append({
                "market_id": market_id,
                "region_name": region_name,
                "sku_count": len(market_benchmarks),
                "total_vendors": sum(bm.vendor_count for bm in market_benchmarks),
                "avg_price_across_skus": round(sum(all_prices) / len(all_prices), 2) if all_prices else 0,
                "price_trends": {
                    "increasing": sum(1 for bm in market_benchmarks if bm.price_trend == "increasing"),
                    "stable": sum(1 for bm in market_benchmarks if bm.price_trend == "stable"),
                    "decreasing": sum(1 for bm in market_benchmarks if bm.price_trend == "decreasing"),
                },
            })

        # Sort by SKU count
        market_summaries.sort(key=lambda x: x["sku_count"], reverse=True)

        return {
            "total_markets": len(market_data),
            "total_skus": len(set(bm.sku_id for bm in benchmarks if bm.sku_id)),
            "markets": market_summaries,
        }
