"""
PricePoint Intel - SQLAlchemy ORM Models
Supports both SQLite (MVP) and PostgreSQL (production)
"""

import os
from datetime import datetime
from typing import Optional, List
from decimal import Decimal
import uuid

from sqlalchemy import (
    create_engine,
    Column,
    String,
    Text,
    Float,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    CheckConstraint,
    UniqueConstraint,
    Index,
    Enum as SQLEnum,
)
from sqlalchemy.orm import (
    declarative_base,
    relationship,
    sessionmaker,
    Session,
)
from sqlalchemy.sql import func

# Configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./pricepoint_intel.db"
)

# PostgreSQL flag - set to True in production
USE_POSTGRESQL = DATABASE_URL.startswith("postgresql")

Base = declarative_base()


def generate_uuid() -> str:
    """Generate a UUID string for primary keys."""
    return str(uuid.uuid4())


# =============================================================================
# ENUMS
# =============================================================================

MARKET_SIZE_TIERS = ("tier_1", "tier_2", "tier_3", "tier_4")
STOCK_STATUSES = ("in_stock", "low_stock", "out_of_stock", "discontinued")
SOURCE_TYPES = ("api", "csv", "excel", "manual", "scrape")
ANOMALY_TYPES = (
    "price_spike",
    "price_drop",
    "regional_variance",
    "competitor_gap",
    "historical_deviation",
    "currency_mismatch",
)
SEVERITY_LEVELS = ("low", "medium", "high", "critical")
RESOLUTION_STATUSES = ("open", "investigating", "resolved", "dismissed")
INGESTION_STATUSES = ("pending", "processing", "completed", "failed", "partial")
RELATIONSHIP_TYPES = ("supplier", "competitor", "partner", "subsidiary")


# =============================================================================
# MODELS
# =============================================================================


class GeographicMarket(Base):
    """Geographic market regions with geospatial data."""

    __tablename__ = "geographic_markets"

    market_id = Column(String(36), primary_key=True, default=generate_uuid)
    region_name = Column(String(255), nullable=False)
    country_code = Column(String(2), nullable=False, default="US")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    market_size_tier = Column(String(10), nullable=False)
    timezone = Column(String(50))
    currency_code = Column(String(3), nullable=False, default="USD")
    population_estimate = Column(Integer)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    distribution_centers = relationship(
        "DistributionCenter",
        back_populates="market"
    )
    vendor_pricing = relationship("VendorPricing", back_populates="market")
    benchmarks = relationship("MarketBenchmark", back_populates="market")

    __table_args__ = (
        CheckConstraint(
            "market_size_tier IN ('tier_1', 'tier_2', 'tier_3', 'tier_4')",
            name="ck_market_size_tier"
        ),
        Index("idx_geographic_markets_region", "region_name"),
        Index("idx_geographic_markets_country", "country_code"),
    )

    def to_dict(self) -> dict:
        return {
            "market_id": self.market_id,
            "region_name": self.region_name,
            "country_code": self.country_code,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "market_size_tier": self.market_size_tier,
            "timezone": self.timezone,
            "currency_code": self.currency_code,
            "population_estimate": self.population_estimate,
        }


