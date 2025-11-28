"""
API connector for real-time pricing feeds.
Supports JSON endpoints with authentication and rate limiting.
"""

import logging
import time
import json
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from urllib.parse import urljoin
import uuid

# Optional requests import
try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

from .validator import DataValidator, ValidationResult

logger = logging.getLogger(__name__)


@dataclass
class APIResponse:
    """Represents a response from an API call."""

    success: bool
    status_code: Optional[int] = None
    data: Optional[Any] = None
    error: Optional[str] = None
    response_time_ms: Optional[float] = None
    headers: Optional[Dict[str, str]] = None


@dataclass
class FetchResult:
    """Results from an API fetch operation."""

    success: bool
    endpoint: str
    records_fetched: int = 0
    records_valid: int = 0
    records_invalid: int = 0
    errors: List[Dict] = field(default_factory=list)
    warnings: List[Dict] = field(default_factory=list)
    fetched_data: List[Dict] = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    api_response: Optional[APIResponse] = None

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "endpoint": self.endpoint,
            "records_fetched": self.records_fetched,
            "records_valid": self.records_valid,
            "records_invalid": self.records_invalid,
            "error_count": len(self.errors),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


@dataclass
class APIEndpointConfig:
    """Configuration for an API endpoint."""

    url: str
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None
    auth_type: Optional[str] = None  # "bearer", "api_key", "basic"
    auth_token: Optional[str] = None
    api_key_header: Optional[str] = None
    api_key_value: Optional[str] = None
    timeout_seconds: int = 30
    retry_count: int = 3
    retry_backoff_factor: float = 0.5
    rate_limit_requests: Optional[int] = None  # Max requests per window
    rate_limit_window_seconds: int = 60
    data_path: Optional[str] = None  # JSON path to data array (e.g., "data.items")
    pagination_type: Optional[str] = None  # "offset", "cursor", "page"
    pagination_param: Optional[str] = None
    page_size: int = 100


