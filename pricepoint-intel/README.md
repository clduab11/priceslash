# PricePoint Intel - Data Ingestion Pipeline

A comprehensive data ingestion and pricing intelligence system for vendor pricing analysis, geospatial risk assessment, and market benchmarking.

## Features

- **SKU Data Model**: Complete PostgreSQL/SQLite schema for products, vendors, pricing, and geographic markets
- **Data Ingestion**: CSV, Excel, and API-based data import with validation
- **Geospatial Analysis**: Proximity scoring, regional variance detection, and distribution center optimization
- **Market Benchmarking**: Price trend analysis and vendor competitiveness metrics
- **Web UI**: Next.js dashboard with SKU search, pricing heatmap, and vendor relationship matrix

## Quick Start

### Installation

```bash
# Install Python dependencies
cd pricepoint-intel
pip install -r requirements.txt
```

### Initialize Database

```python
from database import init_database

# SQLite (MVP)
init_database()

# PostgreSQL (Production)
init_database("postgresql://user:pass@localhost/pricepoint")
```

### Import Sample Data

```bash
# Generate sample dataset
python data/sample/generate_sample_data.py

# Import via pipeline
python -c "
from ingestion import IngestionPipeline

pipeline = IngestionPipeline()
pipeline.init_database()

# Import all sample data
pipeline.import_vendors_from_csv('data/sample/vendors.csv')
pipeline.import_geographic_markets_from_csv('data/sample/geographic_markets.csv')
pipeline.import_sku_products_from_csv('data/sample/sku_products.csv')
pipeline.import_vendor_pricing_from_csv('data/sample/vendor_pricing.csv')

pipeline.close()
"
```

### Run Tests

```bash
pytest tests/ -v
```

## Project Structure

```
pricepoint-intel/
├── database/
│   ├── __init__.py
│   ├── models.py          # SQLAlchemy ORM models
│   └── schema.sql         # Raw SQL schema
├── ingestion/
│   ├── __init__.py
│   ├── csv_importer.py    # CSV file import
│   ├── excel_importer.py  # Excel file import
│   ├── api_connector.py   # External API connector
│   ├── validator.py       # Data validation
│   └── pipeline.py        # Main ingestion orchestrator
├── geospatial/
│   ├── __init__.py
│   ├── proximity.py       # Distance-based analysis
│   ├── variance.py        # Pricing variance detection
│   └── benchmarking.py    # Market benchmarks
├── tests/
│   ├── test_validator.py
│   └── test_geospatial.py
├── data/
│   └── sample/            # Sample datasets
├── docs/
│   └── API.md             # API documentation
├── requirements.txt
└── README.md
```

## Database Schema

### Core Tables

- **sku_products**: SKU-level product information
- **vendors**: Vendor/supplier details
- **vendor_pricing**: Price records by vendor, SKU, and region
- **geographic_markets**: Regional market definitions
- **distribution_centers**: Vendor distribution locations
- **pricing_history**: Historical price tracking
- **pricing_anomalies**: Detected pricing issues

### Views

- **v_current_pricing**: Current prices with product/vendor details
- **v_vendor_sku_coverage**: Vendor coverage summary
- **v_regional_price_variance**: Regional pricing differences

## Usage Examples

### CSV Import

```python
from ingestion import CSVImporter

importer = CSVImporter()

# Preview file before import
preview = importer.preview("products.csv", "sku_product")
print(f"Detected columns: {preview['headers']}")
print(f"Mapped fields: {preview['column_mapping']}")

# Import with validation
result = importer.import_sku_products("products.csv")
print(f"Success: {result.records_success}/{result.records_total}")
```

### API Integration

```python
from ingestion import APIConnector, create_endpoint_config

connector = APIConnector()
config = create_endpoint_config(
    url="https://api.vendor.com/pricing",
    api_key="your-api-key",
    rate_limit_requests=100
)

result = connector.fetch_vendor_pricing(config, vendor_id="V-001")
print(f"Fetched {result.records_fetched} records")
```

### Geospatial Analysis

```python
from geospatial import ProximityAnalyzer, VarianceDetector

# Analyze vendor coverage
analyzer = ProximityAnalyzer()
coverage = analyzer.analyze_vendor_coverage(market, vendor, distribution_centers)
print(f"Coverage score: {coverage.coverage_score}")

# Detect pricing anomalies
detector = VarianceDetector(z_score_threshold=2.0)
anomalies = detector.detect_anomalies(pricing_data)
for a in anomalies:
    print(f"{a.severity}: {a.description}")
```

## Web UI Components

React/Next.js components in `src/components/pricepoint/`:

- **SKUSearch**: Product search with filtering
- **PricingHeatmap**: Geographic pricing visualization
- **VendorMatrix**: Vendor relationship analysis

```tsx
import { SKUSearch, PricingHeatmap, VendorMatrix } from '@/components/pricepoint';

// In your page
<SKUSearch onSKUSelect={(sku) => console.log(sku)} />
<PricingHeatmap skuId="SKU-001" />
<VendorMatrix />
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/pricepoint/skus | GET | Search SKU products |
| /api/pricepoint/skus | POST | Create new SKU |
| /api/pricepoint/heatmap | GET | Get regional pricing data |
| /api/pricepoint/vendors/matrix | GET | Get vendor relationships |

See [API Documentation](docs/API.md) for full details.

## Configuration

### Environment Variables

```bash
# Database (defaults to SQLite)
DATABASE_URL=postgresql://user:pass@localhost:5432/pricepoint_intel

# Logging
LOG_LEVEL=INFO
```

### PostgreSQL Production Setup

1. Create database:
```sql
CREATE DATABASE pricepoint_intel;
```

2. Set connection URL:
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/pricepoint_intel"
```

3. Initialize schema:
```python
from database import init_database
init_database(os.getenv("DATABASE_URL"))
```

## Sample Data

The sample dataset includes:
- 75 SKU products across 10 categories
- 5 vendors with distribution centers
- 3 geographic regions (Northeast, Midwest, West Coast)
- 450 pricing records with realistic variance

Generate fresh sample data:
```bash
python data/sample/generate_sample_data.py
```

## Testing

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html

# Run specific test file
pytest tests/test_validator.py -v
```

## License

MIT License - See LICENSE file for details.
