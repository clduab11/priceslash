"""
CSV data importer for PricePoint Intel.
Handles bulk import of vendor pricing, SKU, and market data.
"""

import csv
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Iterator, Any, Callable
from dataclasses import dataclass, field
import uuid

from .validator import DataValidator, ValidationResult

logger = logging.getLogger(__name__)


@dataclass
class ImportResult:
    """Results from a CSV import operation."""

    success: bool
    source_file: str
    records_total: int = 0
    records_processed: int = 0
    records_success: int = 0
    records_failed: int = 0
    records_skipped: int = 0
    errors: List[Dict] = field(default_factory=list)
    warnings: List[Dict] = field(default_factory=list)
    imported_data: List[Dict] = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    def add_error(self, row: int, message: str, data: Optional[Dict] = None):
        """Add an error to the import result."""
        self.errors.append({
            "row": row,
            "message": message,
            "data": data,
        })

    def add_warning(self, row: int, message: str):
        """Add a warning to the import result."""
        self.warnings.append({
            "row": row,
            "message": message,
        })

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "source_file": self.source_file,
            "records_total": self.records_total,
            "records_processed": self.records_processed,
            "records_success": self.records_success,
            "records_failed": self.records_failed,
            "records_skipped": self.records_skipped,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": (
                (self.completed_at - self.started_at).total_seconds()
                if self.started_at and self.completed_at else None
            ),
        }


# Column mappings for different data types
COLUMN_MAPPINGS = {
    "sku_product": {
        "sku_id": ["sku_id", "sku", "product_id", "id"],
        "product_name": ["product_name", "name", "title", "product_title"],
        "description": ["description", "desc", "product_description"],
        "category_id": ["category_id", "category", "cat_id"],
        "length_cm": ["length_cm", "length", "len"],
        "width_cm": ["width_cm", "width", "wid"],
        "height_cm": ["height_cm", "height", "hgt"],
        "weight_kg": ["weight_kg", "weight", "wt", "weight_g"],
        "upc_code": ["upc_code", "upc", "barcode"],
        "ean_code": ["ean_code", "ean"],
        "brand": ["brand", "brand_name"],
        "manufacturer": ["manufacturer", "mfr", "mfg"],
        "model_number": ["model_number", "model", "model_no"],
        "is_active": ["is_active", "active", "status"],
        "is_hazardous": ["is_hazardous", "hazardous", "hazmat"],
        "requires_refrigeration": ["requires_refrigeration", "refrigerated", "cold_chain"],
        "shelf_life_days": ["shelf_life_days", "shelf_life", "expiry_days"],
    },
    "vendor": {
        "vendor_id": ["vendor_id", "id", "supplier_id"],
        "vendor_name": ["vendor_name", "name", "supplier_name"],
        "vendor_code": ["vendor_code", "code", "supplier_code"],
        "contact_email": ["contact_email", "email"],
        "contact_phone": ["contact_phone", "phone", "telephone"],
        "headquarters_address": ["headquarters_address", "address", "hq_address"],
        "headquarters_latitude": ["headquarters_latitude", "hq_lat", "lat"],
        "headquarters_longitude": ["headquarters_longitude", "hq_lon", "lon", "lng"],
        "payment_terms_days": ["payment_terms_days", "payment_terms", "terms"],
        "reliability_score": ["reliability_score", "reliability", "score"],
        "is_active": ["is_active", "active"],
    },
    "vendor_pricing": {
        "vendor_id": ["vendor_id", "supplier_id", "vendor"],
        "sku_id": ["sku_id", "sku", "product_id"],
        "unit_price": ["unit_price", "price", "cost", "unit_cost"],
        "currency_code": ["currency_code", "currency", "curr"],
        "market_id": ["market_id", "market", "region_id"],
        "min_order_quantity": ["min_order_quantity", "moq", "min_qty"],
        "bulk_discount_percentage": ["bulk_discount_percentage", "bulk_discount", "volume_discount"],
        "bulk_discount_threshold": ["bulk_discount_threshold", "discount_threshold", "volume_threshold"],
        "lead_time_days": ["lead_time_days", "lead_time", "delivery_days"],
        "stock_status": ["stock_status", "stock", "availability"],
        "source": ["source", "data_source"],
    },
    "geographic_market": {
        "market_id": ["market_id", "id", "region_id"],
        "region_name": ["region_name", "name", "region"],
        "country_code": ["country_code", "country", "cc"],
        "latitude": ["latitude", "lat"],
        "longitude": ["longitude", "lon", "lng"],
        "market_size_tier": ["market_size_tier", "tier", "size_tier"],
        "timezone": ["timezone", "tz", "time_zone"],
        "currency_code": ["currency_code", "currency"],
        "population_estimate": ["population_estimate", "population", "pop"],
    },
    "distribution_center": {
        "center_id": ["center_id", "id", "dc_id"],
        "center_name": ["center_name", "name", "dc_name"],
        "vendor_id": ["vendor_id", "supplier_id"],
        "address": ["address", "location"],
        "latitude": ["latitude", "lat"],
        "longitude": ["longitude", "lon", "lng"],
        "capacity_units": ["capacity_units", "capacity"],
        "market_id": ["market_id", "region_id"],
        "is_active": ["is_active", "active"],
    },
}


