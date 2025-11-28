"""
Main data ingestion pipeline for PricePoint Intel.
Orchestrates CSV, Excel, and API imports with database persistence.
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field
import json

from .csv_importer import CSVImporter, ImportResult
from .excel_importer import ExcelImporter
from .api_connector import APIConnector, APIEndpointConfig, FetchResult
from .validator import DataValidator

# Database imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from database.models import (
    get_engine,
    get_session,
    init_database,
    SKUProduct,
    Vendor,
    VendorPricing,
    GeographicMarket,
    DistributionCenter,
    ProductCategory,
    PricingHistory,
    IngestionLog,
)

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    """Results from a pipeline operation."""

    success: bool
    operation: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    records_imported: int = 0
    records_failed: int = 0
    errors: List[Dict] = field(default_factory=list)
    warnings: List[Dict] = field(default_factory=list)
    log_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "operation": self.operation,
            "log_id": self.log_id,
            "records_imported": self.records_imported,
            "records_failed": self.records_failed,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": (
                (self.completed_at - self.started_at).total_seconds()
                if self.started_at and self.completed_at else None
            ),
        }


class IngestionPipeline:
    """
    Main pipeline for ingesting pricing and SKU data.
    Coordinates file imports and API fetches with database persistence.
    """

    def __init__(
        self,
        database_url: Optional[str] = None,
        validator: Optional[DataValidator] = None,
    ):
        self.database_url = database_url
        self.validator = validator or DataValidator()

        # Initialize importers
        self.csv_importer = CSVImporter(validator=self.validator)
        self.excel_importer = ExcelImporter(validator=self.validator)
        self.api_connector = APIConnector(validator=self.validator)

        # Database session
        self._engine = None
        self._session = None

    def _get_engine(self):
        """Get or create database engine."""
        if self._engine is None:
            self._engine = get_engine(self.database_url)
        return self._engine

    def _get_session(self):
        """Get or create database session."""
        if self._session is None:
            self._session = get_session(self._get_engine())
        return self._session

    def init_database(self) -> bool:
        """Initialize the database schema."""
        try:
            init_database(self.database_url)
            logger.info("Database initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            return False

    def _create_ingestion_log(
        self,
        source_type: str,
        source_name: str,
        created_by: Optional[str] = None,
    ) -> IngestionLog:
        """Create an ingestion log entry."""
        session = self._get_session()
        log = IngestionLog(
            source_type=source_type,
            source_name=source_name,
            status="pending",
            created_by=created_by,
            started_at=datetime.now(),
        )
        session.add(log)
        session.commit()
        return log

    def _update_ingestion_log(
        self,
        log: IngestionLog,
        status: str,
        records_total: int = 0,
        records_processed: int = 0,
        records_success: int = 0,
        records_failed: int = 0,
        records_skipped: int = 0,
        errors: Optional[List[Dict]] = None,
        warnings: Optional[List[Dict]] = None,
    ):
        """Update an ingestion log entry."""
        session = self._get_session()
        log.status = status
        log.records_total = records_total
        log.records_processed = records_processed
        log.records_success = records_success
        log.records_failed = records_failed
        log.records_skipped = records_skipped
        log.completed_at = datetime.now()

        if errors:
            log.error_messages = json.dumps(errors[:50])  # Limit to 50 errors
        if warnings:
            log.warnings = json.dumps(warnings[:50])

        session.commit()

    def import_sku_products_from_csv(
        self,
        file_path: str,
        column_mapping: Optional[Dict[str, str]] = None,
        created_by: Optional[str] = None,
    ) -> PipelineResult:
        """
        Import SKU products from a CSV file.

        Args:
            file_path: Path to the CSV file
            column_mapping: Optional custom column mapping
            created_by: Optional user identifier

        Returns:
            PipelineResult with import details
        """
        result = PipelineResult(
            success=True,
            operation="import_sku_products_csv",
            started_at=datetime.now(),
        )

        # Create ingestion log
        log = self._create_ingestion_log("csv", file_path, created_by)
        result.log_id = log.log_id

        try:
            log.status = "processing"
            self._get_session().commit()

            # Import from CSV
            import_result = self.csv_importer.import_sku_products(
                file_path, column_mapping
            )

            # Persist to database
            session = self._get_session()
            for data in import_result.imported_data:
                try:
                    product = SKUProduct(
                        sku_id=data.get("sku_id"),
                        product_name=data.get("product_name"),
                        description=data.get("description"),
                        category_id=data.get("category_id"),
                        length_cm=data.get("length_cm"),
                        width_cm=data.get("width_cm"),
                        height_cm=data.get("height_cm"),
                        weight_kg=data.get("weight_kg"),
                        upc_code=data.get("upc_code"),
                        ean_code=data.get("ean_code"),
                        brand=data.get("brand"),
                        manufacturer=data.get("manufacturer"),
                        model_number=data.get("model_number"),
                        is_active=data.get("is_active", True),
                        is_hazardous=data.get("is_hazardous", False),
                        requires_refrigeration=data.get("requires_refrigeration", False),
                        shelf_life_days=data.get("shelf_life_days"),
                    )
                    session.merge(product)
                    result.records_imported += 1
                except Exception as e:
                    result.records_failed += 1
                    result.errors.append({
                        "sku_id": data.get("sku_id"),
                        "error": str(e),
                    })

            session.commit()

            # Update log
            self._update_ingestion_log(
                log,
                status="completed" if result.records_failed == 0 else "partial",
                records_total=import_result.records_total,
                records_processed=import_result.records_processed,
                records_success=result.records_imported,
                records_failed=result.records_failed,
                errors=result.errors,
            )

        except Exception as e:
            result.success = False
            result.errors.append({"error": str(e)})
            self._update_ingestion_log(log, status="failed", errors=[{"error": str(e)}])
            logger.exception("Failed to import SKU products")

        result.completed_at = datetime.now()
        return result

    def import_vendors_from_csv(
        self,
        file_path: str,
        column_mapping: Optional[Dict[str, str]] = None,
        created_by: Optional[str] = None,
    ) -> PipelineResult:
        """Import vendors from a CSV file."""
        result = PipelineResult(
            success=True,
            operation="import_vendors_csv",
            started_at=datetime.now(),
        )

        log = self._create_ingestion_log("csv", file_path, created_by)
        result.log_id = log.log_id

        try:
            log.status = "processing"
            self._get_session().commit()

            import_result = self.csv_importer.import_vendors(file_path, column_mapping)

            session = self._get_session()
            for data in import_result.imported_data:
                try:
                    vendor = Vendor(
                        vendor_id=data.get("vendor_id"),
                        vendor_name=data.get("vendor_name"),
                        vendor_code=data.get("vendor_code"),
                        contact_email=data.get("contact_email"),
                        contact_phone=data.get("contact_phone"),
                        headquarters_address=data.get("headquarters_address"),
                        headquarters_latitude=data.get("headquarters_latitude"),
                        headquarters_longitude=data.get("headquarters_longitude"),
                        payment_terms_days=data.get("payment_terms_days", 30),
                        reliability_score=data.get("reliability_score"),
                        is_active=data.get("is_active", True),
                    )
                    session.merge(vendor)
                    result.records_imported += 1
                except Exception as e:
                    result.records_failed += 1
                    result.errors.append({
                        "vendor_id": data.get("vendor_id"),
                        "error": str(e),
                    })

            session.commit()

            self._update_ingestion_log(
                log,
                status="completed" if result.records_failed == 0 else "partial",
                records_total=import_result.records_total,
                records_processed=import_result.records_processed,
                records_success=result.records_imported,
                records_failed=result.records_failed,
                errors=result.errors,
            )

        except Exception as e:
            result.success = False
            result.errors.append({"error": str(e)})
            self._update_ingestion_log(log, status="failed", errors=[{"error": str(e)}])
            logger.exception("Failed to import vendors")

        result.completed_at = datetime.now()
        return result

    def import_vendor_pricing_from_csv(
        self,
        file_path: str,
        column_mapping: Optional[Dict[str, str]] = None,
        created_by: Optional[str] = None,
        track_history: bool = True,
    ) -> PipelineResult:
        """Import vendor pricing from a CSV file."""
        result = PipelineResult(
            success=True,
            operation="import_vendor_pricing_csv",
            started_at=datetime.now(),
        )

        log = self._create_ingestion_log("csv", file_path, created_by)
        result.log_id = log.log_id

        try:
            log.status = "processing"
            self._get_session().commit()

            import_result = self.csv_importer.import_vendor_pricing(
                file_path, column_mapping
            )

            session = self._get_session()
            for data in import_result.imported_data:
                try:
                    # Mark existing current prices as not current
                    session.query(VendorPricing).filter(
                        VendorPricing.vendor_id == data.get("vendor_id"),
                        VendorPricing.sku_id == data.get("sku_id"),
                        VendorPricing.market_id == data.get("market_id"),
                        VendorPricing.is_current == True,
                    ).update({"is_current": False})

                    pricing = VendorPricing(
                        pricing_id=data.get("pricing_id"),
                        vendor_id=data.get("vendor_id"),
                        sku_id=data.get("sku_id"),
                        unit_price=data.get("unit_price"),
                        currency_code=data.get("currency_code", "USD"),
                        min_order_quantity=data.get("min_order_quantity", 1),
                        bulk_discount_percentage=data.get("bulk_discount_percentage"),
                        bulk_discount_threshold=data.get("bulk_discount_threshold"),
                        market_id=data.get("market_id"),
                        lead_time_days=data.get("lead_time_days"),
                        stock_status=data.get("stock_status", "in_stock"),
                        is_current=True,
                        source="csv",
                    )
                    session.add(pricing)
                    session.flush()

                    # Track history
                    if track_history:
                        history = PricingHistory(
                            pricing_id=pricing.pricing_id,
                            vendor_id=pricing.vendor_id,
                            sku_id=pricing.sku_id,
                            market_id=pricing.market_id,
                            unit_price=pricing.unit_price,
                            currency_code=pricing.currency_code,
                            source="csv",
                        )
                        session.add(history)

                    result.records_imported += 1
                except Exception as e:
                    result.records_failed += 1
                    result.errors.append({
                        "vendor_id": data.get("vendor_id"),
                        "sku_id": data.get("sku_id"),
                        "error": str(e),
                    })

            session.commit()

            self._update_ingestion_log(
                log,
                status="completed" if result.records_failed == 0 else "partial",
                records_total=import_result.records_total,
                records_processed=import_result.records_processed,
                records_success=result.records_imported,
                records_failed=result.records_failed,
                errors=result.errors,
            )

        except Exception as e:
            result.success = False
            result.errors.append({"error": str(e)})
            self._update_ingestion_log(log, status="failed", errors=[{"error": str(e)}])
            logger.exception("Failed to import vendor pricing")

        result.completed_at = datetime.now()
        return result

    def import_geographic_markets_from_csv(
        self,
        file_path: str,
        column_mapping: Optional[Dict[str, str]] = None,
        created_by: Optional[str] = None,
    ) -> PipelineResult:
        """Import geographic markets from a CSV file."""
        result = PipelineResult(
            success=True,
            operation="import_geographic_markets_csv",
            started_at=datetime.now(),
        )

        log = self._create_ingestion_log("csv", file_path, created_by)
        result.log_id = log.log_id

        try:
            log.status = "processing"
            self._get_session().commit()

            import_result = self.csv_importer.import_geographic_markets(
                file_path, column_mapping
            )

            session = self._get_session()
            for data in import_result.imported_data:
                try:
                    market = GeographicMarket(
                        market_id=data.get("market_id"),
                        region_name=data.get("region_name"),
                        country_code=data.get("country_code", "US"),
                        latitude=data.get("latitude"),
                        longitude=data.get("longitude"),
                        market_size_tier=data.get("market_size_tier"),
                        timezone=data.get("timezone"),
                        currency_code=data.get("currency_code", "USD"),
                        population_estimate=data.get("population_estimate"),
                    )
                    session.merge(market)
                    result.records_imported += 1
                except Exception as e:
                    result.records_failed += 1
                    result.errors.append({
                        "market_id": data.get("market_id"),
                        "error": str(e),
                    })

            session.commit()

            self._update_ingestion_log(
                log,
                status="completed" if result.records_failed == 0 else "partial",
                records_total=import_result.records_total,
                records_processed=import_result.records_processed,
                records_success=result.records_imported,
                records_failed=result.records_failed,
                errors=result.errors,
            )

        except Exception as e:
            result.success = False
            result.errors.append({"error": str(e)})
            self._update_ingestion_log(log, status="failed", errors=[{"error": str(e)}])
            logger.exception("Failed to import geographic markets")

        result.completed_at = datetime.now()
        return result

    def import_from_excel(
        self,
        file_path: str,
        sheet_mapping: Optional[Dict[str, str]] = None,
        created_by: Optional[str] = None,
    ) -> Dict[str, PipelineResult]:
        """
        Import data from an Excel workbook with multiple sheets.

        Args:
            file_path: Path to the Excel file
            sheet_mapping: Dict mapping sheet names to data types
            created_by: Optional user identifier

        Returns:
            Dict mapping sheet names to PipelineResults
        """
        results = {}

        sheet_names = self.excel_importer.get_sheet_names(file_path)
        if not sheet_names:
            return {"error": PipelineResult(
                success=False,
                operation="import_excel",
                errors=[{"error": "Could not read Excel file or no sheets found"}],
            )}

        # Auto-detect sheet types if not provided
        if not sheet_mapping:
            sheet_mapping = {}
            for name in sheet_names:
                lower_name = name.lower()
                if any(k in lower_name for k in ["sku", "product"]):
                    sheet_mapping[name] = "sku_product"
                elif any(k in lower_name for k in ["vendor", "supplier"]):
                    sheet_mapping[name] = "vendor"
                elif any(k in lower_name for k in ["price", "pricing", "cost"]):
                    sheet_mapping[name] = "vendor_pricing"
                elif any(k in lower_name for k in ["market", "region", "geo"]):
                    sheet_mapping[name] = "geographic_market"

        for sheet_name, data_type in sheet_mapping.items():
            if data_type == "sku_product":
                import_result = self.excel_importer.import_sku_products(
                    file_path, sheet_name
                )
                results[sheet_name] = self._persist_sku_products(
                    import_result, "excel", file_path, created_by
                )
            elif data_type == "vendor":
                import_result = self.excel_importer.import_vendors(
                    file_path, sheet_name
                )
                results[sheet_name] = self._persist_vendors(
                    import_result, "excel", file_path, created_by
                )
            elif data_type == "vendor_pricing":
                import_result = self.excel_importer.import_vendor_pricing(
                    file_path, sheet_name
                )
                results[sheet_name] = self._persist_vendor_pricing(
                    import_result, "excel", file_path, created_by
                )
            elif data_type == "geographic_market":
                import_result = self.excel_importer.import_geographic_markets(
                    file_path, sheet_name
                )
                results[sheet_name] = self._persist_geographic_markets(
                    import_result, "excel", file_path, created_by
                )

        return results

    def fetch_from_api(
        self,
        config: APIEndpointConfig,
        data_type: str = "vendor_pricing",
        vendor_id: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        field_mapping: Optional[Dict[str, str]] = None,
        created_by: Optional[str] = None,
    ) -> PipelineResult:
        """
        Fetch data from an API endpoint and persist to database.

        Args:
            config: API endpoint configuration
            data_type: Type of data to fetch
            vendor_id: Vendor ID (required for vendor_pricing)
            params: Optional query parameters
            field_mapping: Optional field mapping
            created_by: Optional user identifier

        Returns:
            PipelineResult with fetch details
        """
        result = PipelineResult(
            success=True,
            operation=f"fetch_{data_type}_api",
            started_at=datetime.now(),
        )

        log = self._create_ingestion_log("api", config.url, created_by)
        result.log_id = log.log_id

        try:
            log.status = "processing"
            self._get_session().commit()

            if data_type == "vendor_pricing":
                if not vendor_id:
                    raise ValueError("vendor_id is required for vendor_pricing")
                fetch_result = self.api_connector.fetch_vendor_pricing(
                    config, vendor_id, params, field_mapping
                )
                pipeline_result = self._persist_vendor_pricing_from_api(
                    fetch_result, log
                )
            else:
                fetch_result = self.api_connector.fetch_sku_products(
                    config, params, field_mapping
                )
                pipeline_result = self._persist_sku_products_from_api(
                    fetch_result, log
                )

            result.records_imported = pipeline_result.records_imported
            result.records_failed = pipeline_result.records_failed
            result.errors = pipeline_result.errors

            self._update_ingestion_log(
                log,
                status="completed" if result.records_failed == 0 else "partial",
                records_total=fetch_result.records_fetched,
                records_processed=fetch_result.records_valid + fetch_result.records_invalid,
                records_success=result.records_imported,
                records_failed=result.records_failed,
                errors=result.errors,
            )

        except Exception as e:
            result.success = False
            result.errors.append({"error": str(e)})
            self._update_ingestion_log(log, status="failed", errors=[{"error": str(e)}])
            logger.exception("Failed to fetch from API")

        result.completed_at = datetime.now()
        return result

    def _persist_sku_products(
        self,
        import_result: ImportResult,
        source_type: str,
        source_name: str,
        created_by: Optional[str] = None,
    ) -> PipelineResult:
        """Persist SKU products to database."""
        result = PipelineResult(
            success=True,
            operation=f"persist_sku_products_{source_type}",
            started_at=datetime.now(),
        )

        log = self._create_ingestion_log(source_type, source_name, created_by)
        result.log_id = log.log_id

        session = self._get_session()
        for data in import_result.imported_data:
            try:
                product = SKUProduct(
                    sku_id=data.get("sku_id"),
                    product_name=data.get("product_name"),
                    description=data.get("description"),
                    category_id=data.get("category_id"),
                    length_cm=data.get("length_cm"),
                    width_cm=data.get("width_cm"),
                    height_cm=data.get("height_cm"),
                    weight_kg=data.get("weight_kg"),
                    upc_code=data.get("upc_code"),
                    ean_code=data.get("ean_code"),
                    brand=data.get("brand"),
                    manufacturer=data.get("manufacturer"),
                    model_number=data.get("model_number"),
                    is_active=data.get("is_active", True),
                )
                session.merge(product)
                result.records_imported += 1
            except Exception as e:
                result.records_failed += 1
                result.errors.append({"sku_id": data.get("sku_id"), "error": str(e)})

        session.commit()
        result.completed_at = datetime.now()
        return result

    def _persist_vendors(
        self,
        import_result: ImportResult,
        source_type: str,
        source_name: str,
        created_by: Optional[str] = None,
    ) -> PipelineResult:
        """Persist vendors to database."""
        result = PipelineResult(
            success=True,
            operation=f"persist_vendors_{source_type}",
            started_at=datetime.now(),
        )

        session = self._get_session()
        for data in import_result.imported_data:
            try:
                vendor = Vendor(
                    vendor_id=data.get("vendor_id"),
                    vendor_name=data.get("vendor_name"),
                    vendor_code=data.get("vendor_code"),
                    contact_email=data.get("contact_email"),
                    contact_phone=data.get("contact_phone"),
                    headquarters_address=data.get("headquarters_address"),
                    headquarters_latitude=data.get("headquarters_latitude"),
                    headquarters_longitude=data.get("headquarters_longitude"),
                    payment_terms_days=data.get("payment_terms_days", 30),
                    reliability_score=data.get("reliability_score"),
                    is_active=data.get("is_active", True),
                )
                session.merge(vendor)
                result.records_imported += 1
            except Exception as e:
                result.records_failed += 1
                result.errors.append({"vendor_id": data.get("vendor_id"), "error": str(e)})

        session.commit()
        result.completed_at = datetime.now()
        return result

    def _persist_vendor_pricing(
        self,
        import_result: ImportResult,
        source_type: str,
        source_name: str,
        created_by: Optional[str] = None,
    ) -> PipelineResult:
        """Persist vendor pricing to database."""
        result = PipelineResult(
            success=True,
            operation=f"persist_vendor_pricing_{source_type}",
            started_at=datetime.now(),
        )

        session = self._get_session()
        for data in import_result.imported_data:
            try:
                pricing = VendorPricing(
                    pricing_id=data.get("pricing_id"),
                    vendor_id=data.get("vendor_id"),
                    sku_id=data.get("sku_id"),
                    unit_price=data.get("unit_price"),
                    currency_code=data.get("currency_code", "USD"),
                    market_id=data.get("market_id"),
                    stock_status=data.get("stock_status", "in_stock"),
                    is_current=True,
                    source=source_type,
                )
                session.merge(pricing)
                result.records_imported += 1
            except Exception as e:
                result.records_failed += 1
                result.errors.append({
                    "vendor_id": data.get("vendor_id"),
                    "sku_id": data.get("sku_id"),
                    "error": str(e),
                })

        session.commit()
        result.completed_at = datetime.now()
        return result

    def _persist_geographic_markets(
        self,
        import_result: ImportResult,
        source_type: str,
        source_name: str,
        created_by: Optional[str] = None,
    ) -> PipelineResult:
        """Persist geographic markets to database."""
        result = PipelineResult(
            success=True,
            operation=f"persist_geographic_markets_{source_type}",
            started_at=datetime.now(),
        )

        session = self._get_session()
        for data in import_result.imported_data:
            try:
                market = GeographicMarket(
                    market_id=data.get("market_id"),
                    region_name=data.get("region_name"),
                    country_code=data.get("country_code", "US"),
                    latitude=data.get("latitude"),
                    longitude=data.get("longitude"),
                    market_size_tier=data.get("market_size_tier"),
                    timezone=data.get("timezone"),
                    currency_code=data.get("currency_code", "USD"),
                    population_estimate=data.get("population_estimate"),
                )
                session.merge(market)
                result.records_imported += 1
            except Exception as e:
                result.records_failed += 1
                result.errors.append({"market_id": data.get("market_id"), "error": str(e)})

        session.commit()
        result.completed_at = datetime.now()
        return result

    def _persist_vendor_pricing_from_api(
        self,
        fetch_result: FetchResult,
        log: IngestionLog,
    ) -> PipelineResult:
        """Persist vendor pricing from API fetch to database."""
        result = PipelineResult(
            success=True,
            operation="persist_vendor_pricing_api",
            started_at=datetime.now(),
        )

        session = self._get_session()
        for data in fetch_result.fetched_data:
            try:
                pricing = VendorPricing(
                    pricing_id=data.get("pricing_id"),
                    vendor_id=data.get("vendor_id"),
                    sku_id=data.get("sku_id"),
                    unit_price=data.get("unit_price"),
                    currency_code=data.get("currency_code", "USD"),
                    market_id=data.get("market_id"),
                    stock_status=data.get("stock_status", "in_stock"),
                    is_current=True,
                    source="api",
                )
                session.merge(pricing)
                result.records_imported += 1
            except Exception as e:
                result.records_failed += 1
                result.errors.append({
                    "vendor_id": data.get("vendor_id"),
                    "sku_id": data.get("sku_id"),
                    "error": str(e),
                })

        session.commit()
        result.completed_at = datetime.now()
        return result

    def _persist_sku_products_from_api(
        self,
        fetch_result: FetchResult,
        log: IngestionLog,
    ) -> PipelineResult:
        """Persist SKU products from API fetch to database."""
        result = PipelineResult(
            success=True,
            operation="persist_sku_products_api",
            started_at=datetime.now(),
        )

        session = self._get_session()
        for data in fetch_result.fetched_data:
            try:
                product = SKUProduct(
                    sku_id=data.get("sku_id"),
                    product_name=data.get("product_name"),
                    description=data.get("description"),
                    brand=data.get("brand"),
                    category_id=data.get("category_id"),
                    upc_code=data.get("upc_code"),
                    weight_kg=data.get("weight_kg"),
                    is_active=True,
                )
                session.merge(product)
                result.records_imported += 1
            except Exception as e:
                result.records_failed += 1
                result.errors.append({"sku_id": data.get("sku_id"), "error": str(e)})

        session.commit()
        result.completed_at = datetime.now()
        return result

    def close(self):
        """Close database connections."""
        if self._session:
            self._session.close()
            self._session = None
        if self._engine:
            self._engine.dispose()
            self._engine = None
        self.api_connector.close()