class Vendor(Base):
    """Vendor/supplier information."""

    __tablename__ = "vendors"

    vendor_id = Column(String(36), primary_key=True, default=generate_uuid)
    vendor_name = Column(String(255), nullable=False)
    vendor_code = Column(String(50), unique=True, nullable=False)
    contact_email = Column(String(255))
    contact_phone = Column(String(50))
    headquarters_address = Column(Text)
    headquarters_latitude = Column(Float)
    headquarters_longitude = Column(Float)
    payment_terms_days = Column(Integer, default=30)
    reliability_score = Column(Float)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    distribution_centers = relationship(
        "DistributionCenter",
        back_populates="vendor"
    )
    pricing = relationship("VendorPricing", back_populates="vendor")
    anomalies = relationship("PricingAnomaly", back_populates="vendor")

    __table_args__ = (
        CheckConstraint(
            "reliability_score IS NULL OR "
            "(reliability_score >= 0 AND reliability_score <= 100)",
            name="ck_vendor_reliability"
        ),
        Index("idx_vendors_name", "vendor_name"),
        Index("idx_vendors_code", "vendor_code"),
    )

    def to_dict(self) -> dict:
        return {
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor_name,
            "vendor_code": self.vendor_code,
            "contact_email": self.contact_email,
            "contact_phone": self.contact_phone,
            "headquarters_address": self.headquarters_address,
            "headquarters_latitude": self.headquarters_latitude,
            "headquarters_longitude": self.headquarters_longitude,
            "payment_terms_days": self.payment_terms_days,
            "reliability_score": self.reliability_score,
            "is_active": self.is_active,
        }


class DistributionCenter(Base):
    """Distribution center locations for proximity analysis."""

    __tablename__ = "distribution_centers"

    center_id = Column(String(36), primary_key=True, default=generate_uuid)
    center_name = Column(String(255), nullable=False)
    vendor_id = Column(
        String(36),
        ForeignKey("vendors.vendor_id", ondelete="CASCADE"),
        nullable=False
    )
    address = Column(Text)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    capacity_units = Column(Integer)
    market_id = Column(
        String(36),
        ForeignKey("geographic_markets.market_id", ondelete="SET NULL")
    )
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    vendor = relationship("Vendor", back_populates="distribution_centers")
    market = relationship(
        "GeographicMarket",
        back_populates="distribution_centers"
    )

    def to_dict(self) -> dict:
        return {
            "center_id": self.center_id,
            "center_name": self.center_name,
            "vendor_id": self.vendor_id,
            "address": self.address,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "capacity_units": self.capacity_units,
            "market_id": self.market_id,
            "is_active": self.is_active,
        }


class ProductCategory(Base):
    """Hierarchical category structure."""

    __tablename__ = "product_categories"

    category_id = Column(String(36), primary_key=True, default=generate_uuid)
    category_name = Column(String(255), nullable=False)
    parent_category_id = Column(
        String(36),
        ForeignKey("product_categories.category_id", ondelete="SET NULL")
    )
    category_level = Column(Integer, nullable=False, default=1)
    description = Column(Text)
    created_at = Column(DateTime, default=func.now())

    # Self-referential relationship
    parent = relationship(
        "ProductCategory",
        remote_side=[category_id],
        backref="subcategories"
    )
    products = relationship("SKUProduct", back_populates="category")

    def to_dict(self) -> dict:
        return {
            "category_id": self.category_id,
            "category_name": self.category_name,
            "parent_category_id": self.parent_category_id,
            "category_level": self.category_level,
            "description": self.description,
        }


class SKUProduct(Base):
    """Core product/SKU information."""

    __tablename__ = "sku_products"

    sku_id = Column(String(36), primary_key=True, default=generate_uuid)
    product_name = Column(String(500), nullable=False)
    description = Column(Text)
    category_id = Column(
        String(36),
        ForeignKey("product_categories.category_id", ondelete="SET NULL")
    )

    # Dimensions
    length_cm = Column(Float)
    width_cm = Column(Float)
    height_cm = Column(Float)
    weight_kg = Column(Float)

    # Product attributes
    upc_code = Column(String(20))
    ean_code = Column(String(20))
    brand = Column(String(255))
    manufacturer = Column(String(255))
    model_number = Column(String(100))

    # Status
    is_active = Column(Boolean, default=True)
    is_hazardous = Column(Boolean, default=False)
    requires_refrigeration = Column(Boolean, default=False)
    shelf_life_days = Column(Integer)

    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    category = relationship("ProductCategory", back_populates="products")
    pricing = relationship("VendorPricing", back_populates="product")
    anomalies = relationship("PricingAnomaly", back_populates="product")
    benchmarks = relationship("MarketBenchmark", back_populates="product")

    __table_args__ = (
        Index("idx_sku_products_name", "product_name"),
        Index("idx_sku_products_brand", "brand"),
        Index("idx_sku_products_upc", "upc_code"),
    )

    def to_dict(self) -> dict:
        return {
            "sku_id": self.sku_id,
            "product_name": self.product_name,
            "description": self.description,
            "category_id": self.category_id,
            "category_name": self.category.category_name if self.category else None,
            "length_cm": self.length_cm,
            "width_cm": self.width_cm,
            "height_cm": self.height_cm,
            "weight_kg": self.weight_kg,
            "upc_code": self.upc_code,
            "ean_code": self.ean_code,
            "brand": self.brand,
            "manufacturer": self.manufacturer,
            "model_number": self.model_number,
            "is_active": self.is_active,
        }