class CSVImporter:
    """
    Imports CSV data into PricePoint Intel.
    Supports flexible column mapping and validation.
    """

    def __init__(
        self,
        validator: Optional[DataValidator] = None,
        encoding: str = "utf-8",
        delimiter: str = ",",
        skip_header: bool = True,
    ):
        self.validator = validator or DataValidator()
        self.encoding = encoding
        self.delimiter = delimiter
        self.skip_header = skip_header

    def import_sku_products(
        self,
        file_path: str,
        column_mapping: Optional[Dict[str, str]] = None,
        on_row_imported: Optional[Callable[[Dict], None]] = None,
    ) -> ImportResult:
        """Import SKU products from CSV."""
        return self._import_file(
            file_path=file_path,
            data_type="sku_product",
            validate_fn=self.validator.validate_sku_product,
            column_mapping=column_mapping,
            on_row_imported=on_row_imported,
        )

    def import_vendors(
        self,
        file_path: str,
        column_mapping: Optional[Dict[str, str]] = None,
        on_row_imported: Optional[Callable[[Dict], None]] = None,
    ) -> ImportResult:
        """Import vendors from CSV."""
        return self._import_file(
            file_path=file_path,
            data_type="vendor",
            validate_fn=self.validator.validate_vendor,
            column_mapping=column_mapping,
            on_row_imported=on_row_imported,
        )

    def import_vendor_pricing(
        self,
        file_path: str,
        column_mapping: Optional[Dict[str, str]] = None,
        on_row_imported: Optional[Callable[[Dict], None]] = None,
    ) -> ImportResult:
        """Import vendor pricing from CSV."""
        return self._import_file(
            file_path=file_path,
            data_type="vendor_pricing",
            validate_fn=self.validator.validate_vendor_pricing,
            column_mapping=column_mapping,
            on_row_imported=on_row_imported,
        )

    def import_geographic_markets(
        self,
        file_path: str,
        column_mapping: Optional[Dict[str, str]] = None,
        on_row_imported: Optional[Callable[[Dict], None]] = None,
    ) -> ImportResult:
        """Import geographic markets from CSV."""
        return self._import_file(
            file_path=file_path,
            data_type="geographic_market",
            validate_fn=self.validator.validate_geographic_market,
            column_mapping=column_mapping,
            on_row_imported=on_row_imported,
        )

    def import_distribution_centers(
        self,
        file_path: str,
        column_mapping: Optional[Dict[str, str]] = None,
        on_row_imported: Optional[Callable[[Dict], None]] = None,
    ) -> ImportResult:
        """Import distribution centers from CSV."""
        return self._import_file(
            file_path=file_path,
            data_type="distribution_center",
            validate_fn=self.validator.validate_distribution_center,
            column_mapping=column_mapping,
            on_row_imported=on_row_imported,
        )

    def _import_file(
        self,
        file_path: str,
        data_type: str,
        validate_fn: Callable,
        column_mapping: Optional[Dict[str, str]] = None,
        on_row_imported: Optional[Callable[[Dict], None]] = None,
    ) -> ImportResult:
        """
        Generic file import method.

        Args:
            file_path: Path to the CSV file
            data_type: Type of data being imported
            validate_fn: Validation function to use
            column_mapping: Optional custom column mapping
            on_row_imported: Optional callback for each imported row

        Returns:
            ImportResult with details of the import
        """
        result = ImportResult(
            success=True,
            source_file=file_path,
            started_at=datetime.now(),
        )

        path = Path(file_path)
        if not path.exists():
            result.success = False
            result.add_error(0, f"File not found: {file_path}")
            result.completed_at = datetime.now()
            return result

        try:
            with open(path, "r", encoding=self.encoding, newline="") as f:
                # Detect dialect if possible
                sample = f.read(4096)
                f.seek(0)

                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
                except csv.Error:
                    dialect = None

                reader = csv.DictReader(
                    f,
                    delimiter=dialect.delimiter if dialect else self.delimiter,
                )

                # Get header row
                headers = reader.fieldnames
                if not headers:
                    result.success = False
                    result.add_error(0, "CSV file appears to be empty or has no headers")
                    result.completed_at = datetime.now()
                    return result

                # Build column mapping
                mapping = self._build_column_mapping(
                    headers, data_type, column_mapping
                )

                logger.info(f"Importing {data_type} from {file_path}")
                logger.debug(f"Column mapping: {mapping}")

                # Process rows
                for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is 1)
                    result.records_total += 1

                    try:
                        # Map columns
                        mapped_data = self._map_row(row, mapping)

                        # Generate ID if not present
                        id_field = self._get_id_field(data_type)
                        if id_field and not mapped_data.get(id_field):
                            mapped_data[id_field] = str(uuid.uuid4())

                        # Validate
                        validation = validate_fn(mapped_data, row_index=row_num)
                        result.records_processed += 1

                        if validation.is_valid:
                            # Use cleaned data if available
                            final_data = validation.cleaned_data or mapped_data
                            result.imported_data.append(final_data)
                            result.records_success += 1

                            if on_row_imported:
                                on_row_imported(final_data)
                        else:
                            result.records_failed += 1
                            for error in validation.errors:
                                result.add_error(row_num, error.message, mapped_data)

                        # Add warnings
                        for warning in validation.warnings:
                            result.add_warning(row_num, warning.message)

                    except Exception as e:
                        result.records_failed += 1
                        result.add_error(row_num, f"Error processing row: {str(e)}")
                        logger.exception(f"Error processing row {row_num}")

        except csv.Error as e:
            result.success = False
            result.add_error(0, f"CSV parsing error: {str(e)}")
        except UnicodeDecodeError as e:
            result.success = False
            result.add_error(0, f"Encoding error: {str(e)}. Try a different encoding.")
        except Exception as e:
            result.success = False
            result.add_error(0, f"Unexpected error: {str(e)}")
            logger.exception("Unexpected error during CSV import")

        result.completed_at = datetime.now()

        if result.records_failed > 0:
            result.success = False

        logger.info(
            f"Import complete: {result.records_success}/{result.records_total} records imported"
        )

        return result

    def _build_column_mapping(
        self,
        headers: List[str],
        data_type: str,
        custom_mapping: Optional[Dict[str, str]] = None,
    ) -> Dict[str, str]:
        """
        Build a mapping from CSV columns to data fields.

        Args:
            headers: List of CSV column headers
            data_type: Type of data being imported
            custom_mapping: Optional custom mapping override

        Returns:
            Dict mapping field names to CSV column names
        """
        if custom_mapping:
            return custom_mapping

        mapping = {}
        field_mappings = COLUMN_MAPPINGS.get(data_type, {})

        # Normalize headers for matching
        normalized_headers = {h.lower().strip().replace(" ", "_"): h for h in headers}

        for field, aliases in field_mappings.items():
            for alias in aliases:
                norm_alias = alias.lower().strip().replace(" ", "_")
                if norm_alias in normalized_headers:
                    mapping[field] = normalized_headers[norm_alias]
                    break

        return mapping

    def _map_row(self, row: Dict[str, str], mapping: Dict[str, str]) -> Dict[str, Any]:
        """Map a CSV row to data fields using the column mapping."""
        mapped = {}
        for field, column in mapping.items():
            if column in row:
                value = row[column]
                # Handle empty strings
                if isinstance(value, str) and value.strip() == "":
                    value = None
                mapped[field] = value
        return mapped

    def _get_id_field(self, data_type: str) -> Optional[str]:
        """Get the ID field name for a data type."""
        id_fields = {
            "sku_product": "sku_id",
            "vendor": "vendor_id",
            "vendor_pricing": "pricing_id",
            "geographic_market": "market_id",
            "distribution_center": "center_id",
        }
        return id_fields.get(data_type)

    def preview(
        self,
        file_path: str,
        data_type: str,
        max_rows: int = 5,
        column_mapping: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Preview a CSV file without importing.

        Args:
            file_path: Path to the CSV file
            data_type: Type of data to validate as
            max_rows: Maximum rows to preview
            column_mapping: Optional custom column mapping

        Returns:
            Dict with preview information
        """
        path = Path(file_path)
        if not path.exists():
            return {"error": f"File not found: {file_path}"}

        try:
            with open(path, "r", encoding=self.encoding, newline="") as f:
                reader = csv.DictReader(f, delimiter=self.delimiter)
                headers = reader.fieldnames

                mapping = self._build_column_mapping(
                    headers or [], data_type, column_mapping
                )

                # Get sample rows
                sample_rows = []
                for i, row in enumerate(reader):
                    if i >= max_rows:
                        break
                    mapped = self._map_row(row, mapping)
                    sample_rows.append(mapped)

                # Count total rows
                f.seek(0)
                total_rows = sum(1 for _ in f) - 1  # Subtract header

            return {
                "file_path": str(path),
                "headers": headers,
                "column_mapping": mapping,
                "unmapped_columns": [h for h in (headers or []) if h not in mapping.values()],
                "unmapped_fields": [f for f in COLUMN_MAPPINGS.get(data_type, {}).keys() if f not in mapping],
                "sample_rows": sample_rows,
                "total_rows": total_rows,
            }

        except Exception as e:
            return {"error": str(e)}
