"""
Distance-based vendor analysis for PricePoint Intel.
Calculates proximity scores to distribution centers.
"""

import math
import logging
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime

logger = logging.getLogger(__name__)

# Earth's radius in kilometers
EARTH_RADIUS_KM = 6371.0


@dataclass
class Coordinate:
    """Geographic coordinate."""
    latitude: float
    longitude: float

    def validate(self) -> bool:
        """Validate coordinate values."""
        return -90 <= self.latitude <= 90 and -180 <= self.longitude <= 180


@dataclass
class ProximityScore:
    """Represents a proximity score to a distribution center."""

    vendor_id: str
    vendor_name: str
    center_id: str
    center_name: str
    market_id: Optional[str]
    distance_km: float
    proximity_score: float  # 0-100, higher is closer
    travel_time_estimate_hours: Optional[float] = None
    shipping_cost_factor: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor_name,
            "center_id": self.center_id,
            "center_name": self.center_name,
            "market_id": self.market_id,
            "distance_km": round(self.distance_km, 2),
            "proximity_score": round(self.proximity_score, 2),
            "travel_time_estimate_hours": (
                round(self.travel_time_estimate_hours, 2)
                if self.travel_time_estimate_hours else None
            ),
            "shipping_cost_factor": (
                round(self.shipping_cost_factor, 3)
                if self.shipping_cost_factor else None
            ),
        }


@dataclass
class VendorCoverage:
    """Vendor coverage analysis for a market."""

    vendor_id: str
    vendor_name: str
    market_id: str
    region_name: str
    nearest_center_distance_km: float
    average_distance_km: float
    coverage_score: float  # 0-100
    center_count: int
    centers: List[ProximityScore] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor_name,
            "market_id": self.market_id,
            "region_name": self.region_name,
            "nearest_center_distance_km": round(self.nearest_center_distance_km, 2),
            "average_distance_km": round(self.average_distance_km, 2),
            "coverage_score": round(self.coverage_score, 2),
            "center_count": self.center_count,
        }


