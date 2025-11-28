"""
Sample data generator for PricePoint Intel MVP.
Generates 75 SKUs across 5 vendors and 3 regions.
"""

import csv
import json
import random
import uuid
from datetime import datetime, timedelta
from pathlib import Path


# Configuration
NUM_SKUS = 75
NUM_VENDORS = 5
NUM_REGIONS = 3

# Output directory
OUTPUT_DIR = Path(__file__).parent


# =============================================================================
# Sample Data Definitions
# =============================================================================

CATEGORIES = [
    {"id": "CAT-ELEC", "name": "Electronics", "parent": None, "level": 1},
    {"id": "CAT-ELEC-AUDIO", "name": "Audio Equipment", "parent": "CAT-ELEC", "level": 2},
    {"id": "CAT-ELEC-COMP", "name": "Computer Accessories", "parent": "CAT-ELEC", "level": 2},
    {"id": "CAT-ELEC-MOBILE", "name": "Mobile Accessories", "parent": "CAT-ELEC", "level": 2},
    {"id": "CAT-HOME", "name": "Home & Kitchen", "parent": None, "level": 1},
    {"id": "CAT-HOME-COOK", "name": "Cookware", "parent": "CAT-HOME", "level": 2},
    {"id": "CAT-HOME-STORAGE", "name": "Storage & Organization", "parent": "CAT-HOME", "level": 2},
    {"id": "CAT-HEALTH", "name": "Health & Personal Care", "parent": None, "level": 1},
    {"id": "CAT-HEALTH-VIT", "name": "Vitamins & Supplements", "parent": "CAT-HEALTH", "level": 2},
    {"id": "CAT-OFFICE", "name": "Office Supplies", "parent": None, "level": 1},
]

BRANDS = [
    "TechPro", "AudioMax", "HomeStyle", "VitaPlus", "OfficeMaster",
    "SmartLife", "EcoGreen", "PremiumChoice", "ValueBrand", "QualityFirst",
    "GlobalTech", "NaturalWay", "ModernHome", "ProSeries", "EliteChoice",
]

VENDORS = [
    {
        "vendor_id": "V-001",
        "vendor_name": "TechSupply Co",
        "vendor_code": "TSC001",
        "contact_email": "orders@techsupply.com",
        "contact_phone": "+1-555-0101",
        "headquarters_address": "123 Tech Blvd, San Francisco, CA 94105",
        "headquarters_latitude": 37.7749,
        "headquarters_longitude": -122.4194,
        "payment_terms_days": 30,
        "reliability_score": 92,
    },
    {
        "vendor_id": "V-002",
        "vendor_name": "Global Electronics Dist",
        "vendor_code": "GED002",
        "contact_email": "sales@globalelec.com",
        "contact_phone": "+1-555-0102",
        "headquarters_address": "456 Commerce Way, Los Angeles, CA 90015",
        "headquarters_latitude": 34.0522,
        "headquarters_longitude": -118.2437,
        "payment_terms_days": 45,
        "reliability_score": 88,
    },
    {
        "vendor_id": "V-003",
        "vendor_name": "Midwest Wholesale Hub",
        "vendor_code": "MWH003",
        "contact_email": "info@midwestwholesale.com",
        "contact_phone": "+1-555-0103",
        "headquarters_address": "789 Industrial Park, Chicago, IL 60601",
        "headquarters_latitude": 41.8781,
        "headquarters_longitude": -87.6298,
        "payment_terms_days": 30,
        "reliability_score": 95,
    },
    {
        "vendor_id": "V-004",
        "vendor_name": "Eastern Trade Partners",
        "vendor_code": "ETP004",
        "contact_email": "orders@easterntrading.com",
        "contact_phone": "+1-555-0104",
        "headquarters_address": "321 Harbor Street, New York, NY 10001",
        "headquarters_latitude": 40.7128,
        "headquarters_longitude": -74.0060,
        "payment_terms_days": 60,
        "reliability_score": 85,
    },
    {
        "vendor_id": "V-005",
        "vendor_name": "Southern Supply Chain",
        "vendor_code": "SSC005",
        "contact_email": "sales@southernsupply.com",
        "contact_phone": "+1-555-0105",
        "headquarters_address": "555 Distribution Way, Atlanta, GA 30301",
        "headquarters_latitude": 33.7490,
        "headquarters_longitude": -84.3880,
        "payment_terms_days": 30,
        "reliability_score": 90,
    },
]

