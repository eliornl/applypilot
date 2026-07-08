# =============================================================================
# CONSTANTS AND CONFIGURATION
# =============================================================================

from __future__ import annotations

from typing import Any, Dict, Optional

import httpx

from applypilot_client.errors import ApiClientError, parse_error_response

DEFAULT_TIMEOUT_SECONDS = 30.0
API_V1_PREFIX = "/api/v1"


# =============================================================================
# CLASSES/FUNCTIONS
# =============================================================================


class ApplyPilotClient:
    """
    Synchronous HTTP client for ApplyPilot API v1.

    Args:
        base_url: Server origin, e.g. http://localhost:8000
        access_token: Optional Bearer JWT
        timeout: Request timeout in seconds
    """

    def __init__(
        self,
        base_url: str,
        access_token: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token
        self.timeout = timeout

    def _headers(self) -> Dict[str, str]:
        headers: Dict[str, str] = {"Accept": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    def request(
        self,
        method: str,
        path: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        files: Optional[Dict[str, Any]] = None,
    ) -> httpx.Response:
        """
        Send an HTTP request to the API.

        Args:
            method: HTTP method
            path: Path starting with / (e.g. /health or /api/v1/auth/verify)
            json: JSON body
            params: Query parameters
            data: Form fields
            files: Multipart files

        Returns:
            httpx.Response on success (2xx)

        Raises:
            ApiClientError: On API error responses and connection failures
        """
        url = path if path.startswith("http") else f"{self.base_url}{path}"
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.request(
                    method,
                    url,
                    headers=self._headers(),
                    json=json,
                    params=params,
                    data=data,
                    files=files,
                )
        except httpx.ConnectError as exc:
            raise ApiClientError(
                message=f"Cannot connect to {self.base_url}: {exc}",
                status_code=0,
            ) from exc
        except httpx.TimeoutException as exc:
            raise ApiClientError(
                message=f"Request timed out after {self.timeout}s",
                status_code=0,
            ) from exc

        if response.is_success:
            return response

        try:
            body: Any = response.json()
        except Exception:
            body = response.text

        raise parse_error_response(response.status_code, body)

    def get_json(self, path: str, **kwargs: Any) -> Any:
        """GET and parse JSON body."""
        response = self.request("GET", path, **kwargs)
        if not response.content:
            return {}
        return response.json()

    def health(self) -> Dict[str, Any]:
        """GET /health — server health (no auth)."""
        return self.get_json("/health")

    def verify_token(self) -> Dict[str, Any]:
        """GET /api/v1/auth/verify — requires Bearer token."""
        return self.get_json(f"{API_V1_PREFIX}/auth/verify")
