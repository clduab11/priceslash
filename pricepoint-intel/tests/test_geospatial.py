"""
Unit tests for geospatial risk framework.
Tests proximity analysis, variance detection, and benchmarking.
"""

import pytest
import sys
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).parent.parent))

from geospatial.proximity import (
    ProximityAnalyzer,
    haversine_distance,
    calculate_proximity_score,
    estimate_travel_time,
)
from geospatial.variance import (
    VarianceDetector,
    calculate_statistics,
    calculate_z_score,
    determine_severity,
    AnomalyType,
    Severity,
)
from geospatial.benchmarking import (
    MarketBenchmarker,
    calculate_percentile_rank,
    calculate_competitiveness_score,
)


class TestHaversineDistance:
    """Tests for haversine distance calculation."""

    def test_same_point_distance_zero(self):
        """Distance between same point should be zero."""
        distance = haversine_distance(40.7128, -74.0060, 40.7128, -74.0060)
        assert abs(distance) < 0.001

    def test_known_distance_nyc_la(self):
        """Test known distance between NYC and LA (~3,944 km)."""
        # NYC: 40.7128, -74.0060
        # LA: 34.0522, -118.2437
        distance = haversine_distance(40.7128, -74.0060, 34.0522, -118.2437)
        assert 3900 < distance < 4000  # Approximately 3944 km

    def test_known_distance_london_paris(self):
        """Test known distance between London and Paris (~344 km)."""
        # London: 51.5074, -0.1278
        # Paris: 48.8566, 2.3522
        distance = haversine_distance(51.5074, -0.1278, 48.8566, 2.3522)
        assert 340 < distance < 350

    def test_antipodal_points(self):
        """Test maximum distance (antipodal points ~20,000 km)."""
        distance = haversine_distance(0, 0, 0, 180)
        assert 19000 < distance < 21000

    def test_symmetry(self):
        """Distance A->B should equal B->A."""
        dist_ab = haversine_distance(40.7128, -74.0060, 34.0522, -118.2437)
        dist_ba = haversine_distance(34.0522, -118.2437, 40.7128, -74.0060)
        assert abs(dist_ab - dist_ba) < 0.001


class TestProximityScore:
    """Tests for proximity score calculation."""

    def test_zero_distance_max_score(self):
        """Zero distance should give max score (100)."""
        score = calculate_proximity_score(0)
        assert score == 100.0

    def test_max_distance_min_score(self):
        """Distance at or beyond max should give min score (0)."""
        score = calculate_proximity_score(500, max_distance_km=500)
        assert score == 0.0

        score = calculate_proximity_score(1000, max_distance_km=500)
        assert score == 0.0

    def test_score_decreases_with_distance(self):
        """Score should decrease as distance increases."""
        scores = [calculate_proximity_score(d) for d in [0, 50, 100, 200, 300]]
        for i in range(len(scores) - 1):
            assert scores[i] > scores[i + 1]

    def test_score_bounded(self):
        """Score should always be between 0 and 100."""
        test_distances = [-10, 0, 50, 100, 250, 500, 1000, 10000]
        for dist in test_distances:
            score = calculate_proximity_score(max(0, dist))  # No negative distances
            assert 0 <= score <= 100


