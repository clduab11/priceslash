"""
Unit tests for data validation module.
Tests all validation functions and edge cases.
"""

import pytest
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from ingestion.validator import DataValidator, ValidationResult, ValidationError


class TestDataValidator:
    """Test suite for DataValidator class."""

    @pytest.fixture
    def validator(self):
        """Create a fresh validator instance for each test."""
        return DataValidator()

    # =========================================================================
    # SKU Product Validation Tests
    # =========================================================================

    def test_validate_sku_product_valid(self, validator):
        """Test validation of a valid SKU product."""
        data = {
            "sku_id": "SKU-001",
            "product_name": "Test Product",
            "brand": "TestBrand",
            "category_id": "CAT-001",
            "weight_kg": 1.5,
            "is_active": True,
        }
        result = validator.validate_sku_product(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.cleaned_data is not None
        assert result.cleaned_data["sku_id"] == "SKU-001"
        assert result.cleaned_data["product_name"] == "Test Product"

    def test_validate_sku_product_missing_required_fields(self, validator):
        """Test validation fails when required fields are missing."""
        data = {
            "brand": "TestBrand",
        }
        result = validator.validate_sku_product(data)

        assert result.is_valid is False
        assert len(result.errors) >= 2  # sku_id and product_name required
        error_fields = [e.field for e in result.errors]
        assert "sku_id" in error_fields
        assert "product_name" in error_fields

    def test_validate_sku_product_empty_strings(self, validator):
        """Test validation handles empty strings as missing values."""
        data = {
            "sku_id": "",
            "product_name": "   ",
            "brand": "TestBrand",
        }
        result = validator.validate_sku_product(data)

        assert result.is_valid is False
        error_fields = [e.field for e in result.errors]
        assert "sku_id" in error_fields
        assert "product_name" in error_fields

    def test_validate_sku_product_negative_dimensions(self, validator):
        """Test validation rejects negative dimensions."""
        data = {
            "sku_id": "SKU-001",
            "product_name": "Test Product",
            "weight_kg": -1.5,
            "length_cm": -10,
        }
        result = validator.validate_sku_product(data)

        assert result.is_valid is False
        error_fields = [e.field for e in result.errors]
        assert "weight_kg" in error_fields
        assert "length_cm" in error_fields

    def test_validate_sku_product_boolean_conversion(self, validator):
        """Test boolean field conversion from various formats."""
        test_cases = [
            ({"sku_id": "SKU-001", "product_name": "Test", "is_active": "true"}, True),
            ({"sku_id": "SKU-001", "product_name": "Test", "is_active": "yes"}, True),
            ({"sku_id": "SKU-001", "product_name": "Test", "is_active": "1"}, True),
            ({"sku_id": "SKU-001", "product_name": "Test", "is_active": "false"}, False),
            ({"sku_id": "SKU-001", "product_name": "Test", "is_active": "no"}, False),
            ({"sku_id": "SKU-001", "product_name": "Test", "is_active": "0"}, False),
            ({"sku_id": "SKU-001", "product_name": "Test", "is_active": True}, True),
            ({"sku_id": "SKU-001", "product_name": "Test", "is_active": False}, False),
        ]

        for data, expected in test_cases:
            result = validator.validate_sku_product(data)
            assert result.is_valid is True
            assert result.cleaned_data["is_active"] == expected

    # =========================================================================
    # Vendor Validation Tests
    # =========================================================================

    def test_validate_vendor_valid(self, validator):
        """Test validation of a valid vendor."""
        data = {
            "vendor_id": "V-001",
            "vendor_name": "Test Vendor Inc",
            "vendor_code": "TEST001",
            "contact_email": "contact@testvendor.com",
            "reliability_score": 85.5,
        }
        result = validator.validate_vendor(data)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.cleaned_data["vendor_name"] == "Test Vendor Inc"

    def test_validate_vendor_missing_required(self, validator):
        """Test validation fails when required vendor fields are missing."""
        data = {
            "vendor_id": "V-001",
            # Missing vendor_name and vendor_code
        }
        result = validator.validate_vendor(data)

        assert result.is_valid is False
        error_fields = [e.field for e in result.errors]
        assert "vendor_name" in error_fields
        assert "vendor_code" in error_fields

    def test_validate_vendor_invalid_email(self, validator):
        """Test validation warns on invalid email format."""
        data = {
            "vendor_id": "V-001",
            "vendor_name": "Test Vendor",
            "vendor_code": "TEST001",
            "contact_email": "not-an-email",
        }
        result = validator.validate_vendor(data)

        # Should have a warning, not an error
        assert result.is_valid is True
        assert len(result.warnings) > 0
        warning_fields = [w.field for w in result.warnings]
        assert "contact_email" in warning_fields

    def test_validate_vendor_reliability_score_range(self, validator):
        """Test reliability score must be 0-100."""
        test_cases = [
            ({"vendor_id": "V-001", "vendor_name": "Test", "vendor_code": "T1", "reliability_score": 50}, True),
            ({"vendor_id": "V-001", "vendor_name": "Test", "vendor_code": "T1", "reliability_score": 0}, True),
            ({"vendor_id": "V-001", "vendor_name": "Test", "vendor_code": "T1", "reliability_score": 100}, True),
            ({"vendor_id": "V-001", "vendor_name": "Test", "vendor_code": "T1", "reliability_score": -5}, False),
            ({"vendor_id": "V-001", "vendor_name": "Test", "vendor_code": "T1", "reliability_score": 105}, False),
        ]

        for data, expected_valid in test_cases:
            result = validator.validate_vendor(data)
            assert result.is_valid == expected_valid, f"Failed for reliability_score={data['reliability_score']}"

    def test_validate_vendor_coordinates(self, validator):
        """Test validation of vendor headquarters coordinates."""
        # Valid coordinates
        data = {
            "vendor_id": "V-001",
            "vendor_name": "Test Vendor",
            "vendor_code": "TEST001",
            "headquarters_latitude": 40.7128,
            "headquarters_longitude": -74.0060,
        }
        result = validator.validate_vendor(data)
        assert result.is_valid is True

        # Invalid latitude (out of range)
        data["headquarters_latitude"] = 95
        result = validator.validate_vendor(data)
        assert result.is_valid is False

        # Invalid longitude (out of range)
        data["headquarters_latitude"] = 40.7128
        data["headquarters_longitude"] = 200
        result = validator.validate_vendor(data)
        assert result.is_valid is False

    # =========================================================================
    # Vendor Pricing Validation Tests
    # =========================================================================

    def test_validate_vendor_pricing_valid(self, validator):
        """Test validation of valid vendor pricing."""
        data = {
            "vendor_id": "V-001",
            "sku_id": "SKU-001",
            "unit_price": 29.99,
            "currency_code": "USD",
            "stock_status": "in_stock",
        }
        result = validator.validate_vendor_pricing(data)

        assert result.is_valid is True
        assert result.cleaned_data["unit_price"] == 29.99
        assert result.cleaned_data["currency_code"] == "USD"

    def test_validate_vendor_pricing_negative_price(self, validator):
        """Test validation rejects negative prices."""
        data = {
            "vendor_id": "V-001",
            "sku_id": "SKU-001",
            "unit_price": -10.00,
        }
        result = validator.validate_vendor_pricing(data)

        assert result.is_valid is False
        error_fields = [e.field for e in result.errors]
        assert "unit_price" in error_fields

    def test_validate_vendor_pricing_zero_price(self, validator):
        """Test validation accepts zero price (could be free item)."""
        data = {
            "vendor_id": "V-001",
            "sku_id": "SKU-001",
            "unit_price": 0,
        }
        result = validator.validate_vendor_pricing(data)

        assert result.is_valid is True
        assert result.cleaned_data["unit_price"] == 0

    def test_validate_vendor_pricing_currency_normalization(self, validator):
        """Test currency code is normalized to uppercase."""
        data = {
            "vendor_id": "V-001",
            "sku_id": "SKU-001",
            "unit_price": 29.99,
            "currency_code": "usd",
        }
        result = validator.validate_vendor_pricing(data)

        assert result.is_valid is True
        assert result.cleaned_data["currency_code"] == "USD"

    def test_validate_vendor_pricing_invalid_stock_status(self, validator):
        """Test validation rejects invalid stock status."""
        data = {
            "vendor_id": "V-001",
            "sku_id": "SKU-001",
            "unit_price": 29.99,
            "stock_status": "invalid_status",
        }
        result = validator.validate_vendor_pricing(data)

        assert result.is_valid is False
        error_fields = [e.field for e in result.errors]
        assert "stock_status" in error_fields

    def test_validate_vendor_pricing_valid_stock_statuses(self, validator):
        """Test all valid stock statuses are accepted."""
        valid_statuses = ["in_stock", "low_stock", "out_of_stock", "discontinued"]

        for status in valid_statuses:
            data = {
                "vendor_id": "V-001",
                "sku_id": "SKU-001",
                "unit_price": 29.99,
                "stock_status": status,
            }
            result = validator.validate_vendor_pricing(data)
            assert result.is_valid is True, f"Failed for stock_status={status}"

    def test_validate_vendor_pricing_bulk_discount(self, validator):
        """Test bulk discount percentage validation."""
        # Valid percentage
        data = {
            "vendor_id": "V-001",
            "sku_id": "SKU-001",
            "unit_price": 29.99,
            "bulk_discount_percentage": 15.5,
        }
        result = validator.validate_vendor_pricing(data)
        assert result.is_valid is True

        # Invalid percentage (over 100)
        data["bulk_discount_percentage"] = 150
        result = validator.validate_vendor_pricing(data)
        assert result.is_valid is False

    # =========================================================================
    # Geographic Market Validation Tests
    # =========================================================================

    def test_validate_geographic_market_valid(self, validator):
        """Test validation of valid geographic market."""
        data = {
            "market_id": "MKT-001",
            "region_name": "Northeast US",
            "latitude": 40.7128,
            "longitude": -74.0060,
            "market_size_tier": "tier_1",
            "country_code": "US",
        }
        result = validator.validate_geographic_market(data)

        assert result.is_valid is True
        assert result.cleaned_data["region_name"] == "Northeast US"

    def test_validate_geographic_market_invalid_tier(self, validator):
        """Test validation rejects invalid market size tier."""
        data = {
            "market_id": "MKT-001",
            "region_name": "Test Region",
            "latitude": 40.0,
            "longitude": -74.0,
            "market_size_tier": "tier_5",  # Invalid
        }
        result = validator.validate_geographic_market(data)

        assert result.is_valid is False
        error_fields = [e.field for e in result.errors]
        assert "market_size_tier" in error_fields

    def test_validate_geographic_market_coordinate_bounds(self, validator):
        """Test coordinate validation at boundary values."""
        test_cases = [
            # (lat, lon, expected_valid)
            (90, 180, True),     # Max valid
            (-90, -180, True),   # Min valid
            (0, 0, True),        # Origin
            (91, 0, False),      # Latitude too high
            (-91, 0, False),     # Latitude too low
            (0, 181, False),     # Longitude too high
            (0, -181, False),    # Longitude too low
        ]

        for lat, lon, expected_valid in test_cases:
            data = {
                "market_id": "MKT-001",
                "region_name": "Test Region",
                "latitude": lat,
                "longitude": lon,
                "market_size_tier": "tier_1",
            }
            result = validator.validate_geographic_market(data)
            assert result.is_valid == expected_valid, f"Failed for lat={lat}, lon={lon}"

    # =========================================================================
    # Distribution Center Validation Tests
    # =========================================================================

    def test_validate_distribution_center_valid(self, validator):
        """Test validation of valid distribution center."""
        data = {
            "center_id": "DC-001",
            "center_name": "East Coast DC",
            "vendor_id": "V-001",
            "latitude": 40.7128,
            "longitude": -74.0060,
            "capacity_units": 50000,
        }
        result = validator.validate_distribution_center(data)

        assert result.is_valid is True
        assert result.cleaned_data["center_name"] == "East Coast DC"

    def test_validate_distribution_center_missing_coordinates(self, validator):
        """Test distribution center requires coordinates."""
        data = {
            "center_id": "DC-001",
            "center_name": "Test DC",
            "vendor_id": "V-001",
            # Missing latitude and longitude
        }
        result = validator.validate_distribution_center(data)

        assert result.is_valid is False
        error_fields = [e.field for e in result.errors]
        assert "latitude" in error_fields
        assert "longitude" in error_fields

    # =========================================================================
    # Custom Validator Tests
    # =========================================================================

    def test_custom_validator(self, validator):
        """Test adding and using custom validators."""
        # Add custom validator that requires product_name to start with uppercase
        def validate_name_format(value, data):
            if value and not value[0].isupper():
                return "Product name must start with uppercase letter"
            return None

        validator.add_custom_validator("product_name", validate_name_format)

        # Valid case
        data = {
            "sku_id": "SKU-001",
            "product_name": "Valid Product Name",
        }
        result = validator.validate_sku_product(data)
        assert result.is_valid is True

        # Invalid case
        data["product_name"] = "invalid product name"
        result = validator.validate_sku_product(data)
        assert result.is_valid is False

    # =========================================================================
    # Edge Cases and Type Conversion Tests
    # =========================================================================

    def test_numeric_string_conversion(self, validator):
        """Test numeric values provided as strings are converted."""
        data = {
            "vendor_id": "V-001",
            "sku_id": "SKU-001",
            "unit_price": "29.99",  # String instead of float
            "lead_time_days": "5",   # String instead of int
        }
        result = validator.validate_vendor_pricing(data)

        assert result.is_valid is True
        assert result.cleaned_data["unit_price"] == 29.99
        assert result.cleaned_data["lead_time_days"] == 5

    def test_whitespace_handling(self, validator):
        """Test leading/trailing whitespace is trimmed."""
        data = {
            "sku_id": "  SKU-001  ",
            "product_name": "  Test Product  ",
            "brand": "  TestBrand  ",
        }
        result = validator.validate_sku_product(data)

        assert result.is_valid is True
        assert result.cleaned_data["sku_id"] == "SKU-001"
        assert result.cleaned_data["product_name"] == "Test Product"
        assert result.cleaned_data["brand"] == "TestBrand"

    def test_none_values_handling(self, validator):
        """Test None values are handled correctly."""
        data = {
            "sku_id": "SKU-001",
            "product_name": "Test",
            "description": None,
            "brand": None,
            "weight_kg": None,
        }
        result = validator.validate_sku_product(data)

        assert result.is_valid is True
        assert result.cleaned_data["description"] is None
        assert result.cleaned_data["brand"] is None
        assert result.cleaned_data["weight_kg"] is None

    def test_row_index_in_errors(self, validator):
        """Test row index is included in validation errors."""
        data = {
            "sku_id": "",  # Invalid
            "product_name": "",  # Invalid
        }
        result = validator.validate_sku_product(data, row_index=42)

        assert result.is_valid is False
        for error in result.errors:
            assert error.row_index == 42


class TestValidationResult:
    """Tests for ValidationResult class."""

    def test_add_error_marks_invalid(self):
        """Test adding an error marks result as invalid."""
        result = ValidationResult(is_valid=True)
        assert result.is_valid is True

        result.add_error("field", "value", "error message")
        assert result.is_valid is False
        assert len(result.errors) == 1

    def test_add_warning_keeps_valid(self):
        """Test adding a warning doesn't affect validity."""
        result = ValidationResult(is_valid=True)
        result.add_warning("field", "value", "warning message")

        assert result.is_valid is True
        assert len(result.warnings) == 1

    def test_to_dict_format(self):
        """Test to_dict returns correct format."""
        result = ValidationResult(is_valid=True)
        result.add_error("field1", "value1", "error1")
        result.add_warning("field2", "value2", "warning1")

        data = result.to_dict()

        assert data["is_valid"] is False
        assert data["error_count"] == 1
        assert data["warning_count"] == 1
        assert len(data["errors"]) == 1
        assert len(data["warnings"]) == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