def haversine_distance(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """
    Calculate the great-circle distance between two points on Earth.

    Args:
        lat1, lon1: Latitude and longitude of first point (in degrees)
        lat2, lon2: Latitude and longitude of second point (in degrees)

    Returns:
        Distance in kilometers
    """
    # Convert to radians
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    # Haversine formula
    a = (
        math.sin(delta_lat / 2) ** 2 +
        math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return EARTH_RADIUS_KM * c


def calculate_proximity_score(
    distance_km: float,
    max_distance_km: float = 500.0,
    decay_factor: float = 2.0,
) -> float:
    """
    Calculate a proximity score (0-100) based on distance.
    Uses exponential decay for scoring.

    Args:
        distance_km: Distance in kilometers
        max_distance_km: Distance at which score approaches 0
        decay_factor: Controls how quickly score decays with distance

    Returns:
        Proximity score from 0 to 100
    """
    if distance_km <= 0:
        return 100.0
    if distance_km >= max_distance_km:
        return 0.0

    # Exponential decay
    normalized_distance = distance_km / max_distance_km
    score = 100.0 * math.exp(-decay_factor * normalized_distance)

    return max(0.0, min(100.0, score))


def estimate_travel_time(
    distance_km: float,
    average_speed_kmh: float = 60.0,
) -> float:
    """
    Estimate travel time based on distance.

    Args:
        distance_km: Distance in kilometers
        average_speed_kmh: Average travel speed in km/h

    Returns:
        Estimated travel time in hours
    """
    if distance_km <= 0:
        return 0.0
    return distance_km / average_speed_kmh


def calculate_shipping_cost_factor(
    distance_km: float,
    base_cost_per_km: float = 0.005,
    min_factor: float = 1.0,
) -> float:
    """
    Calculate a shipping cost multiplier based on distance.

    Args:
        distance_km: Distance in kilometers
        base_cost_per_km: Base cost factor per kilometer
        min_factor: Minimum cost factor

    Returns:
        Shipping cost multiplier (1.0 = baseline)
    """
    return min_factor + (distance_km * base_cost_per_km)


class ProximityAnalyzer:
    """
    Analyzes vendor proximity to distribution centers and markets.
    Provides distance-based scoring and coverage analysis.
    """

    def __init__(
        self,
        max_distance_km: float = 500.0,
        decay_factor: float = 2.0,
        average_speed_kmh: float = 60.0,
    ):
        self.max_distance_km = max_distance_km
        self.decay_factor = decay_factor
        self.average_speed_kmh = average_speed_kmh

    def calculate_proximity(
        self,
        market_lat: float,
        market_lon: float,
        center_lat: float,
        center_lon: float,
        vendor_id: str,
        vendor_name: str,
        center_id: str,
        center_name: str,
        market_id: Optional[str] = None,
    ) -> ProximityScore:
        """
        Calculate proximity score between a market and distribution center.

        Args:
            market_lat, market_lon: Market coordinates
            center_lat, center_lon: Distribution center coordinates
            vendor_id: Vendor ID
            vendor_name: Vendor name
            center_id: Distribution center ID
            center_name: Distribution center name
            market_id: Optional market ID

        Returns:
            ProximityScore with distance and score
        """
        distance = haversine_distance(market_lat, market_lon, center_lat, center_lon)
        score = calculate_proximity_score(
            distance, self.max_distance_km, self.decay_factor
        )
        travel_time = estimate_travel_time(distance, self.average_speed_kmh)
        cost_factor = calculate_shipping_cost_factor(distance)

        return ProximityScore(
            vendor_id=vendor_id,
            vendor_name=vendor_name,
            center_id=center_id,
            center_name=center_name,
            market_id=market_id,
            distance_km=distance,
            proximity_score=score,
            travel_time_estimate_hours=travel_time,
            shipping_cost_factor=cost_factor,
        )

    def analyze_vendor_coverage(
        self,
        market: Dict[str, Any],
        vendor: Dict[str, Any],
        distribution_centers: List[Dict[str, Any]],
    ) -> VendorCoverage:
        """
        Analyze a vendor's coverage of a specific market.

        Args:
            market: Market data with latitude, longitude, market_id, region_name
            vendor: Vendor data with vendor_id, vendor_name
            distribution_centers: List of DCs with center_id, center_name, latitude, longitude

        Returns:
            VendorCoverage with coverage analysis
        """
        market_lat = market.get("latitude", 0)
        market_lon = market.get("longitude", 0)
        market_id = market.get("market_id", "")
        region_name = market.get("region_name", "")
        vendor_id = vendor.get("vendor_id", "")
        vendor_name = vendor.get("vendor_name", "")

        proximity_scores = []

        for dc in distribution_centers:
            if dc.get("vendor_id") != vendor_id:
                continue

            score = self.calculate_proximity(
                market_lat=market_lat,
                market_lon=market_lon,
                center_lat=dc.get("latitude", 0),
                center_lon=dc.get("longitude", 0),
                vendor_id=vendor_id,
                vendor_name=vendor_name,
                center_id=dc.get("center_id", ""),
                center_name=dc.get("center_name", ""),
                market_id=market_id,
            )
            proximity_scores.append(score)

        if not proximity_scores:
            return VendorCoverage(
                vendor_id=vendor_id,
                vendor_name=vendor_name,
                market_id=market_id,
                region_name=region_name,
                nearest_center_distance_km=float("inf"),
                average_distance_km=float("inf"),
                coverage_score=0.0,
                center_count=0,
                centers=[],
            )

        # Sort by distance
        proximity_scores.sort(key=lambda x: x.distance_km)

        distances = [ps.distance_km for ps in proximity_scores]
        nearest_distance = min(distances)
        avg_distance = sum(distances) / len(distances)

        # Coverage score: weighted average of proximity scores
        # Nearest center has highest weight
        weights = [1.0 / (i + 1) for i in range(len(proximity_scores))]
        weight_sum = sum(weights)
        weighted_score = sum(
            ps.proximity_score * w
            for ps, w in zip(proximity_scores, weights)
        ) / weight_sum

        return VendorCoverage(
            vendor_id=vendor_id,
            vendor_name=vendor_name,
            market_id=market_id,
            region_name=region_name,
            nearest_center_distance_km=nearest_distance,
            average_distance_km=avg_distance,
            coverage_score=weighted_score,
            center_count=len(proximity_scores),
            centers=proximity_scores,
        )

    def analyze_market_vendors(
        self,
        market: Dict[str, Any],
        vendors: List[Dict[str, Any]],
        distribution_centers: List[Dict[str, Any]],
    ) -> List[VendorCoverage]:
        """
        Analyze all vendors' coverage of a specific market.

        Args:
            market: Market data
            vendors: List of vendor data
            distribution_centers: List of distribution center data

        Returns:
            List of VendorCoverage sorted by coverage score (best first)
        """
        coverages = []

        for vendor in vendors:
            coverage = self.analyze_vendor_coverage(
                market, vendor, distribution_centers
            )
            if coverage.center_count > 0:
                coverages.append(coverage)

        # Sort by coverage score (highest first)
        coverages.sort(key=lambda x: x.coverage_score, reverse=True)

        return coverages

    def find_coverage_gaps(
        self,
        markets: List[Dict[str, Any]],
        vendors: List[Dict[str, Any]],
        distribution_centers: List[Dict[str, Any]],
        min_coverage_score: float = 30.0,
    ) -> List[Dict[str, Any]]:
        """
        Find markets with inadequate vendor coverage.

        Args:
            markets: List of market data
            vendors: List of vendor data
            distribution_centers: List of distribution center data
            min_coverage_score: Minimum acceptable coverage score

        Returns:
            List of coverage gaps with market and vendor details
        """
        gaps = []

        for market in markets:
            market_id = market.get("market_id", "")
            region_name = market.get("region_name", "")

            for vendor in vendors:
                vendor_id = vendor.get("vendor_id", "")
                vendor_name = vendor.get("vendor_name", "")

                coverage = self.analyze_vendor_coverage(
                    market, vendor, distribution_centers
                )

                if coverage.coverage_score < min_coverage_score:
                    gaps.append({
                        "market_id": market_id,
                        "region_name": region_name,
                        "vendor_id": vendor_id,
                        "vendor_name": vendor_name,
                        "coverage_score": coverage.coverage_score,
                        "nearest_center_distance_km": coverage.nearest_center_distance_km,
                        "center_count": coverage.center_count,
                        "gap_severity": (
                            "critical" if coverage.coverage_score < 10 else
                            "high" if coverage.coverage_score < 20 else
                            "medium"
                        ),
                    })

        # Sort by gap severity (worst gaps first)
        gaps.sort(key=lambda x: x["coverage_score"])

        return gaps

    def calculate_optimal_center_locations(
        self,
        markets: List[Dict[str, Any]],
        weights: Optional[Dict[str, float]] = None,
        num_locations: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Suggest optimal distribution center locations to cover markets.
        Uses weighted centroid calculation.

        Args:
            markets: List of market data with latitude, longitude, and optional weights
            weights: Optional dict of market_id to weight (e.g., based on market size)
            num_locations: Number of optimal locations to suggest

        Returns:
            List of suggested locations with coordinates and coverage stats
        """
        if not markets:
            return []

        # Default equal weights
        if weights is None:
            weights = {m.get("market_id", ""): 1.0 for m in markets}

        # Simple k-means style clustering for multiple locations
        # For MVP, we'll use weighted centroid calculation

        suggestions = []

        # Calculate weighted centroid for all markets
        total_weight = sum(weights.get(m.get("market_id", ""), 1.0) for m in markets)

        if total_weight == 0:
            return []

        weighted_lat = sum(
            m.get("latitude", 0) * weights.get(m.get("market_id", ""), 1.0)
            for m in markets
        ) / total_weight

        weighted_lon = sum(
            m.get("longitude", 0) * weights.get(m.get("market_id", ""), 1.0)
            for m in markets
        ) / total_weight

        # Calculate coverage from this point
        total_coverage = 0
        market_coverage = []

        for m in markets:
            distance = haversine_distance(
                weighted_lat, weighted_lon,
                m.get("latitude", 0), m.get("longitude", 0)
            )
            score = calculate_proximity_score(
                distance, self.max_distance_km, self.decay_factor
            )
            total_coverage += score * weights.get(m.get("market_id", ""), 1.0)
            market_coverage.append({
                "market_id": m.get("market_id"),
                "region_name": m.get("region_name"),
                "distance_km": distance,
                "proximity_score": score,
            })

        avg_coverage = total_coverage / total_weight if total_weight > 0 else 0

        suggestions.append({
            "rank": 1,
            "latitude": round(weighted_lat, 6),
            "longitude": round(weighted_lon, 6),
            "average_coverage_score": round(avg_coverage, 2),
            "markets_covered": len([mc for mc in market_coverage if mc["proximity_score"] > 30]),
            "total_markets": len(markets),
        })

        return suggestions
