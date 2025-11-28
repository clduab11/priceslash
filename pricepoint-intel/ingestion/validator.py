"""
Data validation module for PricePoint Intel ingestion pipeline.
Provides comprehensive validation with detailed error reporting.
"""

import re
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable
from datetime import datetime
from decimal import Decimal, InvalidOperation

logger = logging.getLogger(__name__)


@dataclass
class ValidationError:
    """Represents a single validation error."""

    field: str
    value: Any
    message: str
    severity: str = "error"  # error, warning
    row_index: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "field": self.field,
            "value": str(self.value)[:100],  # Truncate long values
            "message": self.message,
            "severity": self.severity,
            "row_index": self.row_index,
        }


@dataclass
class ValidationResult:
    """Container for validation results."""

    is_valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    warnings: List[ValidationError] = field(default_factory=list)
    cleaned_data: Optional[Dict[str, Any]] = None

    def add_error(
        self,
        field: str,
        value: Any,
        message: str,
        row_index: Optional[int] = None
    ):
        """Add an error to the result."""
        self.errors.append(
            ValidationError(field, value, message, "error", row_index)
        )
        self.is_valid = False

    def add_warning(
        self,
        field: str,
        value: Any,
        message: str,
        row_index: Optional[int] = None
    ):
        """Add a warning to the result."""
        self.warnings.append(
            ValidationError(field, value, message, "warning", row_index)
        )

    def to_dict(self) -> dict:
        return {
            "is_valid": self.is_valid,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "errors": [e.to_dict() for e in self.errors],
            "warnings": [w.to_dict() for w in self.warnings],
        }


