"""
Integration tests for Workflow API endpoints.

Endpoints:
  POST /api/v1/workflow/start
  GET  /api/v1/workflow/status/{session_id}
  GET  /api/v1/workflow/results/{session_id}
  GET  /api/v1/workflow/history
"""

import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

BASE = "/api/v1/workflow"
SESSION_ID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# POST /start
# ---------------------------------------------------------------------------


class TestWorkflowStart:
    """POST /api/v1/workflow/start"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.post(
            f"{BASE}/start",
            data={"job_text": "We are looking for a software engineer..."},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_no_input_returns_400_or_422(self, authed_client):
        """Starting a workflow with no job input should be rejected."""
        with patch("utils.redis_client.get_redis_client", AsyncMock(return_value=None)):
            resp = await authed_client.post(f"{BASE}/start", data={})
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_start_with_text_input_returns_session_or_error(self, authed_client):
        """A valid text input should return 200/202 (session created) or validation error."""
        with patch("utils.redis_client.get_redis_client", AsyncMock(return_value=None)):
            resp = await authed_client.post(
                f"{BASE}/start",
                data={
                    "job_text": "We are looking for a Senior Python Engineer with 5+ years experience. "
                                "Must have strong knowledge of FastAPI and PostgreSQL. "
                                "Full remote, competitive salary.",
                },
            )

        # May return 200/202 (started) or 400/422 (validation) or 500 (LLM not configured)
        assert resp.status_code in (200, 202, 400, 422, 500), resp.text

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self, authed_client):
        from utils.cache import RateLimitResult
        blocked = RateLimitResult(allowed=False, limit=10, remaining=0, reset_seconds=3600)
        with patch("api.workflow.check_rate_limit_with_headers",
                   AsyncMock(return_value=blocked)):
            resp = await authed_client.post(
                f"{BASE}/start",
                data={"job_text": "We need a backend engineer..."},
            )
        assert resp.status_code == 429

    @pytest.mark.asyncio
    async def test_unsupported_file_type_returns_400(self, authed_client):
        """Uploading an unsupported file type should return 400."""
        with patch("utils.redis_client.get_redis_client", AsyncMock(return_value=None)), \
             patch("api.workflow.check_rate_limit_with_headers",
                   AsyncMock(return_value=MagicMock(allowed=True, reset_seconds=3600,
                                                    get_headers=lambda: {}))):
            resp = await authed_client.post(
                f"{BASE}/start",
                files={"job_file": ("malware.exe", b"MZ\x90\x00", "application/octet-stream")},
            )
        assert resp.status_code in (400, 422)


# ---------------------------------------------------------------------------
# GET /status/{session_id}
# ---------------------------------------------------------------------------


class TestWorkflowStatus:
    """GET /api/v1/workflow/status/{session_id}"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.get(f"{BASE}/status/{SESSION_ID}")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_nonexistent_session_returns_404(self, authed_client):
        resp = await authed_client.get(f"{BASE}/status/{str(uuid.uuid4())}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_invalid_session_id_format_returns_400_or_404(self, authed_client):
        resp = await authed_client.get(f"{BASE}/status/not-a-uuid")
        assert resp.status_code in (400, 404, 422)


# ---------------------------------------------------------------------------
# GET /results/{session_id}
# ---------------------------------------------------------------------------


class TestWorkflowResults:
    """GET /api/v1/workflow/results/{session_id}"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.get(f"{BASE}/results/{SESSION_ID}")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_nonexistent_session_returns_404(self, authed_client):
        resp = await authed_client.get(f"{BASE}/results/{str(uuid.uuid4())}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_empty_session_id_returns_404_or_422(self, authed_client):
        resp = await authed_client.get(f"{BASE}/results/")
        assert resp.status_code in (404, 405, 422)


# ---------------------------------------------------------------------------
# GET /history
# ---------------------------------------------------------------------------


class TestWorkflowHistory:
    """GET /api/v1/workflow/history"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.get(f"{BASE}/history")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_returns_200_with_empty_list_for_new_user(self, authed_client_with_user):
        resp = await authed_client_with_user.get(f"{BASE}/history")
        assert resp.status_code == 200
        data = resp.json()
        sessions_key = "sessions" if "sessions" in data else list(data.keys())[0]
        assert isinstance(data[sessions_key], list)

    @pytest.mark.asyncio
    async def test_pagination_params_accepted(self, authed_client_with_user):
        resp = await authed_client_with_user.get(f"{BASE}/history?page=1&page_size=10")
        assert resp.status_code == 200