REGIONS = [
    {
        "market_id": "MKT-NORTHEAST",
        "region_name": "Northeast",
        "country_code": "US",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "market_size_tier": "tier_1",
        "timezone": "America/New_York",
        "currency_code": "USD",
        "population_estimate": 55000000,
    },
    {
        "market_id": "MKT-MIDWEST",
        "region_name": "Midwest",
        "country_code": "US",
        "latitude": 41.8781,
        "longitude": -87.6298,
        "market_size_tier": "tier_2",
        "timezone": "America/Chicago",
        "currency_code": "USD",
        "population_estimate": 68000000,
    },
    {
        "market_id": "MKT-WEST",
        "region_name": "West Coast",
        "country_code": "US",
        "latitude": 34.0522,
        "longitude": -118.2437,
        "market_size_tier": "tier_1",
        "timezone": "America/Los_Angeles",
        "currency_code": "USD",
        "population_estimate": 53000000,
    },
]

DISTRIBUTION_CENTERS = [
    # V-001 Centers
    {"center_id": "DC-001-SF", "center_name": "SF Distribution Hub", "vendor_id": "V-001", "latitude": 37.7749, "longitude": -122.4194, "market_id": "MKT-WEST"},
    {"center_id": "DC-001-CHI", "center_name": "Chicago Warehouse", "vendor_id": "V-001", "latitude": 41.8781, "longitude": -87.6298, "market_id": "MKT-MIDWEST"},
    # V-002 Centers
    {"center_id": "DC-002-LA", "center_name": "LA Mega Center", "vendor_id": "V-002", "latitude": 34.0522, "longitude": -118.2437, "market_id": "MKT-WEST"},
    {"center_id": "DC-002-PHX", "center_name": "Phoenix Hub", "vendor_id": "V-002", "latitude": 33.4484, "longitude": -112.0740, "market_id": "MKT-WEST"},
    # V-003 Centers
    {"center_id": "DC-003-CHI", "center_name": "Midwest Main DC", "vendor_id": "V-003", "latitude": 41.8781, "longitude": -87.6298, "market_id": "MKT-MIDWEST"},
    {"center_id": "DC-003-DET", "center_name": "Detroit Warehouse", "vendor_id": "V-003", "latitude": 42.3314, "longitude": -83.0458, "market_id": "MKT-MIDWEST"},
    # V-004 Centers
    {"center_id": "DC-004-NYC", "center_name": "NYC Distribution", "vendor_id": "V-004", "latitude": 40.7128, "longitude": -74.0060, "market_id": "MKT-NORTHEAST"},
    {"center_id": "DC-004-BOS", "center_name": "Boston Facility", "vendor_id": "V-004", "latitude": 42.3601, "longitude": -71.0589, "market_id": "MKT-NORTHEAST"},
    # V-005 Centers
    {"center_id": "DC-005-ATL", "center_name": "Atlanta Hub", "vendor_id": "V-005", "latitude": 33.7490, "longitude": -84.3880, "market_id": "MKT-NORTHEAST"},
    {"center_id": "DC-005-MIA", "center_name": "Miami Warehouse", "vendor_id": "V-005", "latitude": 25.7617, "longitude": -80.1918, "market_id": "MKT-NORTHEAST"},
]