class TestProximityAnalyzer:
    """Tests for ProximityAnalyzer class."""

    @pytest.fixture
    def analyzer(self):
        return ProximityAnalyzer(max_distance_km=500, decay_factor=2.0)

    @pytest.fixture
    def sample_market(self):
        return {
            "market_id": "MKT-NYC",
            "region_name": "New York",
            "latitude": 40.7128,
            "longitude": -74.0060,
        }

    @pytest.fixture
    def sample_vendor(self):
        return {
            "vendor_id": "V-001",
            "vendor_name": "Test Vendor",
        }

    @pytest.fixture
    def sample_distribution_centers(self):
        return [
            {
                "center_id": "DC-001",
                "center_name": "NYC Warehouse",
                "vendor_id": "V-001",
                "latitude": 40.7580,
                "longitude": -73.9855,
            },
            {
                "center_id": "DC-002",
                "center_name": "Philadelphia DC",
                "vendor_id": "V-001",
                "latitude": 39.9526,
                "longitude": -75.1652,
            },
            {
                "center_id": "DC-003",
                "center_name": "LA Warehouse",
                "vendor_id": "V-002",  # Different vendor
                "latitude": 34.0522,
                "longitude": -118.2437,
            },
        ]

    def test_calculate_proximity(self, analyzer):
        """Test proximity calculation between two points."""
        score = analyzer.calculate_proximity(
            market_lat=40.7128,
            market_lon=-74.0060,
            center_lat=40.7580,
            center_lon=-73.9855,
            vendor_id="V-001",
            vendor_name="Test",
            center_id="DC-001",
            center_name="Test DC",
        )

        assert score.vendor_id == "V-001"
        assert score.center_id == "DC-001"
        assert score.distance_km > 0
        assert score.distance_km < 10  # NYC to Times Square ~5km
        assert score.proximity_score > 90  # Very close
        assert score.travel_time_estimate_hours is not None
        assert score.shipping_cost_factor is not None

    def test_analyze_vendor_coverage(
        self, analyzer, sample_market, sample_vendor, sample_distribution_centers
    ):
        """Test vendor coverage analysis."""
        coverage = analyzer.analyze_vendor_coverage(
            sample_market, sample_vendor, sample_distribution_centers
        )

        assert coverage.vendor_id == "V-001"
        assert coverage.market_id == "MKT-NYC"
        assert coverage.center_count == 2  # Only V-001's centers
        assert coverage.nearest_center_distance_km > 0
        assert coverage.coverage_score > 0

    def test_analyze_vendor_coverage_no_centers(
        self, analyzer, sample_market, sample_distribution_centers
    ):
        """Test coverage analysis when vendor has no centers."""
        vendor_no_centers = {"vendor_id": "V-999", "vendor_name": "No Centers"}
        coverage = analyzer.analyze_vendor_coverage(
            sample_market, vendor_no_centers, sample_distribution_centers
        )

        assert coverage.center_count == 0
        assert coverage.coverage_score == 0.0
        assert coverage.nearest_center_distance_km == float("inf")