class VendorPricing(Base):
    """Tracks pricing from different vendors for each SKU."""

    __tablename__ = "vendor_pricing"

    pricing_id = Column(String(36), primary_key=True, default=generate_uuid)
    vendor_id = Column(
        String(36),
        ForeignKey("vendors.vendor_id", ondelete="CASCADE"),
        nullable=False
    )
    sku_id = Column(
        String(36),
        ForeignKey("sku_products.sku_id", ondelete="CASCADE"),
        nullable=False
    )

    # Pricing
    unit_price = Column(Float, nullable=False)
    currency_code = Column(String(3), nullable=False, default="USD")
    min_order_quantity = Column(Integer, default=1)
    bulk_discount_percentage = Column(Float)
    bulk_discount_threshold = Column(Integer)

    # Geographic scope
    market_id = Column(
        String(36),
        ForeignKey("geographic_markets.market_id", ondelete="SET NULL")
    )

    # Availability
    lead_time_days = Column(Integer)
    stock_status = Column(String(20), default="in_stock")

    # Validity
    effective_from = Column(DateTime, default=func.now())
    effective_until = Column(DateTime)

    # Metadata
    is_current = Column(Boolean, default=True)
    source = Column(String(20), default="manual")
    last_updated = Column(DateTime, default=func.now(), onupdate=func.now())
    created_at = Column(DateTime, default=func.now())

    # Relationships
    vendor = relationship("Vendor", back_populates="pricing")
    product = relationship("SKUProduct", back_populates="pricing")
    market = relationship("GeographicMarket", back_populates="vendor_pricing")
    history = relationship("PricingHistory", back_populates="pricing")

    __table_args__ = (
        CheckConstraint("unit_price >= 0", name="ck_pricing_positive"),
        CheckConstraint(
            "stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'discontinued')",
            name="ck_stock_status"
        ),
        Index("idx_vendor_pricing_vendor", "vendor_id"),
        Index("idx_vendor_pricing_sku", "sku_id"),
        Index("idx_vendor_pricing_market", "market_id"),
        Index("idx_vendor_pricing_current", "is_current"),
    )

    def to_dict(self) -> dict:
        return {
            "pricing_id": self.pricing_id,
            "vendor_id": self.vendor_id,
            "vendor_name": self.vendor.vendor_name if self.vendor else None,
            "sku_id": self.sku_id,
            "product_name": self.product.product_name if self.product else None,
            "unit_price": self.unit_price,
            "currency_code": self.currency_code,
            "market_id": self.market_id,
            "region_name": self.market.region_name if self.market else None,
            "stock_status": self.stock_status,
            "lead_time_days": self.lead_time_days,
            "is_current": self.is_current,
            "source": self.source,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }


class PricingHistory(Base):
    """Historical pricing data for trend analysis."""

    __tablename__ = "pricing_history"

    history_id = Column(String(36), primary_key=True, default=generate_uuid)
    pricing_id = Column(
        String(36),
        ForeignKey("vendor_pricing.pricing_id", ondelete="SET NULL")
    )
    vendor_id = Column(
        String(36),
        ForeignKey("vendors.vendor_id", ondelete="CASCADE"),
        nullable=False
    )
    sku_id = Column(
        String(36),
        ForeignKey("sku_products.sku_id", ondelete="CASCADE"),
        nullable=False
    )
    market_id = Column(
        String(36),
        ForeignKey("geographic_markets.market_id", ondelete="SET NULL")
    )

    unit_price = Column(Float, nullable=False)
    currency_code = Column(String(3), nullable=False, default="USD")

    recorded_at = Column(DateTime, default=func.now())
    source = Column(String(20), default="manual")

    # Relationships
    pricing = relationship("VendorPricing", back_populates="history")

    __table_args__ = (
        Index("idx_pricing_history_sku", "sku_id"),
        Index("idx_pricing_history_recorded", "recorded_at"),
    )


class PricingAnomaly(Base):
    """Detected pricing anomalies for review."""

    __tablename__ = "pricing_anomalies"

    anomaly_id = Column(String(36), primary_key=True, default=generate_uuid)
    pricing_id = Column(
        String(36),
        ForeignKey("vendor_pricing.pricing_id", ondelete="CASCADE"),
        nullable=False
    )
    sku_id = Column(
        String(36),
        ForeignKey("sku_products.sku_id", ondelete="CASCADE"),
        nullable=False
    )
    vendor_id = Column(
        String(36),
        ForeignKey("vendors.vendor_id", ondelete="CASCADE"),
        nullable=False
    )
    market_id = Column(
        String(36),
        ForeignKey("geographic_markets.market_id", ondelete="SET NULL")
    )

    anomaly_type = Column(String(30), nullable=False)
    severity = Column(String(10), nullable=False, default="medium")

    expected_price = Column(Float)
    actual_price = Column(Float, nullable=False)
    variance_percentage = Column(Float)
    z_score = Column(Float)

    description = Column(Text)
    resolution_status = Column(String(20), default="open")
    resolved_at = Column(DateTime)
    resolved_by = Column(String(255))
    resolution_notes = Column(Text)

    detected_at = Column(DateTime, default=func.now())
    created_at = Column(DateTime, default=func.now())

    # Relationships
    product = relationship("SKUProduct", back_populates="anomalies")
    vendor = relationship("Vendor", back_populates="anomalies")

    __table_args__ = (
        CheckConstraint(
            "anomaly_type IN ('price_spike', 'price_drop', 'regional_variance', "
            "'competitor_gap', 'historical_deviation', 'currency_mismatch')",
            name="ck_anomaly_type"
        ),
        CheckConstraint(
            "severity IN ('low', 'medium', 'high', 'critical')",
            name="ck_anomaly_severity"
        ),
        Index("idx_pricing_anomalies_type", "anomaly_type"),
        Index("idx_pricing_anomalies_status", "resolution_status"),
    )

    def to_dict(self) -> dict:
        return {
            "anomaly_id": self.anomaly_id,
            "pricing_id": self.pricing_id,
            "sku_id": self.sku_id,
            "vendor_id": self.vendor_id,
            "market_id": self.market_id,
            "anomaly_type": self.anomaly_type,
            "severity": self.severity,
            "expected_price": self.expected_price,
            "actual_price": self.actual_price,
            "variance_percentage": self.variance_percentage,
            "z_score": self.z_score,
            "description": self.description,
            "resolution_status": self.resolution_status,
            "detected_at": self.detected_at.isoformat() if self.detected_at else None,
        }