class RateLimiter:
    """Simple rate limiter for API requests."""

    def __init__(self, max_requests: int, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: List[float] = []

    def acquire(self) -> bool:
        """
        Acquire a request slot. Returns True if allowed, False if rate limited.
        Blocks if necessary to wait for a slot.
        """
        now = time.time()
        window_start = now - self.window_seconds

        # Remove old requests outside the window
        self.requests = [t for t in self.requests if t > window_start]

        if len(self.requests) >= self.max_requests:
            # Calculate wait time
            oldest_request = min(self.requests)
            wait_time = oldest_request + self.window_seconds - now
            if wait_time > 0:
                logger.debug(f"Rate limit reached, waiting {wait_time:.2f}s")
                time.sleep(wait_time)
                return self.acquire()

        self.requests.append(now)
        return True


class APIConnector:
    """
    Connects to external APIs to fetch real-time pricing data.
    Supports JSON endpoints with various authentication methods.
    """

    def __init__(
        self,
        validator: Optional[DataValidator] = None,
        default_headers: Optional[Dict[str, str]] = None,
    ):
        if not REQUESTS_AVAILABLE:
            logger.warning(
                "requests library not installed. API connector will not be available. "
                "Install with: pip install requests"
            )

        self.validator = validator or DataValidator()
        self.default_headers = default_headers or {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        self._rate_limiters: Dict[str, RateLimiter] = {}
        self._session: Optional[Any] = None

    def _get_session(self) -> Any:
        """Get or create a requests session with retry logic."""
        if not REQUESTS_AVAILABLE:
            raise RuntimeError("requests library not installed")

        if self._session is None:
            self._session = requests.Session()

            # Configure retries
            retry_strategy = Retry(
                total=3,
                backoff_factor=0.5,
                status_forcelist=[429, 500, 502, 503, 504],
            )
            adapter = HTTPAdapter(max_retries=retry_strategy)
            self._session.mount("http://", adapter)
            self._session.mount("https://", adapter)

        return self._session

    def _build_headers(
        self,
        config: APIEndpointConfig,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, str]:
        """Build request headers with authentication."""
        headers = {**self.default_headers}

        if config.headers:
            headers.update(config.headers)

        if extra_headers:
            headers.update(extra_headers)

        # Add authentication
        if config.auth_type == "bearer" and config.auth_token:
            headers["Authorization"] = f"Bearer {config.auth_token}"
        elif config.auth_type == "api_key" and config.api_key_header and config.api_key_value:
            headers[config.api_key_header] = config.api_key_value

        return headers

    def _get_rate_limiter(self, endpoint: str, config: APIEndpointConfig) -> Optional[RateLimiter]:
        """Get or create a rate limiter for an endpoint."""
        if config.rate_limit_requests is None:
            return None

        if endpoint not in self._rate_limiters:
            self._rate_limiters[endpoint] = RateLimiter(
                config.rate_limit_requests,
                config.rate_limit_window_seconds,
            )

        return self._rate_limiters[endpoint]

    def _extract_data(self, response_json: Any, data_path: Optional[str]) -> List[Dict]:
        """Extract data array from response using dot notation path."""
        if data_path is None:
            if isinstance(response_json, list):
                return response_json
            elif isinstance(response_json, dict):
                # Try common paths
                for key in ["data", "items", "results", "records"]:
                    if key in response_json and isinstance(response_json[key], list):
                        return response_json[key]
                return [response_json]
            return []

        # Navigate dot notation path
        current = response_json
        for part in data_path.split("."):
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return []

        if isinstance(current, list):
            return current
        return [current] if current else []

    def fetch(
        self,
        config: APIEndpointConfig,
        params: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
    ) -> APIResponse:
        """
        Make a single API request.

        Args:
            config: API endpoint configuration
            params: Optional query parameters
            body: Optional request body for POST/PUT

        Returns:
            APIResponse with the result
        """
        if not REQUESTS_AVAILABLE:
            return APIResponse(
                success=False,
                error="requests library not installed"
            )

        # Rate limiting
        rate_limiter = self._get_rate_limiter(config.url, config)
        if rate_limiter:
            rate_limiter.acquire()

        session = self._get_session()
        headers = self._build_headers(config)

        start_time = time.time()

        try:
            if config.method.upper() == "GET":
                response = session.get(
                    config.url,
                    headers=headers,
                    params=params,
                    timeout=config.timeout_seconds,
                )
            elif config.method.upper() == "POST":
                response = session.post(
                    config.url,
                    headers=headers,
                    params=params,
                    json=body,
                    timeout=config.timeout_seconds,
                )
            else:
                return APIResponse(
                    success=False,
                    error=f"Unsupported method: {config.method}"
                )

            response_time_ms = (time.time() - start_time) * 1000

            if response.status_code >= 400:
                return APIResponse(
                    success=False,
                    status_code=response.status_code,
                    error=f"HTTP {response.status_code}: {response.text[:200]}",
                    response_time_ms=response_time_ms,
                    headers=dict(response.headers),
                )

            try:
                data = response.json()
            except json.JSONDecodeError:
                data = response.text

            return APIResponse(
                success=True,
                status_code=response.status_code,
                data=data,
                response_time_ms=response_time_ms,
                headers=dict(response.headers),
            )

        except requests.exceptions.Timeout:
            return APIResponse(
                success=False,
                error=f"Request timed out after {config.timeout_seconds}s"
            )
        except requests.exceptions.ConnectionError as e:
            return APIResponse(
                success=False,
                error=f"Connection error: {str(e)}"
            )
        except Exception as e:
            return APIResponse(
                success=False,
                error=f"Unexpected error: {str(e)}"
            )

    def fetch_vendor_pricing(
        self,
        config: APIEndpointConfig,
        vendor_id: str,
        params: Optional[Dict[str, Any]] = None,
        field_mapping: Optional[Dict[str, str]] = None,
        on_record_fetched: Optional[Callable[[Dict], None]] = None,
    ) -> FetchResult:
        """
        Fetch vendor pricing data from an API endpoint.

        Args:
            config: API endpoint configuration
            vendor_id: Vendor ID to associate with fetched pricing
            params: Optional query parameters
            field_mapping: Optional mapping from API fields to our schema
            on_record_fetched: Optional callback for each fetched record

        Returns:
            FetchResult with the fetched and validated data
        """
        result = FetchResult(
            success=True,
            endpoint=config.url,
            started_at=datetime.now(),
        )

        # Make the API request
        api_response = self.fetch(config, params=params)
        result.api_response = api_response

        if not api_response.success:
            result.success = False
            result.errors.append({
                "type": "api_error",
                "message": api_response.error,
            })
            result.completed_at = datetime.now()
            return result

        # Extract data array from response
        records = self._extract_data(api_response.data, config.data_path)
        result.records_fetched = len(records)

        if not records:
            result.warnings.append({
                "type": "empty_response",
                "message": "No records found in API response",
            })
            result.completed_at = datetime.now()
            return result

        # Default field mapping for common API response formats
        default_mapping = {
            "sku_id": ["sku_id", "sku", "product_id", "id", "item_id"],
            "unit_price": ["price", "unit_price", "cost", "amount"],
            "currency_code": ["currency", "currency_code"],
            "stock_status": ["stock", "stock_status", "availability", "in_stock"],
            "lead_time_days": ["lead_time", "lead_time_days", "delivery_days"],
        }

        # Process each record
        for i, record in enumerate(records):
            try:
                # Apply field mapping
                mapped_record = self._map_record(
                    record,
                    field_mapping or default_mapping
                )

                # Add vendor ID and metadata
                mapped_record["vendor_id"] = vendor_id
                mapped_record["source"] = "api"

                # Generate pricing ID if not present
                if "pricing_id" not in mapped_record:
                    mapped_record["pricing_id"] = str(uuid.uuid4())

                # Validate
                validation = self.validator.validate_vendor_pricing(
                    mapped_record,
                    row_index=i,
                )

                if validation.is_valid:
                    final_data = validation.cleaned_data or mapped_record
                    result.fetched_data.append(final_data)
                    result.records_valid += 1

                    if on_record_fetched:
                        on_record_fetched(final_data)
                else:
                    result.records_invalid += 1
                    for error in validation.errors:
                        result.errors.append({
                            "record_index": i,
                            "field": error.field,
                            "message": error.message,
                        })

                for warning in validation.warnings:
                    result.warnings.append({
                        "record_index": i,
                        "message": warning.message,
                    })

            except Exception as e:
                result.records_invalid += 1
                result.errors.append({
                    "record_index": i,
                    "message": f"Error processing record: {str(e)}",
                })

        result.completed_at = datetime.now()

        if result.records_invalid > 0 and result.records_valid == 0:
            result.success = False

        return result

    def fetch_sku_products(
        self,
        config: APIEndpointConfig,
        params: Optional[Dict[str, Any]] = None,
        field_mapping: Optional[Dict[str, str]] = None,
        on_record_fetched: Optional[Callable[[Dict], None]] = None,
    ) -> FetchResult:
        """
        Fetch SKU product data from an API endpoint.

        Args:
            config: API endpoint configuration
            params: Optional query parameters
            field_mapping: Optional mapping from API fields to our schema
            on_record_fetched: Optional callback for each fetched record

        Returns:
            FetchResult with the fetched and validated data
        """
        result = FetchResult(
            success=True,
            endpoint=config.url,
            started_at=datetime.now(),
        )

        api_response = self.fetch(config, params=params)
        result.api_response = api_response

        if not api_response.success:
            result.success = False
            result.errors.append({
                "type": "api_error",
                "message": api_response.error,
            })
            result.completed_at = datetime.now()
            return result

        records = self._extract_data(api_response.data, config.data_path)
        result.records_fetched = len(records)

        if not records:
            result.warnings.append({
                "type": "empty_response",
                "message": "No records found in API response",
            })
            result.completed_at = datetime.now()
            return result

        default_mapping = {
            "sku_id": ["sku_id", "sku", "product_id", "id"],
            "product_name": ["name", "product_name", "title"],
            "description": ["description", "desc"],
            "brand": ["brand", "brand_name"],
            "category_id": ["category_id", "category"],
            "upc_code": ["upc", "upc_code", "barcode"],
            "weight_kg": ["weight", "weight_kg"],
        }

        for i, record in enumerate(records):
            try:
                mapped_record = self._map_record(
                    record,
                    field_mapping or default_mapping
                )

                if "sku_id" not in mapped_record:
                    mapped_record["sku_id"] = str(uuid.uuid4())

                validation = self.validator.validate_sku_product(
                    mapped_record,
                    row_index=i,
                )

                if validation.is_valid:
                    final_data = validation.cleaned_data or mapped_record
                    result.fetched_data.append(final_data)
                    result.records_valid += 1

                    if on_record_fetched:
                        on_record_fetched(final_data)
                else:
                    result.records_invalid += 1
                    for error in validation.errors:
                        result.errors.append({
                            "record_index": i,
                            "field": error.field,
                            "message": error.message,
                        })

            except Exception as e:
                result.records_invalid += 1
                result.errors.append({
                    "record_index": i,
                    "message": f"Error processing record: {str(e)}",
                })

        result.completed_at = datetime.now()

        if result.records_invalid > 0 and result.records_valid == 0:
            result.success = False

        return result

    def _map_record(
        self,
        record: Dict[str, Any],
        mapping: Dict[str, List[str]],
    ) -> Dict[str, Any]:
        """Map API record fields to our schema using the mapping."""
        mapped = {}

        for target_field, source_fields in mapping.items():
            for source_field in source_fields:
                # Support nested fields with dot notation
                value = self._get_nested_value(record, source_field)
                if value is not None:
                    mapped[target_field] = value
                    break

        return mapped

    def _get_nested_value(self, data: Dict[str, Any], path: str) -> Any:
        """Get a value from nested dict using dot notation."""
        current = data
        for part in path.split("."):
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
        return current

    def fetch_paginated(
        self,
        config: APIEndpointConfig,
        data_type: str = "vendor_pricing",
        vendor_id: Optional[str] = None,
        max_pages: int = 100,
        params: Optional[Dict[str, Any]] = None,
        field_mapping: Optional[Dict[str, str]] = None,
    ) -> FetchResult:
        """
        Fetch data from a paginated API endpoint.

        Args:
            config: API endpoint configuration
            data_type: Type of data to fetch ("vendor_pricing" or "sku_product")
            vendor_id: Vendor ID (required for vendor_pricing)
            max_pages: Maximum number of pages to fetch
            params: Optional query parameters
            field_mapping: Optional field mapping

        Returns:
            Combined FetchResult from all pages
        """
        combined_result = FetchResult(
            success=True,
            endpoint=config.url,
            started_at=datetime.now(),
        )

        current_params = {**(params or {})}
        page = 0

        while page < max_pages:
            # Set pagination parameter
            if config.pagination_type == "offset":
                current_params[config.pagination_param or "offset"] = page * config.page_size
                current_params["limit"] = config.page_size
            elif config.pagination_type == "page":
                current_params[config.pagination_param or "page"] = page + 1
                current_params["per_page"] = config.page_size
            elif config.pagination_type == "cursor":
                # Cursor pagination handled differently
                pass

            # Fetch page
            if data_type == "vendor_pricing" and vendor_id:
                page_result = self.fetch_vendor_pricing(
                    config, vendor_id, current_params, field_mapping
                )
            else:
                page_result = self.fetch_sku_products(
                    config, current_params, field_mapping
                )

            # Combine results
            combined_result.records_fetched += page_result.records_fetched
            combined_result.records_valid += page_result.records_valid
            combined_result.records_invalid += page_result.records_invalid
            combined_result.fetched_data.extend(page_result.fetched_data)
            combined_result.errors.extend(page_result.errors)
            combined_result.warnings.extend(page_result.warnings)

            # Check if we should continue
            if not page_result.success or page_result.records_fetched < config.page_size:
                break

            # Handle cursor pagination
            if config.pagination_type == "cursor" and page_result.api_response:
                cursor = self._get_nested_value(
                    page_result.api_response.data or {},
                    "next_cursor"
                )
                if not cursor:
                    break
                current_params[config.pagination_param or "cursor"] = cursor

            page += 1

        combined_result.completed_at = datetime.now()

        if combined_result.records_invalid > 0 and combined_result.records_valid == 0:
            combined_result.success = False

        return combined_result

    def close(self):
        """Close the HTTP session."""
        if self._session:
            self._session.close()
            self._session = None


# Convenience function for creating endpoint configs
def create_endpoint_config(
    url: str,
    api_key: Optional[str] = None,
    api_key_header: str = "X-API-Key",
    bearer_token: Optional[str] = None,
    **kwargs,
) -> APIEndpointConfig:
    """
    Create an API endpoint configuration.

    Args:
        url: API endpoint URL
        api_key: Optional API key for authentication
        api_key_header: Header name for API key (default: X-API-Key)
        bearer_token: Optional bearer token for authentication
        **kwargs: Additional configuration options

    Returns:
        APIEndpointConfig instance
    """
    config = APIEndpointConfig(url=url, **kwargs)

    if bearer_token:
        config.auth_type = "bearer"
        config.auth_token = bearer_token
    elif api_key:
        config.auth_type = "api_key"
        config.api_key_header = api_key_header
        config.api_key_value = api_key

    return config