class TestVarianceDetector:
    """Tests for VarianceDetector class."""

    @pytest.fixture
    def detector(self):
        return VarianceDetector(z_score_threshold=2.0, variance_threshold_pct=15.0)

    @pytest.fixture
    def sample_pricing_data(self):
        return [
            {"sku_id": "SKU-001", "vendor_id": "V-001", "unit_price": 100, "market_id": "MKT-1", "region_name": "East", "product_name": "Product A"},
            {"sku_id": "SKU-001", "vendor_id": "V-002", "unit_price": 105, "market_id": "MKT-1", "region_name": "East", "product_name": "Product A"},
            {"sku_id": "SKU-001", "vendor_id": "V-003", "unit_price": 95, "market_id": "MKT-1", "region_name": "East", "product_name": "Product A"},
            {"sku_id": "SKU-001", "vendor_id": "V-001", "unit_price": 120, "market_id": "MKT-2", "region_name": "West", "product_name": "Product A"},
            {"sku_id": "SKU-001", "vendor_id": "V-002", "unit_price": 125, "market_id": "MKT-2", "region_name": "West", "product_name": "Product A"},
        ]

    def test_calculate_statistics(self):
        """Test basic statistics calculation."""
        prices = [100, 105, 95, 110, 90]
        stats = calculate_statistics(prices)

        assert stats["mean"] == 100.0
        assert stats["min"] == 90
        assert stats["max"] == 110
        assert stats["range"] == 20
        assert stats["median"] == 100

    def test_calculate_statistics_empty(self):
        """Test statistics with empty list."""
        stats = calculate_statistics([])
        assert stats["mean"] == 0.0
        assert stats["std_dev"] == 0.0

    def test_calculate_z_score(self):
        """Test z-score calculation."""
        # Value at mean = z-score of 0
        assert calculate_z_score(100, 100, 10) == 0.0

        # Value one std above mean = z-score of 1
        assert abs(calculate_z_score(110, 100, 10) - 1.0) < 0.001

        # Value one std below mean = z-score of -1
        assert abs(calculate_z_score(90, 100, 10) - (-1.0)) < 0.001

        # Zero std dev returns 0
        assert calculate_z_score(100, 100, 0) == 0.0

    def test_determine_severity(self):
        """Test severity determination."""
        assert determine_severity(4.5, 60) == Severity.CRITICAL
        assert determine_severity(3.5, 40) == Severity.HIGH
        assert determine_severity(2.5, 20) == Severity.MEDIUM
        assert determine_severity(1.0, 5) == Severity.LOW

    def test_detect_anomalies(self, detector, sample_pricing_data):
        """Test anomaly detection."""
        anomalies = detector.detect_anomalies(sample_pricing_data)

        # Should detect some anomalies due to price differences
        assert isinstance(anomalies, list)
        for anomaly in anomalies:
            assert anomaly.sku_id is not None
            assert anomaly.anomaly_type in AnomalyType
            assert anomaly.severity in Severity

    def test_calculate_regional_variance(self, detector, sample_pricing_data):
        """Test regional variance calculation."""
        variances = detector.calculate_regional_variance(sample_pricing_data)

        assert len(variances) > 0
        for variance in variances:
            assert variance.sku_id == "SKU-001"
            assert variance.base_price > 0
            assert variance.comparison_price > 0

    def test_get_high_variance_skus(self, detector):
        """Test identification of high variance SKUs."""
        pricing_data = [
            {"sku_id": "SKU-HIGH", "vendor_id": "V-001", "unit_price": 50, "product_name": "High Var"},
            {"sku_id": "SKU-HIGH", "vendor_id": "V-002", "unit_price": 100, "product_name": "High Var"},  # 100% difference
            {"sku_id": "SKU-LOW", "vendor_id": "V-001", "unit_price": 100, "product_name": "Low Var"},
            {"sku_id": "SKU-LOW", "vendor_id": "V-002", "unit_price": 102, "product_name": "Low Var"},  # 2% difference
        ]

        high_var = detector.get_high_variance_skus(pricing_data, threshold_cv=0.3)

        assert len(high_var) >= 1
        assert high_var[0]["sku_id"] == "SKU-HIGH"


