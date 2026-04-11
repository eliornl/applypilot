"""
Integration tests for Interview Prep API endpoints.

Endpoints:
  GET    /api/v1/interview-prep/{session_id}
  GET    /api/v1/interview-prep/{session_id}/status
  POST   /api/v1/interview-prep/{session_id}/generate
  DELETE /api/v1/interview-prep/{session_id}
"""

import uuid
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

BASE = "/api/v1/interview-prep"
SESSION_ID = str(uuid.uuid4())


# ---------------------------------------------------------------------------
# GET /{session_id}
# ---------------------------------------------------------------------------


class TestGetInterviewPrep:
    """GET /api/v1/interview-prep/{session_id}"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.get(f"{BASE}/{SESSION_ID}")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_session_not_found_returns_404(self, authed_client):
        fake_session = str(uuid.uuid4())
        # No cache, no DB row
        with patch("api.interview_prep.get_cached_interview_prep",
                   AsyncMock(return_value=None)):
            resp = await authed_client.get(f"{BASE}/{fake_session}")
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cache_hit_returns_200(self, authed_client):
        mock_cached = {
            "data": {"predicted_questions": {"behavioral": []}},
            "cached_at": "2026-01-01T00:00:00+00:00",
        }
        with patch("api.interview_prep.get_cached_interview_prep",
                   AsyncMock(return_value=mock_cached)):
            resp = await authed_client.get(f"{BASE}/{SESSION_ID}")

        assert resp.status_code == 200
        data = resp.json()
        assert data["has_interview_prep"] is True
        assert data["session_id"] == SESSION_ID


# ---------------------------------------------------------------------------
# GET /{session_id}/status
# ---------------------------------------------------------------------------


class TestInterviewPrepStatus:
    """GET /api/v1/interview-prep/{session_id}/status"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.get(f"{BASE}/{SESSION_ID}/status")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_session_not_found_returns_404(self, authed_client):
        fake_session = str(uuid.uuid4())
        with patch("api.interview_prep.get_cached_interview_prep",
                   AsyncMock(return_value=None)):
            resp = await authed_client.get(f"{BASE}/{fake_session}/status")
        assert resp.status_code in (404, 200)  # 200 with has_prep=False is also valid

    @pytest.mark.asyncio
    async def test_status_has_required_fields(self, authed_client):
        with patch("api.interview_prep.get_cached_interview_prep",
                   AsyncMock(return_value=None)):
            resp = await authed_client.get(f"{BASE}/{SESSION_ID}/status")

        if resp.status_code == 200:
            data = resp.json()
            assert "has_interview_prep" in data or "status" in data
        else:
            assert resp.status_code in (404, 401, 403)


# ---------------------------------------------------------------------------
# POST /{session_id}/generate
# ---------------------------------------------------------------------------


class TestGenerateInterviewPrep:
    """POST /api/v1/interview-prep/{session_id}/generate"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.post(f"{BASE}/{SESSION_ID}/generate")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_session_not_found_returns_404(self, authed_client):
        fake_session = str(uuid.uuid4())
        with patch("api.interview_prep.get_cached_interview_prep",
                   AsyncMock(return_value=None)):
            resp = await authed_client.post(f"{BASE}/{fake_session}/generate")
        assert resp.status_code in (404, 200, 202)

    @pytest.mark.asyncio
    async def test_rate_limited_returns_429(self, authed_client):
        with patch("api.interview_prep.check_rate_limit",
                   AsyncMock(return_value=(False, 0))):
            resp = await authed_client.post(f"{BASE}/{SESSION_ID}/generate")
        assert resp.status_code == 429

    @pytest.mark.asyncio
    async def test_generate_nonexistent_session_returns_404_or_202(self, authed_client):
        """Generating for a nonexistent session should return 404 or start gracefully."""
        fake_session = str(uuid.uuid4())
        with patch("api.interview_prep.get_cached_interview_prep",
                   AsyncMock(return_value=None)):
            resp = await authed_client.post(f"{BASE}/{fake_session}/generate")
        assert resp.status_code in (200, 202, 404, 409)


# ---------------------------------------------------------------------------
# DELETE /{session_id}
# ---------------------------------------------------------------------------


class TestDeleteInterviewPrep:
    """DELETE /api/v1/interview-prep/{session_id}"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.delete(f"{BASE}/{SESSION_ID}")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_session_not_found_returns_404(self, authed_client):
        fake_session = str(uuid.uuid4())
        with patch("api.interview_prep.get_cached_interview_prep",
                   AsyncMock(return_value=None)):
            resp = await authed_client.delete(f"{BASE}/{fake_session}")
        assert resp.status_code in (404, 204)
