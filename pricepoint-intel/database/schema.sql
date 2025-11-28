-- PricePoint Intel - SKU Data Model & Schema
-- Supports both PostgreSQL (production) and SQLite (MVP)

-- Enable UUID extension for PostgreSQL
-- For SQLite, UUIDs are stored as TEXT
-- PostgreSQL: CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- GEOGRAPHIC MARKETS TABLE
-- Defines market regions with geospatial data
-- =============================================================================
CREATE TABLE IF NOT EXISTS geographic_markets (
    market_id TEXT PRIMARY KEY,
    region_name TEXT NOT NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'US',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    market_size_tier TEXT CHECK (market_size_tier IN ('tier_1', 'tier_2', 'tier_3', 'tier_4')) NOT NULL,
    timezone TEXT,
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    population_estimate INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_geographic_markets_region ON geographic_markets(region_name);
CREATE INDEX IF NOT EXISTS idx_geographic_markets_country ON geographic_markets(country_code);
CREATE INDEX IF NOT EXISTS idx_geographic_markets_tier ON geographic_markets(market_size_tier);

-- =============================================================================
-- VENDORS TABLE
-- Stores vendor/supplier information
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendors (
    vendor_id TEXT PRIMARY KEY,
    vendor_name TEXT NOT NULL,
    vendor_code TEXT UNIQUE NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    headquarters_address TEXT,
    headquarters_latitude REAL,
    headquarters_longitude REAL,
    payment_terms_days INTEGER DEFAULT 30,
    reliability_score REAL CHECK (reliability_score >= 0 AND reliability_score <= 100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(vendor_name);
CREATE INDEX IF NOT EXISTS idx_vendors_code ON vendors(vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendors_active ON vendors(is_active);

-- =============================================================================
-- DISTRIBUTION CENTERS TABLE
-- Stores distribution center locations for proximity analysis
-- =============================================================================
CREATE TABLE IF NOT EXISTS distribution_centers (
    center_id TEXT PRIMARY KEY,
    center_name TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    address TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    capacity_units INTEGER,
    market_id TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES geographic_markets(market_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_distribution_centers_vendor ON distribution_centers(vendor_id);
CREATE INDEX IF NOT EXISTS idx_distribution_centers_market ON distribution_centers(market_id);

-- =============================================================================
-- PRODUCT CATEGORIES TABLE
-- Hierarchical category structure
-- =============================================================================
CREATE TABLE IF NOT EXISTS product_categories (
    category_id TEXT PRIMARY KEY,
    category_name TEXT NOT NULL,
    parent_category_id TEXT,
    category_level INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_category_id) REFERENCES product_categories(category_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_name ON product_categories(category_name);

-- =============================================================================
-- SKU PRODUCTS TABLE
-- Core product/SKU information
-- =============================================================================
CREATE TABLE IF NOT EXISTS sku_products (
    sku_id TEXT PRIMARY KEY,
    product_name TEXT NOT NULL,
    description TEXT,
    category_id TEXT,

    -- Dimensions (in standard units)
    length_cm REAL,
    width_cm REAL,
    height_cm REAL,
    weight_kg REAL,

    -- Product attributes
    upc_code TEXT,
    ean_code TEXT,
    brand TEXT,
    manufacturer TEXT,
    model_number TEXT,

    -- Status and metadata
    is_active BOOLEAN DEFAULT TRUE,
    is_hazardous BOOLEAN DEFAULT FALSE,
    requires_refrigeration BOOLEAN DEFAULT FALSE,
    shelf_life_days INTEGER,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (category_id) REFERENCES product_categories(category_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sku_products_name ON sku_products(product_name);
CREATE INDEX IF NOT EXISTS idx_sku_products_category ON sku_products(category_id);
CREATE INDEX IF NOT EXISTS idx_sku_products_brand ON sku_products(brand);
CREATE INDEX IF NOT EXISTS idx_sku_products_upc ON sku_products(upc_code);
CREATE INDEX IF NOT EXISTS idx_sku_products_active ON sku_products(is_active);

-- =============================================================================
-- VENDOR PRICING TABLE
-- Tracks pricing from different vendors for each SKU
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendor_pricing (
    pricing_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    sku_id TEXT NOT NULL,

    -- Pricing information
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',
    min_order_quantity INTEGER DEFAULT 1,
    bulk_discount_percentage REAL CHECK (bulk_discount_percentage >= 0 AND bulk_discount_percentage <= 100),
    bulk_discount_threshold INTEGER,

    -- Geographic scope
    market_id TEXT,

    -- Lead time and availability
    lead_time_days INTEGER,
    stock_status TEXT CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'discontinued')) DEFAULT 'in_stock',

    -- Validity period
    effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    effective_until TIMESTAMP,

    -- Metadata
    is_current BOOLEAN DEFAULT TRUE,
    source TEXT CHECK (source IN ('api', 'csv', 'excel', 'manual', 'scrape')) DEFAULT 'manual',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    FOREIGN KEY (sku_id) REFERENCES sku_products(sku_id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES geographic_markets(market_id) ON DELETE SET NULL,

    -- Ensure unique current pricing per vendor/sku/market combination
    UNIQUE (vendor_id, sku_id, market_id, is_current)
);

CREATE INDEX IF NOT EXISTS idx_vendor_pricing_vendor ON vendor_pricing(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_pricing_sku ON vendor_pricing(sku_id);
CREATE INDEX IF NOT EXISTS idx_vendor_pricing_market ON vendor_pricing(market_id);
CREATE INDEX IF NOT EXISTS idx_vendor_pricing_current ON vendor_pricing(is_current);
CREATE INDEX IF NOT EXISTS idx_vendor_pricing_updated ON vendor_pricing(last_updated);

-- =============================================================================
-- PRICING HISTORY TABLE
-- Stores historical pricing data for trend analysis
-- =============================================================================
CREATE TABLE IF NOT EXISTS pricing_history (
    history_id TEXT PRIMARY KEY,
    pricing_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    sku_id TEXT NOT NULL,
    market_id TEXT,

    unit_price REAL NOT NULL,
    currency_code CHAR(3) NOT NULL DEFAULT 'USD',

    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source TEXT CHECK (source IN ('api', 'csv', 'excel', 'manual', 'scrape')) DEFAULT 'manual',

    FOREIGN KEY (pricing_id) REFERENCES vendor_pricing(pricing_id) ON DELETE SET NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    FOREIGN KEY (sku_id) REFERENCES sku_products(sku_id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES geographic_markets(market_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pricing_history_pricing ON pricing_history(pricing_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_sku ON pricing_history(sku_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_vendor ON pricing_history(vendor_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_recorded ON pricing_history(recorded_at);

-- =============================================================================
-- PRICING ANOMALIES TABLE
-- Flags detected pricing anomalies for review
-- =============================================================================
CREATE TABLE IF NOT EXISTS pricing_anomalies (
    anomaly_id TEXT PRIMARY KEY,
    pricing_id TEXT NOT NULL,
    sku_id TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    market_id TEXT,

    anomaly_type TEXT CHECK (anomaly_type IN (
        'price_spike',
        'price_drop',
        'regional_variance',
        'competitor_gap',
        'historical_deviation',
        'currency_mismatch'
    )) NOT NULL,

    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT NULL DEFAULT 'medium',

    expected_price REAL,
    actual_price REAL NOT NULL,
    variance_percentage REAL,
    z_score REAL,

    description TEXT,
    resolution_status TEXT CHECK (resolution_status IN ('open', 'investigating', 'resolved', 'dismissed')) DEFAULT 'open',
    resolved_at TIMESTAMP,
    resolved_by TEXT,
    resolution_notes TEXT,

    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (pricing_id) REFERENCES vendor_pricing(pricing_id) ON DELETE CASCADE,
    FOREIGN KEY (sku_id) REFERENCES sku_products(sku_id) ON DELETE CASCADE,
    FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES geographic_markets(market_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pricing_anomalies_sku ON pricing_anomalies(sku_id);
CREATE INDEX IF NOT EXISTS idx_pricing_anomalies_vendor ON pricing_anomalies(vendor_id);
CREATE INDEX IF NOT EXISTS idx_pricing_anomalies_type ON pricing_anomalies(anomaly_type);
CREATE INDEX IF NOT EXISTS idx_pricing_anomalies_status ON pricing_anomalies(resolution_status);
CREATE INDEX IF NOT EXISTS idx_pricing_anomalies_severity ON pricing_anomalies(severity);

-- =============================================================================
-- MARKET BENCHMARKS TABLE
-- Aggregated pricing benchmarks by region
-- =============================================================================
CREATE TABLE IF NOT EXISTS market_benchmarks (
    benchmark_id TEXT PRIMARY KEY,
    sku_id TEXT NOT NULL,
    market_id TEXT NOT NULL,
    category_id TEXT,

    avg_price REAL NOT NULL,
    min_price REAL NOT NULL,
    max_price REAL NOT NULL,
    median_price REAL,
    std_deviation REAL,
    sample_size INTEGER NOT NULL,

    benchmark_period_start TIMESTAMP NOT NULL,
    benchmark_period_end TIMESTAMP NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (sku_id) REFERENCES sku_products(sku_id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES geographic_markets(market_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES product_categories(category_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_market_benchmarks_sku ON market_benchmarks(sku_id);
CREATE INDEX IF NOT EXISTS idx_market_benchmarks_market ON market_benchmarks(market_id);
CREATE INDEX IF NOT EXISTS idx_market_benchmarks_category ON market_benchmarks(category_id);

-- =============================================================================
-- VENDOR RELATIONSHIPS TABLE
-- Tracks multi-SKU dependencies between vendors
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendor_relationships (
    relationship_id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    related_vendor_id TEXT NOT NULL,
    relationship_type TEXT CHECK (relationship_type IN ('supplier', 'competitor', 'partner', 'subsidiary')) NOT NULL,
    strength_score REAL CHECK (strength_score >= 0 AND strength_score <= 100),
    shared_sku_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,
    FOREIGN KEY (related_vendor_id) REFERENCES vendors(vendor_id) ON DELETE CASCADE,

    CHECK (vendor_id != related_vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_relationships_vendor ON vendor_relationships(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_relationships_related ON vendor_relationships(related_vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_relationships_type ON vendor_relationships(relationship_type);

-- =============================================================================
-- INGESTION LOGS TABLE
-- Tracks data ingestion operations
-- =============================================================================
CREATE TABLE IF NOT EXISTS ingestion_logs (
    log_id TEXT PRIMARY KEY,
    source_type TEXT CHECK (source_type IN ('csv', 'excel', 'api', 'manual')) NOT NULL,
    source_name TEXT NOT NULL,

    status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')) DEFAULT 'pending',

    records_total INTEGER DEFAULT 0,
    records_processed INTEGER DEFAULT 0,
    records_success INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,

    error_messages TEXT,
    warnings TEXT,

    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_ingestion_logs_status ON ingestion_logs(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_source ON ingestion_logs(source_type);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_created ON ingestion_logs(created_at);

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- Current pricing with vendor and product details
CREATE VIEW IF NOT EXISTS v_current_pricing AS
SELECT
    vp.pricing_id,
    vp.sku_id,
    sp.product_name,
    sp.brand,
    pc.category_name,
    vp.vendor_id,
    v.vendor_name,
    vp.unit_price,
    vp.currency_code,
    vp.market_id,
    gm.region_name,
    gm.country_code,
    vp.stock_status,
    vp.lead_time_days,
    vp.last_updated
FROM vendor_pricing vp
JOIN sku_products sp ON vp.sku_id = sp.sku_id
JOIN vendors v ON vp.vendor_id = v.vendor_id
LEFT JOIN product_categories pc ON sp.category_id = pc.category_id
LEFT JOIN geographic_markets gm ON vp.market_id = gm.market_id
WHERE vp.is_current = TRUE;

-- Vendor SKU coverage summary
CREATE VIEW IF NOT EXISTS v_vendor_sku_coverage AS
SELECT
    v.vendor_id,
    v.vendor_name,
    COUNT(DISTINCT vp.sku_id) as sku_count,
    COUNT(DISTINCT vp.market_id) as market_count,
    AVG(vp.unit_price) as avg_price,
    MIN(vp.unit_price) as min_price,
    MAX(vp.unit_price) as max_price
FROM vendors v
LEFT JOIN vendor_pricing vp ON v.vendor_id = vp.vendor_id AND vp.is_current = TRUE
WHERE v.is_active = TRUE
GROUP BY v.vendor_id, v.vendor_name;

-- Regional pricing variance
CREATE VIEW IF NOT EXISTS v_regional_price_variance AS
SELECT
    sp.sku_id,
    sp.product_name,
    gm.market_id,
    gm.region_name,
    COUNT(vp.pricing_id) as vendor_count,
    AVG(vp.unit_price) as avg_price,
    MIN(vp.unit_price) as min_price,
    MAX(vp.unit_price) as max_price,
    MAX(vp.unit_price) - MIN(vp.unit_price) as price_range,
    CASE
        WHEN AVG(vp.unit_price) > 0 THEN
            ((MAX(vp.unit_price) - MIN(vp.unit_price)) / AVG(vp.unit_price)) * 100
        ELSE 0
    END as variance_percentage
FROM sku_products sp
JOIN vendor_pricing vp ON sp.sku_id = vp.sku_id AND vp.is_current = TRUE
JOIN geographic_markets gm ON vp.market_id = gm.market_id
GROUP BY sp.sku_id, sp.product_name, gm.market_id, gm.region_name;