class TestMarketBenchmarker:
    """Tests for MarketBenchmarker class."""

    @pytest.fixture
    def benchmarker(self):
        return MarketBenchmarker(default_period_days=30, min_sample_size=2)

    @pytest.fixture
    def sample_pricing_data(self):
        return [
            {"sku_id": "SKU-001", "market_id": "MKT-1", "region_name": "East", "unit_price": 100, "vendor_id": "V-001", "currency_code": "USD"},
            {"sku_id": "SKU-001", "market_id": "MKT-1", "region_name": "East", "unit_price": 105, "vendor_id": "V-002", "currency_code": "USD"},
            {"sku_id": "SKU-001", "market_id": "MKT-1", "region_name": "East", "unit_price": 95, "vendor_id": "V-003", "currency_code": "USD"},
            {"sku_id": "SKU-001", "market_id": "MKT-2", "region_name": "West", "unit_price": 120, "vendor_id": "V-001", "currency_code": "USD"},
            {"sku_id": "SKU-001", "market_id": "MKT-2", "region_name": "West", "unit_price": 125, "vendor_id": "V-002", "currency_code": "USD"},
            {"sku_id": "SKU-002", "market_id": "MKT-1", "region_name": "East", "unit_price": 50, "vendor_id": "V-001", "currency_code": "USD"},
            {"sku_id": "SKU-002", "market_id": "MKT-1", "region_name": "East", "unit_price": 55, "vendor_id": "V-002", "currency_code": "USD"},
        ]

    def test_calculate_percentile_rank(self):
        """Test percentile rank calculation."""
        values = [10, 20, 30, 40, 50]

        assert calculate_percentile_rank(10, values) == 0.0  # Lowest
        assert calculate_percentile_rank(30, values) == 40.0  # Middle
        assert calculate_percentile_rank(50, values) == 80.0  # Highest

    def test_calculate_competitiveness_score(self):
        """Test competitiveness score calculation."""
        # Cheapest price should have highest score
        score_low = calculate_competitiveness_score(50, 50, 100, 75)
        score_high = calculate_competitiveness_score(100, 50, 100, 75)

        assert score_low > score_high
        assert score_low > 80  # Very competitive
        assert score_high < 20  # Not competitive

    def test_create_sku_benchmarks(self, benchmarker, sample_pricing_data):
        """Test SKU benchmark creation."""
        benchmarks = benchmarker.create_sku_benchmarks(sample_pricing_data)

        assert len(benchmarks) > 0

        # Find benchmark for SKU-001 in MKT-1
        sku001_mkt1 = next(
            (b for b in benchmarks if b.sku_id == "SKU-001" and b.market_id == "MKT-1"),
            None
        )

        assert sku001_mkt1 is not None
        assert sku001_mkt1.avg_price == 100.0  # (100+105+95)/3
        assert sku001_mkt1.min_price == 95
        assert sku001_mkt1.max_price == 105
        assert sku001_mkt1.sample_size == 3
        assert sku001_mkt1.vendor_count == 3

    def test_compare_vendor_to_benchmark(self, benchmarker, sample_pricing_data):
        """Test vendor comparison to benchmarks."""
        benchmarks = benchmarker.create_sku_benchmarks(sample_pricing_data)

        # Create vendor pricing to compare
        vendor_pricing = [
            {"vendor_id": "V-001", "vendor_name": "Vendor 1", "sku_id": "SKU-001", "market_id": "MKT-1", "unit_price": 100, "product_name": "Product A", "region_name": "East"},
        ]

        comparisons = benchmarker.compare_vendor_to_benchmark(vendor_pricing, benchmarks)

        assert len(comparisons) > 0
        comparison = comparisons[0]
        assert comparison.vendor_id == "V-001"
        assert comparison.vendor_price == 100
        assert comparison.benchmark_avg == 100.0
        assert comparison.price_position == "at_market"

    def test_get_vendor_competitiveness_summary(self, benchmarker, sample_pricing_data):
        """Test vendor competitiveness summary generation."""
        benchmarks = benchmarker.create_sku_benchmarks(sample_pricing_data)

        vendor_pricing = [
            {"vendor_id": "V-001", "vendor_name": "Vendor 1", "sku_id": "SKU-001", "market_id": "MKT-1", "unit_price": 95, "product_name": "Product A", "region_name": "East"},
            {"vendor_id": "V-001", "vendor_name": "Vendor 1", "sku_id": "SKU-002", "market_id": "MKT-1", "unit_price": 50, "product_name": "Product B", "region_name": "East"},
        ]

        comparisons = benchmarker.compare_vendor_to_benchmark(vendor_pricing, benchmarks)
        summary = benchmarker.get_vendor_competitiveness_summary(comparisons)

        assert summary["vendor_id"] == "V-001"
        assert summary["total_skus"] == 2
        assert "avg_competitiveness_score" in summary
        assert "position_breakdown" in summary


class TestEstimateTravelTime:
    """Tests for travel time estimation."""

    def test_zero_distance(self):
        """Zero distance should give zero time."""
        time = estimate_travel_time(0)
        assert time == 0.0

    def test_simple_calculation(self):
        """Test simple time calculation."""
        # 60 km at 60 km/h = 1 hour
        time = estimate_travel_time(60, 60)
        assert abs(time - 1.0) < 0.001

    def test_custom_speed(self):
        """Test with custom speed."""
        # 100 km at 50 km/h = 2 hours
        time = estimate_travel_time(100, 50)
        assert abs(time - 2.0) < 0.001


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