PRODUCT_TEMPLATES = [
    # Electronics - Audio
    {"name_template": "{brand} Wireless Headphones {model}", "category_id": "CAT-ELEC-AUDIO", "base_price": 89.99, "weight_range": (0.2, 0.5)},
    {"name_template": "{brand} Bluetooth Speaker {model}", "category_id": "CAT-ELEC-AUDIO", "base_price": 49.99, "weight_range": (0.5, 1.5)},
    {"name_template": "{brand} Earbuds Pro {model}", "category_id": "CAT-ELEC-AUDIO", "base_price": 129.99, "weight_range": (0.05, 0.15)},
    {"name_template": "{brand} Soundbar System {model}", "category_id": "CAT-ELEC-AUDIO", "base_price": 199.99, "weight_range": (3.0, 5.0)},

    # Electronics - Computer
    {"name_template": "{brand} USB-C Hub {model}", "category_id": "CAT-ELEC-COMP", "base_price": 34.99, "weight_range": (0.1, 0.3)},
    {"name_template": "{brand} Wireless Mouse {model}", "category_id": "CAT-ELEC-COMP", "base_price": 29.99, "weight_range": (0.08, 0.15)},
    {"name_template": "{brand} Mechanical Keyboard {model}", "category_id": "CAT-ELEC-COMP", "base_price": 79.99, "weight_range": (0.8, 1.2)},
    {"name_template": "{brand} Monitor Stand {model}", "category_id": "CAT-ELEC-COMP", "base_price": 44.99, "weight_range": (2.0, 4.0)},
    {"name_template": "{brand} Webcam HD {model}", "category_id": "CAT-ELEC-COMP", "base_price": 69.99, "weight_range": (0.15, 0.3)},

    # Electronics - Mobile
    {"name_template": "{brand} Phone Case {model}", "category_id": "CAT-ELEC-MOBILE", "base_price": 19.99, "weight_range": (0.03, 0.1)},
    {"name_template": "{brand} Wireless Charger {model}", "category_id": "CAT-ELEC-MOBILE", "base_price": 24.99, "weight_range": (0.15, 0.3)},
    {"name_template": "{brand} Power Bank 20000mAh {model}", "category_id": "CAT-ELEC-MOBILE", "base_price": 39.99, "weight_range": (0.3, 0.5)},
    {"name_template": "{brand} Car Phone Mount {model}", "category_id": "CAT-ELEC-MOBILE", "base_price": 14.99, "weight_range": (0.1, 0.2)},

    # Home & Kitchen - Cookware
    {"name_template": "{brand} Non-Stick Pan Set {model}", "category_id": "CAT-HOME-COOK", "base_price": 59.99, "weight_range": (2.0, 4.0)},
    {"name_template": "{brand} Knife Set {model}", "category_id": "CAT-HOME-COOK", "base_price": 89.99, "weight_range": (1.5, 3.0)},
    {"name_template": "{brand} Cutting Board Set {model}", "category_id": "CAT-HOME-COOK", "base_price": 29.99, "weight_range": (1.0, 2.0)},
    {"name_template": "{brand} Food Storage Containers {model}", "category_id": "CAT-HOME-COOK", "base_price": 34.99, "weight_range": (0.8, 1.5)},

    # Home & Kitchen - Storage
    {"name_template": "{brand} Closet Organizer {model}", "category_id": "CAT-HOME-STORAGE", "base_price": 49.99, "weight_range": (3.0, 6.0)},
    {"name_template": "{brand} Drawer Dividers {model}", "category_id": "CAT-HOME-STORAGE", "base_price": 19.99, "weight_range": (0.5, 1.0)},
    {"name_template": "{brand} Storage Bins 6-Pack {model}", "category_id": "CAT-HOME-STORAGE", "base_price": 24.99, "weight_range": (1.5, 3.0)},

    # Health & Personal Care
    {"name_template": "{brand} Vitamin D3 5000IU {model}", "category_id": "CAT-HEALTH-VIT", "base_price": 14.99, "weight_range": (0.1, 0.2)},
    {"name_template": "{brand} Multivitamin 90-Day {model}", "category_id": "CAT-HEALTH-VIT", "base_price": 24.99, "weight_range": (0.15, 0.3)},
    {"name_template": "{brand} Omega-3 Fish Oil {model}", "category_id": "CAT-HEALTH-VIT", "base_price": 19.99, "weight_range": (0.2, 0.4)},
    {"name_template": "{brand} Probiotic 30B CFU {model}", "category_id": "CAT-HEALTH-VIT", "base_price": 29.99, "weight_range": (0.1, 0.2)},

    # Office Supplies
    {"name_template": "{brand} Desk Organizer {model}", "category_id": "CAT-OFFICE", "base_price": 22.99, "weight_range": (0.5, 1.0)},
    {"name_template": "{brand} Notebook Set 5-Pack {model}", "category_id": "CAT-OFFICE", "base_price": 12.99, "weight_range": (0.8, 1.5)},
    {"name_template": "{brand} Pen Set Premium {model}", "category_id": "CAT-OFFICE", "base_price": 18.99, "weight_range": (0.2, 0.4)},
    {"name_template": "{brand} Filing Cabinet {model}", "category_id": "CAT-OFFICE", "base_price": 129.99, "weight_range": (15.0, 25.0)},
    {"name_template": "{brand} Whiteboard 24x36 {model}", "category_id": "CAT-OFFICE", "base_price": 44.99, "weight_range": (3.0, 5.0)},
]