class DataValidator:
    """
    Comprehensive data validator for pricing and SKU data.
    Supports custom validation rules and transformations.
    """

    # Valid currency codes (ISO 4217)
    VALID_CURRENCIES = {
        "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY",
        "INR", "MXN", "BRL", "KRW", "SGD", "HKD", "NOK", "SEK",
    }

    # Valid country codes (ISO 3166-1 alpha-2)
    VALID_COUNTRY_CODES = {
        "US", "CA", "MX", "GB", "DE", "FR", "IT", "ES", "NL", "BE",
        "AU", "NZ", "JP", "KR", "CN", "IN", "BR", "AR", "CL", "CO",
        "SG", "HK", "TW", "PH", "ID", "MY", "TH", "VN", "AE", "SA",
    }

    # Stock status values
    VALID_STOCK_STATUSES = {"in_stock", "low_stock", "out_of_stock", "discontinued"}

    # Market size tiers
    VALID_MARKET_TIERS = {"tier_1", "tier_2", "tier_3", "tier_4"}

    # Source types
    VALID_SOURCE_TYPES = {"api", "csv", "excel", "manual", "scrape"}

    def __init__(self):
        self._custom_validators: Dict[str, List[Callable]] = {}

    def add_custom_validator(self, field: str, validator: Callable):
        """Add a custom validator function for a specific field."""
        if field not in self._custom_validators:
            self._custom_validators[field] = []
        self._custom_validators[field].append(validator)

    def validate_sku_product(
        self,
        data: Dict[str, Any],
        row_index: Optional[int] = None
    ) -> ValidationResult:
        """Validate SKU product data."""
        result = ValidationResult(is_valid=True, cleaned_data={})

        # Required fields
        self._validate_required_string(
            result, data, "sku_id", max_length=36, row_index=row_index
        )
        self._validate_required_string(
            result, data, "product_name", max_length=500, row_index=row_index
        )

        # Optional string fields
        self._validate_optional_string(
            result, data, "description", row_index=row_index
        )
        self._validate_optional_string(
            result, data, "brand", max_length=255, row_index=row_index
        )
        self._validate_optional_string(
            result, data, "manufacturer", max_length=255, row_index=row_index
        )
        self._validate_optional_string(
            result, data, "model_number", max_length=100, row_index=row_index
        )
        self._validate_optional_string(
            result, data, "upc_code", max_length=20, row_index=row_index
        )
        self._validate_optional_string(
            result, data, "ean_code", max_length=20, row_index=row_index
        )
        self._validate_optional_string(
            result, data, "category_id", max_length=36, row_index=row_index
        )

        # Dimension fields (must be positive if provided)
        for dim_field in ["length_cm", "width_cm", "height_cm", "weight_kg"]:
            self._validate_positive_number(
                result, data, dim_field, required=False, row_index=row_index
            )

        # Boolean fields
        for bool_field in ["is_active", "is_hazardous", "requires_refrigeration"]:
            self._validate_boolean(result, data, bool_field, row_index=row_index)

        # Shelf life (positive integer)
        self._validate_positive_integer(
            result, data, "shelf_life_days", required=False, row_index=row_index
        )

        # Apply custom validators
        self._apply_custom_validators(result, data, row_index)

        return result

    def validate_vendor(
        self,
        data: Dict[str, Any],
        row_index: Optional[int] = None
    ) -> ValidationResult:
        """Validate vendor data."""
        result = ValidationResult(is_valid=True, cleaned_data={})

        # Required fields
        self._validate_required_string(
            result, data, "vendor_id", max_length=36, row_index=row_index
        )
        self._validate_required_string(
            result, data, "vendor_name", max_length=255, row_index=row_index
        )
        self._validate_required_string(
            result, data, "vendor_code", max_length=50, row_index=row_index
        )

        # Optional string fields
        self._validate_email(result, data, "contact_email", row_index=row_index)
        self._validate_optional_string(
            result, data, "contact_phone", max_length=50, row_index=row_index
        )
        self._validate_optional_string(
            result, data, "headquarters_address", row_index=row_index
        )

        # Coordinates
        self._validate_latitude(
            result, data, "headquarters_latitude", row_index=row_index
        )
        self._validate_longitude(
            result, data, "headquarters_longitude", row_index=row_index
        )

        # Reliability score (0-100)
        self._validate_percentage(
            result, data, "reliability_score", required=False, row_index=row_index
        )

        # Payment terms
        self._validate_positive_integer(
            result, data, "payment_terms_days", required=False, row_index=row_index
        )

        return result

    def validate_vendor_pricing(
        self,
        data: Dict[str, Any],
        row_index: Optional[int] = None
    ) -> ValidationResult:
        """Validate vendor pricing data."""
        result = ValidationResult(is_valid=True, cleaned_data={})

        # Required fields
        self._validate_required_string(
            result, data, "vendor_id", max_length=36, row_index=row_index
        )
        self._validate_required_string(
            result, data, "sku_id", max_length=36, row_index=row_index
        )

        # Price (required, must be positive)
        self._validate_positive_number(
            result, data, "unit_price", required=True, row_index=row_index
        )

        # Currency code
        self._validate_currency(result, data, "currency_code", row_index=row_index)

        # Optional fields
        self._validate_optional_string(
            result, data, "market_id", max_length=36, row_index=row_index
        )

        # Stock status
        self._validate_enum(
            result, data, "stock_status",
            self.VALID_STOCK_STATUSES,
            required=False,
            row_index=row_index
        )

        # Lead time
        self._validate_positive_integer(
            result, data, "lead_time_days", required=False, row_index=row_index
        )

        # Min order quantity
        self._validate_positive_integer(
            result, data, "min_order_quantity", required=False, row_index=row_index
        )

        # Bulk discount
        self._validate_percentage(
            result, data, "bulk_discount_percentage", required=False, row_index=row_index
        )
        self._validate_positive_integer(
            result, data, "bulk_discount_threshold", required=False, row_index=row_index
        )

        # Source
        self._validate_enum(
            result, data, "source",
            self.VALID_SOURCE_TYPES,
            required=False,
            row_index=row_index
        )

        return result

    def validate_geographic_market(
        self,
        data: Dict[str, Any],
        row_index: Optional[int] = None
    ) -> ValidationResult:
        """Validate geographic market data."""
        result = ValidationResult(is_valid=True, cleaned_data={})

        # Required fields
        self._validate_required_string(
            result, data, "market_id", max_length=36, row_index=row_index
        )
        self._validate_required_string(
            result, data, "region_name", max_length=255, row_index=row_index
        )

        # Coordinates (required)
        self._validate_latitude(
            result, data, "latitude", required=True, row_index=row_index
        )
        self._validate_longitude(
            result, data, "longitude", required=True, row_index=row_index
        )

        # Market size tier
        self._validate_enum(
            result, data, "market_size_tier",
            self.VALID_MARKET_TIERS,
            required=True,
            row_index=row_index
        )

        # Country code
        self._validate_country_code(result, data, "country_code", row_index=row_index)

        # Currency
        self._validate_currency(result, data, "currency_code", row_index=row_index)

        # Optional fields
        self._validate_optional_string(
            result, data, "timezone", max_length=50, row_index=row_index
        )
        self._validate_positive_integer(
            result, data, "population_estimate", required=False, row_index=row_index
        )

        return result

    def validate_distribution_center(
        self,
        data: Dict[str, Any],
        row_index: Optional[int] = None
    ) -> ValidationResult:
        """Validate distribution center data."""
        result = ValidationResult(is_valid=True, cleaned_data={})

        # Required fields
        self._validate_required_string(
            result, data, "center_id", max_length=36, row_index=row_index
        )
        self._validate_required_string(
            result, data, "center_name", max_length=255, row_index=row_index
        )
        self._validate_required_string(
            result, data, "vendor_id", max_length=36, row_index=row_index
        )

        # Coordinates (required)
        self._validate_latitude(
            result, data, "latitude", required=True, row_index=row_index
        )
        self._validate_longitude(
            result, data, "longitude", required=True, row_index=row_index
        )

        # Optional fields
        self._validate_optional_string(
            result, data, "address", row_index=row_index
        )
        self._validate_optional_string(
            result, data, "market_id", max_length=36, row_index=row_index
        )
        self._validate_positive_integer(
            result, data, "capacity_units", required=False, row_index=row_index
        )

        return result

    # ==========================================================================
    # PRIVATE VALIDATION HELPERS
    # ==========================================================================

    def _validate_required_string(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        max_length: Optional[int] = None,
        row_index: Optional[int] = None
    ):
        """Validate a required string field."""
        value = data.get(field)

        if value is None or (isinstance(value, str) and not value.strip()):
            result.add_error(field, value, f"{field} is required", row_index)
            return

        if not isinstance(value, str):
            value = str(value)

        value = value.strip()

        if max_length and len(value) > max_length:
            result.add_error(
                field, value,
                f"{field} exceeds max length of {max_length} characters",
                row_index
            )
            return

        if result.cleaned_data is not None:
            result.cleaned_data[field] = value

    def _validate_optional_string(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        max_length: Optional[int] = None,
        row_index: Optional[int] = None
    ):
        """Validate an optional string field."""
        value = data.get(field)

        if value is None or (isinstance(value, str) and not value.strip()):
            if result.cleaned_data is not None:
                result.cleaned_data[field] = None
            return

        if not isinstance(value, str):
            value = str(value)

        value = value.strip()

        if max_length and len(value) > max_length:
            result.add_warning(
                field, value,
                f"{field} exceeds max length of {max_length}, will be truncated",
                row_index
            )
            value = value[:max_length]

        if result.cleaned_data is not None:
            result.cleaned_data[field] = value

    def _validate_positive_number(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        required: bool = False,
        row_index: Optional[int] = None
    ):
        """Validate a positive number field."""
        value = data.get(field)

        if value is None or value == "":
            if required:
                result.add_error(field, value, f"{field} is required", row_index)
            elif result.cleaned_data is not None:
                result.cleaned_data[field] = None
            return

        try:
            num_value = float(value)
            if num_value < 0:
                result.add_error(
                    field, value,
                    f"{field} must be a positive number",
                    row_index
                )
                return
            if result.cleaned_data is not None:
                result.cleaned_data[field] = num_value
        except (ValueError, TypeError):
            result.add_error(
                field, value,
                f"{field} must be a valid number",
                row_index
            )

    def _validate_positive_integer(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        required: bool = False,
        row_index: Optional[int] = None
    ):
        """Validate a positive integer field."""
        value = data.get(field)

        if value is None or value == "":
            if required:
                result.add_error(field, value, f"{field} is required", row_index)
            elif result.cleaned_data is not None:
                result.cleaned_data[field] = None
            return

        try:
            int_value = int(float(value))
            if int_value < 0:
                result.add_error(
                    field, value,
                    f"{field} must be a positive integer",
                    row_index
                )
                return
            if result.cleaned_data is not None:
                result.cleaned_data[field] = int_value
        except (ValueError, TypeError):
            result.add_error(
                field, value,
                f"{field} must be a valid integer",
                row_index
            )

    def _validate_percentage(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        required: bool = False,
        row_index: Optional[int] = None
    ):
        """Validate a percentage field (0-100)."""
        value = data.get(field)

        if value is None or value == "":
            if required:
                result.add_error(field, value, f"{field} is required", row_index)
            elif result.cleaned_data is not None:
                result.cleaned_data[field] = None
            return

        try:
            num_value = float(value)
            if num_value < 0 or num_value > 100:
                result.add_error(
                    field, value,
                    f"{field} must be between 0 and 100",
                    row_index
                )
                return
            if result.cleaned_data is not None:
                result.cleaned_data[field] = num_value
        except (ValueError, TypeError):
            result.add_error(
                field, value,
                f"{field} must be a valid number",
                row_index
            )

    def _validate_boolean(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        row_index: Optional[int] = None
    ):
        """Validate a boolean field."""
        value = data.get(field)

        if value is None or value == "":
            if result.cleaned_data is not None:
                result.cleaned_data[field] = None
            return

        if isinstance(value, bool):
            if result.cleaned_data is not None:
                result.cleaned_data[field] = value
            return

        if isinstance(value, str):
            lower_val = value.lower().strip()
            if lower_val in ("true", "1", "yes", "y"):
                if result.cleaned_data is not None:
                    result.cleaned_data[field] = True
                return
            elif lower_val in ("false", "0", "no", "n"):
                if result.cleaned_data is not None:
                    result.cleaned_data[field] = False
                return

        if isinstance(value, (int, float)):
            if result.cleaned_data is not None:
                result.cleaned_data[field] = bool(value)
            return

        result.add_warning(
            field, value,
            f"{field} has invalid boolean value, defaulting to False",
            row_index
        )
        if result.cleaned_data is not None:
            result.cleaned_data[field] = False

    def _validate_latitude(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        required: bool = False,
        row_index: Optional[int] = None
    ):
        """Validate a latitude value (-90 to 90)."""
        value = data.get(field)

        if value is None or value == "":
            if required:
                result.add_error(field, value, f"{field} is required", row_index)
            elif result.cleaned_data is not None:
                result.cleaned_data[field] = None
            return

        try:
            lat = float(value)
            if lat < -90 or lat > 90:
                result.add_error(
                    field, value,
                    f"{field} must be between -90 and 90",
                    row_index
                )
                return
            if result.cleaned_data is not None:
                result.cleaned_data[field] = lat
        except (ValueError, TypeError):
            result.add_error(
                field, value,
                f"{field} must be a valid latitude",
                row_index
            )

    def _validate_longitude(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        required: bool = False,
        row_index: Optional[int] = None
    ):
        """Validate a longitude value (-180 to 180)."""
        value = data.get(field)

        if value is None or value == "":
            if required:
                result.add_error(field, value, f"{field} is required", row_index)
            elif result.cleaned_data is not None:
                result.cleaned_data[field] = None
            return

        try:
            lon = float(value)
            if lon < -180 or lon > 180:
                result.add_error(
                    field, value,
                    f"{field} must be between -180 and 180",
                    row_index
                )
                return
            if result.cleaned_data is not None:
                result.cleaned_data[field] = lon
        except (ValueError, TypeError):
            result.add_error(
                field, value,
                f"{field} must be a valid longitude",
                row_index
            )

    def _validate_email(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        row_index: Optional[int] = None
    ):
        """Validate an email address."""
        value = data.get(field)

        if value is None or (isinstance(value, str) and not value.strip()):
            if result.cleaned_data is not None:
                result.cleaned_data[field] = None
            return

        if not isinstance(value, str):
            value = str(value)

        value = value.strip().lower()

        # Basic email regex
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, value):
            result.add_warning(
                field, value,
                f"{field} does not appear to be a valid email",
                row_index
            )

        if result.cleaned_data is not None:
            result.cleaned_data[field] = value

    def _validate_currency(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        row_index: Optional[int] = None
    ):
        """Validate a currency code."""
        value = data.get(field)

        if value is None or (isinstance(value, str) and not value.strip()):
            if result.cleaned_data is not None:
                result.cleaned_data[field] = "USD"  # Default
            return

        if not isinstance(value, str):
            value = str(value)

        value = value.strip().upper()

        if value not in self.VALID_CURRENCIES:
            result.add_warning(
                field, value,
                f"{field} '{value}' is not a recognized currency code",
                row_index
            )

        if result.cleaned_data is not None:
            result.cleaned_data[field] = value

    def _validate_country_code(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        row_index: Optional[int] = None
    ):
        """Validate a country code."""
        value = data.get(field)

        if value is None or (isinstance(value, str) and not value.strip()):
            if result.cleaned_data is not None:
                result.cleaned_data[field] = "US"  # Default
            return

        if not isinstance(value, str):
            value = str(value)

        value = value.strip().upper()

        if len(value) != 2:
            result.add_error(
                field, value,
                f"{field} must be a 2-letter country code",
                row_index
            )
            return

        if value not in self.VALID_COUNTRY_CODES:
            result.add_warning(
                field, value,
                f"{field} '{value}' may not be a recognized country code",
                row_index
            )

        if result.cleaned_data is not None:
            result.cleaned_data[field] = value

    def _validate_enum(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        field: str,
        valid_values: set,
        required: bool = False,
        row_index: Optional[int] = None
    ):
        """Validate an enum field."""
        value = data.get(field)

        if value is None or (isinstance(value, str) and not value.strip()):
            if required:
                result.add_error(field, value, f"{field} is required", row_index)
            elif result.cleaned_data is not None:
                result.cleaned_data[field] = None
            return

        if not isinstance(value, str):
            value = str(value)

        value = value.strip().lower()

        if value not in valid_values:
            result.add_error(
                field, value,
                f"{field} must be one of: {', '.join(sorted(valid_values))}",
                row_index
            )
            return

        if result.cleaned_data is not None:
            result.cleaned_data[field] = value

    def _apply_custom_validators(
        self,
        result: ValidationResult,
        data: Dict[str, Any],
        row_index: Optional[int] = None
    ):
        """Apply custom validators to the data."""
        for field, validators in self._custom_validators.items():
            if field in data:
                for validator in validators:
                    try:
                        error_msg = validator(data[field], data)
                        if error_msg:
                            result.add_error(field, data[field], error_msg, row_index)
                    except Exception as e:
                        logger.warning(
                            f"Custom validator for {field} raised exception: {e}"
                        )