class MarketBenchmark(Base):
    """Aggregated pricing benchmarks by region."""

    __tablename__ = "market_benchmarks"

    benchmark_id = Column(String(36), primary_key=True, default=generate_uuid)
    sku_id = Column(
        String(36),
        ForeignKey("sku_products.sku_id", ondelete="CASCADE"),
        nullable=False
    )
    market_id = Column(
        String(36),
        ForeignKey("geographic_markets.market_id", ondelete="CASCADE"),
        nullable=False
    )
    category_id = Column(
        String(36),
        ForeignKey("product_categories.category_id", ondelete="SET NULL")
    )

    avg_price = Column(Float, nullable=False)
    min_price = Column(Float, nullable=False)
    max_price = Column(Float, nullable=False)
    median_price = Column(Float)
    std_deviation = Column(Float)
    sample_size = Column(Integer, nullable=False)

    benchmark_period_start = Column(DateTime, nullable=False)
    benchmark_period_end = Column(DateTime, nullable=False)

    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    product = relationship("SKUProduct", back_populates="benchmarks")
    market = relationship("GeographicMarket", back_populates="benchmarks")

    def to_dict(self) -> dict:
        return {
            "benchmark_id": self.benchmark_id,
            "sku_id": self.sku_id,
            "market_id": self.market_id,
            "avg_price": self.avg_price,
            "min_price": self.min_price,
            "max_price": self.max_price,
            "median_price": self.median_price,
            "std_deviation": self.std_deviation,
            "sample_size": self.sample_size,
        }


class VendorRelationship(Base):
    """Tracks multi-SKU dependencies between vendors."""

    __tablename__ = "vendor_relationships"

    relationship_id = Column(String(36), primary_key=True, default=generate_uuid)
    vendor_id = Column(
        String(36),
        ForeignKey("vendors.vendor_id", ondelete="CASCADE"),
        nullable=False
    )
    related_vendor_id = Column(
        String(36),
        ForeignKey("vendors.vendor_id", ondelete="CASCADE"),
        nullable=False
    )
    relationship_type = Column(String(20), nullable=False)
    strength_score = Column(Float)
    shared_sku_count = Column(Integer, default=0)
    notes = Column(Text)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "relationship_type IN ('supplier', 'competitor', 'partner', 'subsidiary')",
            name="ck_relationship_type"
        ),
        CheckConstraint("vendor_id != related_vendor_id", name="ck_no_self_relation"),
    )


class IngestionLog(Base):
    """Tracks data ingestion operations."""

    __tablename__ = "ingestion_logs"

    log_id = Column(String(36), primary_key=True, default=generate_uuid)
    source_type = Column(String(20), nullable=False)
    source_name = Column(String(500), nullable=False)

    status = Column(String(20), default="pending")

    records_total = Column(Integer, default=0)
    records_processed = Column(Integer, default=0)
    records_success = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    records_skipped = Column(Integer, default=0)

    error_messages = Column(Text)
    warnings = Column(Text)

    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=func.now())

    created_by = Column(String(255))

    def to_dict(self) -> dict:
        return {
            "log_id": self.log_id,
            "source_type": self.source_type,
            "source_name": self.source_name,
            "status": self.status,
            "records_total": self.records_total,
            "records_processed": self.records_processed,
            "records_success": self.records_success,
            "records_failed": self.records_failed,
            "records_skipped": self.records_skipped,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


# =============================================================================
# DATABASE INITIALIZATION
# =============================================================================


def get_engine(database_url: Optional[str] = None):
    """Create database engine with appropriate settings."""
    url = database_url or DATABASE_URL

    if url.startswith("postgresql"):
        # PostgreSQL production settings
        return create_engine(
            url,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            echo=False,
        )
    else:
        # SQLite MVP settings
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            echo=False,
        )


def get_session(engine=None) -> Session:
    """Create a new database session."""
    if engine is None:
        engine = get_engine()
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


def init_database(database_url: Optional[str] = None):
    """Initialize database tables."""
    engine = get_engine(database_url)
    Base.metadata.create_all(bind=engine)
    return engine


if __name__ == "__main__":
    # Initialize database when run directly
    print(f"Initializing database: {DATABASE_URL}")
    engine = init_database()
    print("Database initialized successfully!")