def generate_sku_id():
    """Generate a unique SKU ID."""
    return f"SKU-{uuid.uuid4().hex[:8].upper()}"


def generate_model_number():
    """Generate a random model number."""
    return f"{random.choice('ABCDEFGHKMPRSTUVWXYZ')}{random.randint(100, 999)}"


def generate_upc():
    """Generate a random UPC code."""
    return "".join([str(random.randint(0, 9)) for _ in range(12)])


def generate_skus():
    """Generate sample SKU products."""
    skus = []

    for i in range(NUM_SKUS):
        template = random.choice(PRODUCT_TEMPLATES)
        brand = random.choice(BRANDS)
        model = generate_model_number()

        product_name = template["name_template"].format(brand=brand, model=model)
        weight = round(random.uniform(*template["weight_range"]), 2)

        # Generate dimensions based on weight
        length = round(random.uniform(5, 50), 1)
        width = round(random.uniform(5, 40), 1)
        height = round(random.uniform(2, 30), 1)

        sku = {
            "sku_id": generate_sku_id(),
            "product_name": product_name,
            "description": f"High-quality {product_name.lower()} from {brand}. Model {model}.",
            "category_id": template["category_id"],
            "length_cm": length,
            "width_cm": width,
            "height_cm": height,
            "weight_kg": weight,
            "upc_code": generate_upc(),
            "brand": brand,
            "manufacturer": brand,
            "model_number": model,
            "is_active": True,
            "is_hazardous": False,
            "requires_refrigeration": False,
        }
        skus.append(sku)

    return skus


def generate_vendor_pricing(skus):
    """Generate vendor pricing for SKUs across regions."""
    pricing = []

    for sku in skus:
        # Get base price from template
        template = next(
            (t for t in PRODUCT_TEMPLATES if t["category_id"] == sku["category_id"]),
            PRODUCT_TEMPLATES[0]
        )
        base_price = template["base_price"]

        # Each SKU is available from 2-4 vendors in 1-3 regions
        num_vendors = random.randint(2, 4)
        selected_vendors = random.sample(VENDORS, num_vendors)

        for vendor in selected_vendors:
            # Vendor-specific price variation (-10% to +15%)
            vendor_multiplier = 1 + random.uniform(-0.10, 0.15)

            # Each vendor sells in 1-3 regions
            num_regions = random.randint(1, 3)
            selected_regions = random.sample(REGIONS, num_regions)

            for region in selected_regions:
                # Regional price variation (-5% to +10%)
                regional_multiplier = 1 + random.uniform(-0.05, 0.10)

                final_price = round(base_price * vendor_multiplier * regional_multiplier, 2)

                pricing_record = {
                    "pricing_id": str(uuid.uuid4()),
                    "vendor_id": vendor["vendor_id"],
                    "sku_id": sku["sku_id"],
                    "unit_price": final_price,
                    "currency_code": "USD",
                    "min_order_quantity": random.choice([1, 5, 10, 25]),
                    "bulk_discount_percentage": random.choice([0, 5, 10, 15]) if random.random() > 0.5 else None,
                    "bulk_discount_threshold": random.choice([50, 100, 250]) if random.random() > 0.5 else None,
                    "market_id": region["market_id"],
                    "lead_time_days": random.randint(1, 14),
                    "stock_status": random.choices(
                        ["in_stock", "low_stock", "out_of_stock"],
                        weights=[0.7, 0.2, 0.1]
                    )[0],
                    "is_current": True,
                    "source": "csv",
                    "last_updated": datetime.now().isoformat(),
                }
                pricing.append(pricing_record)

    return pricing


