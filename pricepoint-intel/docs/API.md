# PricePoint Intel API Documentation

## Overview

PricePoint Intel provides a comprehensive data ingestion pipeline for pricing intelligence. This document covers both the Python ingestion APIs and the Next.js REST endpoints.

## Table of Contents

1. [Python Ingestion API](#python-ingestion-api)
2. [REST API Endpoints](#rest-api-endpoints)
3. [Data Models](#data-models)
4. [Error Handling](#error-handling)
5. [Examples](#examples)

---

## Python Ingestion API

### IngestionPipeline

The main entry point for data ingestion operations.

```python
from pricepoint_intel.ingestion import IngestionPipeline

# Initialize pipeline
pipeline = IngestionPipeline(
    database_url="sqlite:///./pricepoint_intel.db"  # or PostgreSQL URL
)

# Initialize database schema
pipeline.init_database()
```

### CSV Import Methods

#### import_sku_products_from_csv

Import SKU products from a CSV file.

```python
result = pipeline.import_sku_products_from_csv(
    file_path="path/to/products.csv",
    column_mapping=None,  # Optional custom column mapping
    created_by="user@example.com"
)

print(f"Imported: {result.records_imported}")
print(f"Failed: {result.records_failed}")
```

**CSV Column Mappings (auto-detected):**
- `sku_id`: sku_id, sku, product_id, id
- `product_name`: product_name, name, title
- `brand`: brand, brand_name
- `category_id`: category_id, category
- `weight_kg`: weight_kg, weight, wt

#### import_vendors_from_csv

```python
result = pipeline.import_vendors_from_csv(
    file_path="path/to/vendors.csv",
    created_by="admin"
)
```

**CSV Column Mappings:**
- `vendor_id`: vendor_id, id, supplier_id
- `vendor_name`: vendor_name, name, supplier_name
- `vendor_code`: vendor_code, code

#### import_vendor_pricing_from_csv

```python
result = pipeline.import_vendor_pricing_from_csv(
    file_path="path/to/pricing.csv",
    track_history=True  # Enable price history tracking
)
```

**CSV Column Mappings:**
- `vendor_id`: vendor_id, supplier_id
- `sku_id`: sku_id, sku, product_id
- `unit_price`: unit_price, price, cost
- `currency_code`: currency_code, currency
- `market_id`: market_id, market, region_id

#### import_geographic_markets_from_csv

```python
result = pipeline.import_geographic_markets_from_csv(
    file_path="path/to/markets.csv"
)
```

### Excel Import

```python
# Import multiple sheets from Excel workbook
results = pipeline.import_from_excel(
    file_path="path/to/data.xlsx",
    sheet_mapping={
        "Products": "sku_product",
        "Vendors": "vendor",
        "Pricing": "vendor_pricing",
    }
)

for sheet_name, result in results.items():
    print(f"{sheet_name}: {result.records_imported} imported")
```

### API Connector

Fetch data from external pricing APIs.

```python
from pricepoint_intel.ingestion import APIConnector, create_endpoint_config

# Create API configuration
config = create_endpoint_config(
    url="https://api.vendor.com/v1/pricing",
    api_key="your-api-key",
    api_key_header="X-API-Key",
    timeout_seconds=30,
    rate_limit_requests=100,
    rate_limit_window_seconds=60,
    data_path="data.items",  # JSON path to data array
)

# Initialize connector
connector = APIConnector()

# Fetch vendor pricing
result = connector.fetch_vendor_pricing(
    config=config,
    vendor_id="V-001",
    params={"category": "electronics"}
)

print(f"Fetched: {result.records_fetched}")
print(f"Valid: {result.records_valid}")
```

#### Paginated API Fetch

```python
config.pagination_type = "offset"  # or "page", "cursor"
config.pagination_param = "offset"
config.page_size = 100

result = connector.fetch_paginated(
    config=config,
    data_type="vendor_pricing",
    vendor_id="V-001",
    max_pages=10
)
```

### Data Validation

```python
from pricepoint_intel.ingestion import DataValidator

validator = DataValidator()

# Validate SKU product data
result = validator.validate_sku_product({
    "sku_id": "SKU-001",
    "product_name": "Test Product",
    "weight_kg": 1.5,
})

if result.is_valid:
    cleaned_data = result.cleaned_data
else:
    for error in result.errors:
        print(f"Error in {error.field}: {error.message}")
```

#### Custom Validators

```python
def validate_brand(value, data):
    approved_brands = ["BrandA", "BrandB", "BrandC"]
    if value not in approved_brands:
        return f"Brand must be one of: {approved_brands}"
    return None

validator.add_custom_validator("brand", validate_brand)
```

---

## REST API Endpoints

Base URL: `/api/pricepoint`

### SKU Search

#### GET /api/pricepoint/skus

Search and filter SKU products.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| query | string | Search term (name, SKU, brand) |
| category | string | Category ID or name |
| supplier | string | Vendor ID or name |
| region | string | Market ID or region name |
| minPrice | number | Minimum price filter |
| maxPrice | number | Maximum price filter |
| page | number | Page number (default: 1) |
| limit | number | Results per page (default: 20) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "sku_id": "SKU-001",
      "product_name": "Wireless Headphones",
      "brand": "AudioTech",
      "category_name": "Electronics",
      "pricing": [
        {
          "vendor_id": "V-001",
          "vendor_name": "TechSupply Co",
          "unit_price": 89.99,
          "currency_code": "USD",
          "region_name": "Northeast",
          "stock_status": "in_stock"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 75,
    "totalPages": 4
  }
}
```

#### POST /api/pricepoint/skus

Create a new SKU product.

**Request Body:**
```json
{
  "product_name": "New Product",
  "description": "Product description",
  "category_id": "CAT-ELEC",
  "brand": "BrandName",
  "weight_kg": 1.5
}
```

### Pricing Heatmap

#### GET /api/pricepoint/heatmap

Get pricing data aggregated by geographic region.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| sku_id | string | Filter by specific SKU |
| category_id | string | Filter by category |
| vendor_id | string | Filter by vendor |

**Response:**
```json
{
  "success": true,
  "data": {
    "points": [
      {
        "market_id": "MKT-NORTHEAST",
        "region_name": "Northeast",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "avg_price": 45.50,
        "min_price": 32.00,
        "max_price": 89.99,
        "vendor_count": 8,
        "sku_count": 45,
        "price_index": 105,
        "variance_level": "medium"
      }
    ],
    "summary": {
      "total_regions": 3,
      "avg_price_global": 43.50,
      "price_spread_pct": "25.5"
    }
  }
}
```

#### POST /api/pricepoint/heatmap

Compare specific regions.

**Request Body:**
```json
{
  "region_ids": ["MKT-NORTHEAST", "MKT-WEST"],
  "sku_ids": ["SKU-001", "SKU-002"]
}
```

### Vendor Matrix

#### GET /api/pricepoint/vendors/matrix

Get vendor relationship and SKU overlap data.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| vendor_id | string | Filter by specific vendor |
| min_shared_skus | number | Minimum shared SKUs to show relationship |

**Response:**
```json
{
  "success": true,
  "data": {
    "vendors": [
      {
        "vendor_id": "V-001",
        "vendor_name": "TechSupply Co",
        "total_skus": 45,
        "regions_covered": 4,
        "avg_price_index": 98,
        "reliability_score": 92,
        "shared_skus": {
          "V-002": 28,
          "V-003": 15
        },
        "competitiveness": {
          "below_market_pct": 45,
          "at_market_pct": 35,
          "above_market_pct": 20
        }
      }
    ],
    "matrix": {
      "vendors": ["V-001", "V-002", "V-003"],
      "relationships": [
        [45, 28, 15],
        [28, 62, 22],
        [15, 22, 38]
      ]
    },
    "network_metrics": {
      "total_vendors": 5,
      "total_connections": 10,
      "avg_shared_skus": "18.5",
      "network_density": "66.7"
    }
  }
}
```

#### POST /api/pricepoint/vendors/matrix

Compare specific vendors.

**Request Body:**
```json
{
  "vendor_ids": ["V-001", "V-002"]
}
```

---

## Data Models

### SKU Product

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sku_id | string | Yes | Unique SKU identifier |
| product_name | string | Yes | Product name |
| description | string | No | Product description |
| category_id | string | No | Category reference |
| brand | string | No | Brand name |
| manufacturer | string | No | Manufacturer name |
| model_number | string | No | Model number |
| upc_code | string | No | UPC barcode |
| length_cm | number | No | Length in centimeters |
| width_cm | number | No | Width in centimeters |
| height_cm | number | No | Height in centimeters |
| weight_kg | number | No | Weight in kilograms |
| is_active | boolean | No | Active status (default: true) |

### Vendor

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| vendor_id | string | Yes | Unique vendor identifier |
| vendor_name | string | Yes | Vendor display name |
| vendor_code | string | Yes | Unique vendor code |
| contact_email | string | No | Contact email |
| contact_phone | string | No | Contact phone |
| headquarters_latitude | number | No | HQ latitude (-90 to 90) |
| headquarters_longitude | number | No | HQ longitude (-180 to 180) |
| reliability_score | number | No | Score 0-100 |
| payment_terms_days | integer | No | Payment terms (default: 30) |

### Vendor Pricing

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pricing_id | string | Auto | Unique pricing record ID |
| vendor_id | string | Yes | Vendor reference |
| sku_id | string | Yes | SKU reference |
| unit_price | number | Yes | Price (must be >= 0) |
| currency_code | string | No | ISO currency (default: USD) |
| market_id | string | No | Geographic market reference |
| stock_status | enum | No | in_stock, low_stock, out_of_stock, discontinued |
| lead_time_days | integer | No | Delivery lead time |
| min_order_quantity | integer | No | MOQ (default: 1) |
| bulk_discount_percentage | number | No | Bulk discount (0-100) |

### Geographic Market

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| market_id | string | Yes | Unique market identifier |
| region_name | string | Yes | Region display name |
| country_code | string | No | ISO country code (default: US) |
| latitude | number | Yes | Latitude (-90 to 90) |
| longitude | number | Yes | Longitude (-180 to 180) |
| market_size_tier | enum | Yes | tier_1, tier_2, tier_3, tier_4 |
| timezone | string | No | Timezone identifier |
| currency_code | string | No | ISO currency (default: USD) |

---

## Error Handling

### Validation Errors

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "unit_price",
      "message": "unit_price must be a positive number",
      "row_index": 42
    }
  ]
}
```

### API Errors

| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

---

## Examples

### Complete Import Workflow

```python
from pricepoint_intel.ingestion import IngestionPipeline

# Initialize
pipeline = IngestionPipeline(
    database_url="postgresql://user:pass@localhost/pricepoint"
)
pipeline.init_database()

# Import vendors first
vendor_result = pipeline.import_vendors_from_csv("vendors.csv")
print(f"Vendors imported: {vendor_result.records_imported}")

# Import geographic markets
market_result = pipeline.import_geographic_markets_from_csv("markets.csv")
print(f"Markets imported: {market_result.records_imported}")

# Import SKU products
sku_result = pipeline.import_sku_products_from_csv("products.csv")
print(f"SKUs imported: {sku_result.records_imported}")

# Import pricing data
pricing_result = pipeline.import_vendor_pricing_from_csv(
    "pricing.csv",
    track_history=True
)
print(f"Pricing records imported: {pricing_result.records_imported}")

# Clean up
pipeline.close()
```

### Geospatial Analysis

```python
from pricepoint_intel.geospatial import (
    ProximityAnalyzer,
    VarianceDetector,
    MarketBenchmarker,
)

# Proximity analysis
analyzer = ProximityAnalyzer(max_distance_km=500)
coverage = analyzer.analyze_vendor_coverage(
    market={"market_id": "MKT-1", "latitude": 40.7, "longitude": -74.0},
    vendor={"vendor_id": "V-001", "vendor_name": "Vendor 1"},
    distribution_centers=[...]
)
print(f"Coverage score: {coverage.coverage_score}")

# Variance detection
detector = VarianceDetector(z_score_threshold=2.0)
anomalies = detector.detect_anomalies(pricing_data)
for anomaly in anomalies[:5]:
    print(f"Anomaly: {anomaly.description}")

# Benchmarking
benchmarker = MarketBenchmarker()
benchmarks = benchmarker.create_sku_benchmarks(pricing_data)
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | Database connection string | sqlite:///./pricepoint_intel.db |
| LOG_LEVEL | Logging level | INFO |

### PostgreSQL Production Setup

```python
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://user:password@localhost:5432/pricepoint_intel"
)

pipeline = IngestionPipeline(database_url=DATABASE_URL)
```

---

## Rate Limiting

API endpoints implement the following rate limits:

- Search endpoints: 100 requests/minute
- Data modification: 20 requests/minute
- Bulk operations: 5 requests/minute

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Timestamp when limit resets