def save_csv(data, filename, fieldnames=None):
    """Save data to CSV file."""
    if not data:
        return

    if fieldnames is None:
        fieldnames = list(data[0].keys())

    filepath = OUTPUT_DIR / filename
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

    print(f"Saved {len(data)} records to {filename}")


def save_json(data, filename):
    """Save data to JSON file."""
    filepath = OUTPUT_DIR / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

    print(f"Saved data to {filename}")


def main():
    """Generate all sample data files."""
    print("Generating sample data for PricePoint Intel...")
    print(f"- {NUM_SKUS} SKUs")
    print(f"- {NUM_VENDORS} Vendors")
    print(f"- {NUM_REGIONS} Regions")
    print()

    # Generate SKUs
    skus = generate_skus()

    # Generate pricing
    pricing = generate_vendor_pricing(skus)

    # Save CSV files
    save_csv(CATEGORIES, "categories.csv", ["id", "name", "parent", "level"])

    vendor_fields = ["vendor_id", "vendor_name", "vendor_code", "contact_email",
                     "contact_phone", "headquarters_address", "headquarters_latitude",
                     "headquarters_longitude", "payment_terms_days", "reliability_score"]
    save_csv(VENDORS, "vendors.csv", vendor_fields)

    region_fields = ["market_id", "region_name", "country_code", "latitude",
                     "longitude", "market_size_tier", "timezone", "currency_code",
                     "population_estimate"]
    save_csv(REGIONS, "geographic_markets.csv", region_fields)

    dc_fields = ["center_id", "center_name", "vendor_id", "latitude", "longitude", "market_id"]
    save_csv(DISTRIBUTION_CENTERS, "distribution_centers.csv", dc_fields)

    sku_fields = ["sku_id", "product_name", "description", "category_id", "length_cm",
                  "width_cm", "height_cm", "weight_kg", "upc_code", "brand",
                  "manufacturer", "model_number", "is_active", "is_hazardous",
                  "requires_refrigeration"]
    save_csv(skus, "sku_products.csv", sku_fields)

    pricing_fields = ["pricing_id", "vendor_id", "sku_id", "unit_price", "currency_code",
                      "min_order_quantity", "bulk_discount_percentage", "bulk_discount_threshold",
                      "market_id", "lead_time_days", "stock_status", "is_current", "source",
                      "last_updated"]
    save_csv(pricing, "vendor_pricing.csv", pricing_fields)

    # Save combined JSON for easy loading
    all_data = {
        "categories": CATEGORIES,
        "vendors": VENDORS,
        "regions": REGIONS,
        "distribution_centers": DISTRIBUTION_CENTERS,
        "skus": skus,
        "pricing": pricing,
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "sku_count": len(skus),
            "pricing_count": len(pricing),
            "vendor_count": len(VENDORS),
            "region_count": len(REGIONS),
        }
    }
    save_json(all_data, "sample_data.json")

    print()
    print("Sample data generation complete!")
    print(f"Total pricing records: {len(pricing)}")


if __name__ == "__main__":
    main()
