"""
Integration tests for extension autofill map endpoint.

POST /api/v1/extension/autofill/map
POST /api/extension/autofill/map (legacy prefix)
"""

import uuid

import jwt
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sqlalchemy import update

from config.settings import get_security_settings
from main import app
from models.database import User, UserProfile
from tests.test_api.conftest import _NullSessionLocal
from utils.auth import get_current_user, get_current_user_with_complete_profile
from utils.cache import RateLimitResult
from utils.llm_client import GeminiError

BASE = "/api/v1/extension"
LEGACY_BASE = "/api/extension"


def _single_field_body(**overrides):
    base = {
        "page_url": "https://careers.example.com/apply",
        "fields": [
            {
                "field_uid": "0",
                "tag": "input",
                "input_type": "text",
                "label_text": "First name",
            }
        ],
    }
    base.update(overrides)
    return base


async def _ensure_profile_for_token(authed_client_with_user, summary: str = "Autofill test profile.") -> uuid.UUID:
    token = authed_client_with_user.headers["Authorization"].split(" ", 1)[1]
    sec = get_security_settings()
    payload = jwt.decode(
        token,
        sec.jwt_config["secret_key"],
        algorithms=[sec.jwt_config["algorithm"]],
    )
    uid = uuid.UUID(payload["sub"])
    async with _NullSessionLocal() as session:
        await session.execute(update(User).where(User.id == uid).values(profile_completed=True))
        session.add(
            UserProfile(
                id=uuid.uuid4(),
                user_id=uid,
                professional_title="Engineer",
                years_experience=5,
                summary=summary,
                city="Austin",
                state="TX",
                country="US",
            )
        )
        await session.commit()
    return uid


def _complete_user_override(uid: uuid.UUID, payload: dict):
    async def _mock_complete_user():
        return {
            "id": str(uid),
            "_id": str(uid),
            "email": payload.get("email", "u@example.com"),
            "full_name": "Autofill Test User",
            "auth_method": "local",
            "is_admin": False,
            "profile_completed": True,
            "profile_completion_percentage": 100,
            "has_google_linked": False,
            "has_password": True,
        }

    return _mock_complete_user


class TestExtensionAutofillMap:
    """POST /extension/autofill/map"""

    @pytest.mark.asyncio
    async def test_no_auth_returns_401_or_403(self, api_client):
        resp = await api_client.post(f"{BASE}/autofill/map", json=_single_field_body())
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_invalid_page_url_422(self, authed_client):
        body = {
            "page_url": "not-a-url",
            "fields": [
                {
                    "field_uid": "0",
                    "tag": "input",
                    "input_type": "text",
                    "label_text": "Email",
                }
            ],
        }
        resp = await authed_client.post(f"{BASE}/autofill/map", json=body)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_field_uid_must_be_digits_422(self, authed_client):
        body = _single_field_body()
        body["fields"][0]["field_uid"] = "abc"
        resp = await authed_client.post(f"{BASE}/autofill/map", json=body)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_duplicate_field_uid_422(self, authed_client):
        body = {
            "page_url": "https://example.com/apply",
            "fields": [
                {
                    "field_uid": "0",
                    "tag": "input",
                    "input_type": "text",
                    "label_text": "A",
                },
                {
                    "field_uid": "0",
                    "tag": "input",
                    "input_type": "text",
                    "label_text": "B",
                },
            ],
        }
        resp = await authed_client.post(f"{BASE}/autofill/map", json=body)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_more_than_60_fields_422(self, authed_client):
        fields = [
            {
                "field_uid": str(i),
                "tag": "input",
                "input_type": "text",
                "label_text": f"f{i}",
            }
            for i in range(61)
        ]
        resp = await authed_client.post(
            f"{BASE}/autofill/map",
            json={"page_url": "https://example.com/a", "fields": fields},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_extras_more_than_16_keys_422(self, authed_client):
        extras = {f"k{i}": "v" for i in range(17)}
        resp = await authed_client.post(
            f"{BASE}/autofill/map",
            json=_single_field_body(extras=extras),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_rate_limit_429_and_retry_after(self, authed_client):
        blocked = RateLimitResult(allowed=False, limit=15, remaining=0, reset_seconds=120)
        with patch("api.extension_autofill.check_rate_limit_with_headers", AsyncMock(return_value=blocked)):
            resp = await authed_client.post(f"{BASE}/autofill/map", json=_single_field_body())
        assert resp.status_code == 429
        data = resp.json()
        assert data.get("error_code") == "RATE_4001"
        assert resp.headers.get("Retry-After") == "120"

    @pytest.mark.asyncio
    async def test_no_api_key_CFG_6001(self, authed_client):
        with (
            patch("api.extension_autofill._get_user_api_key", AsyncMock(return_value=None)),
            patch("api.extension_autofill._server_has_llm", return_value=False),
        ):
            resp = await authed_client.post(f"{BASE}/autofill/map", json=_single_field_body())
        assert resp.status_code == 422
        assert resp.json().get("error_code") == "CFG_6001"

    @pytest.mark.asyncio
    async def test_user_not_found_404(self, authed_client):
        """JWT user id has no DB row — rare after account deletion."""
        with (
            patch("api.extension_autofill._get_user_api_key", AsyncMock(return_value=None)),
            patch("api.extension_autofill._server_has_llm", return_value=True),
            patch("api.extension_autofill.get_cached_tool_result", AsyncMock(return_value=None)),
        ):
            resp = await authed_client.post(f"{BASE}/autofill/map", json=_single_field_body())
        assert resp.status_code == 404
        assert resp.json().get("error_code") == "RES_3001"

    @pytest.mark.asyncio
    async def test_legacy_prefix_same_behavior_422(self, authed_client):
        body = {"page_url": "bad", "fields": [{"field_uid": "0", "tag": "input", "input_type": "text", "label_text": "x"}]}
        resp = await authed_client.post(f"{LEGACY_BASE}/autofill/map", json=body)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_cache_hit_filters_unknown_field_uid(self, authed_client_with_user):
        """Stale cache entries for unknown field_uids must not be returned."""
        token = authed_client_with_user.headers["Authorization"].split(" ", 1)[1]
        sec = get_security_settings()
        payload = jwt.decode(
            token,
            sec.jwt_config["secret_key"],
            algorithms=[sec.jwt_config["algorithm"]],
        )
        uid = uuid.UUID(payload["sub"])

        async with _NullSessionLocal() as session:
            await session.execute(update(User).where(User.id == uid).values(profile_completed=True))
            session.add(
                UserProfile(
                    id=uuid.uuid4(),
                    user_id=uid,
                    professional_title="Engineer",
                    years_experience=3,
                    summary="Cache test.",
                    city="X",
                    state="Y",
                    country="Z",
                )
            )
            await session.commit()

        mock_user = _complete_user_override(uid, payload)

        app.dependency_overrides[get_current_user] = mock_user
        app.dependency_overrides[get_current_user_with_complete_profile] = mock_user

        stale_cache = {
            "assignments": [
                {"field_uid": "0", "value": "ok", "label_text": "First"},
                {"field_uid": "99", "value": "leak", "label_text": "Ghost"},
            ],
            "skipped": [{"field_uid": "99", "reason": "nope"}],
            "generated_at": "2026-01-01T00:00:00+00:00",
        }

        try:
            with (
                patch("api.extension_autofill.get_cached_tool_result", AsyncMock(return_value=stale_cache)),
                patch("api.extension_autofill.get_gemini_client", AsyncMock()),
                patch("api.extension_autofill._get_user_api_key", AsyncMock(return_value=None)),
                patch("api.extension_autofill._server_has_llm", return_value=True),
            ):
                resp = await authed_client_with_user.post(f"{BASE}/autofill/map", json=_single_field_body())
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_current_user_with_complete_profile, None)

        assert resp.status_code == 200
        data = resp.json()
        uids = [a["field_uid"] for a in data["assignments"]]
        assert "0" in uids
        assert "99" not in uids
        assert all(s.get("field_uid") != "99" for s in data.get("skipped", []))

    @pytest.mark.asyncio
    async def test_map_returns_assignments(self, authed_client_with_user):
        uid = await _ensure_profile_for_token(authed_client_with_user)
        token = authed_client_with_user.headers["Authorization"].split(" ", 1)[1]
        sec = get_security_settings()
        payload = jwt.decode(
            token,
            sec.jwt_config["secret_key"],
            algorithms=[sec.jwt_config["algorithm"]],
        )

        mock_user = _complete_user_override(uid, payload)
        app.dependency_overrides[get_current_user] = mock_user
        app.dependency_overrides[get_current_user_with_complete_profile] = mock_user

        mock_client = MagicMock()
        mock_client.generate = AsyncMock(
            return_value={
                "response": '{"assignments":[{"field_uid":"0","value":"Autofill Test User"}],'
                '"skipped":[]}',
                "done": True,
            }
        )

        try:
            with (
                patch("api.extension_autofill.get_cached_tool_result", AsyncMock(return_value=None)),
                patch("api.extension_autofill.cache_tool_result", AsyncMock(return_value=True)),
                patch("api.extension_autofill.get_gemini_client", AsyncMock(return_value=mock_client)),
                patch("api.extension_autofill._get_user_api_key", AsyncMock(return_value=None)),
                patch("api.extension_autofill._server_has_llm", return_value=True),
            ):
                resp = await authed_client_with_user.post(f"{BASE}/autofill/map", json=_single_field_body(extras={}))
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_current_user_with_complete_profile, None)

        assert resp.status_code == 200
        data = resp.json()
        assert "assignments" in data
        assert len(data["assignments"]) >= 1
        assert data["assignments"][0]["field_uid"] == "0"
        assert "warnings" in data
        mock_client.generate.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_gemini_error_returns_503(self, authed_client_with_user):
        uid = await _ensure_profile_for_token(authed_client_with_user, summary="Gemini error path.")
        token = authed_client_with_user.headers["Authorization"].split(" ", 1)[1]
        sec = get_security_settings()
        payload = jwt.decode(
            token,
            sec.jwt_config["secret_key"],
            algorithms=[sec.jwt_config["algorithm"]],
        )

        mock_user = _complete_user_override(uid, payload)
        app.dependency_overrides[get_current_user] = mock_user
        app.dependency_overrides[get_current_user_with_complete_profile] = mock_user

        mock_client = MagicMock()
        mock_client.generate = AsyncMock(side_effect=GeminiError("upstream failure", status_code=503))

        try:
            with (
                patch("api.extension_autofill.get_cached_tool_result", AsyncMock(return_value=None)),
                patch("api.extension_autofill.get_gemini_client", AsyncMock(return_value=mock_client)),
                patch("api.extension_autofill._get_user_api_key", AsyncMock(return_value=None)),
                patch("api.extension_autofill._server_has_llm", return_value=True),
            ):
                resp = await authed_client_with_user.post(f"{BASE}/autofill/map", json=_single_field_body())
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_current_user_with_complete_profile, None)

        assert resp.status_code == 503
        assert resp.json().get("error_code") == "EXT_5002"

    @pytest.mark.asyncio
    async def test_unparseable_llm_response_503(self, authed_client_with_user):
        uid = await _ensure_profile_for_token(authed_client_with_user, summary="Parse fail path.")
        token = authed_client_with_user.headers["Authorization"].split(" ", 1)[1]
        sec = get_security_settings()
        payload = jwt.decode(
            token,
            sec.jwt_config["secret_key"],
            algorithms=[sec.jwt_config["algorithm"]],
        )

        mock_user = _complete_user_override(uid, payload)
        app.dependency_overrides[get_current_user] = mock_user
        app.dependency_overrides[get_current_user_with_complete_profile] = mock_user

        mock_client = MagicMock()
        mock_client.generate = AsyncMock(return_value={"response": "NOT JSON {{{", "done": True})

        try:
            with (
                patch("api.extension_autofill.get_cached_tool_result", AsyncMock(return_value=None)),
                patch("api.extension_autofill.get_gemini_client", AsyncMock(return_value=mock_client)),
                patch("api.extension_autofill._get_user_api_key", AsyncMock(return_value=None)),
                patch("api.extension_autofill._server_has_llm", return_value=True),
            ):
                resp = await authed_client_with_user.post(f"{BASE}/autofill/map", json=_single_field_body())
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_current_user_with_complete_profile, None)

        assert resp.status_code == 503
        assert resp.json().get("error_code") == "EXT_5002"

    @pytest.mark.asyncio
    async def test_assignment_truncated_to_field_max_length(self, authed_client_with_user):
        uid = await _ensure_profile_for_token(authed_client_with_user, summary="Max length truncation.")
        token = authed_client_with_user.headers["Authorization"].split(" ", 1)[1]
        sec = get_security_settings()
        payload = jwt.decode(
            token,
            sec.jwt_config["secret_key"],
            algorithms=[sec.jwt_config["algorithm"]],
        )

        mock_user = _complete_user_override(uid, payload)
        app.dependency_overrides[get_current_user] = mock_user
        app.dependency_overrides[get_current_user_with_complete_profile] = mock_user

        mock_client = MagicMock()
        mock_client.generate = AsyncMock(
            return_value={
                "response": '{"assignments":[{"field_uid":"0","value":"TOOLONG"}],'
                '"skipped":[]}',
                "done": True,
            }
        )

        body = {
            "page_url": "https://careers.example.com/apply",
            "fields": [
                {
                    "field_uid": "0",
                    "tag": "input",
                    "input_type": "text",
                    "label_text": "Code",
                    "max_length": 3,
                }
            ],
        }

        try:
            with (
                patch("api.extension_autofill.get_cached_tool_result", AsyncMock(return_value=None)),
                patch("api.extension_autofill.cache_tool_result", AsyncMock(return_value=True)),
                patch("api.extension_autofill.get_gemini_client", AsyncMock(return_value=mock_client)),
                patch("api.extension_autofill._get_user_api_key", AsyncMock(return_value=None)),
                patch("api.extension_autofill._server_has_llm", return_value=True),
            ):
                resp = await authed_client_with_user.post(f"{BASE}/autofill/map", json=body)
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_current_user_with_complete_profile, None)

        assert resp.status_code == 200
        assert resp.json()["assignments"][0]["value"] == "TOO"

    @pytest.mark.asyncio
    async def test_llm_skipped_unknown_field_uid_dropped(self, authed_client_with_user):
        uid = await _ensure_profile_for_token(authed_client_with_user, summary="Skipped filter.")
        token = authed_client_with_user.headers["Authorization"].split(" ", 1)[1]
        sec = get_security_settings()
        payload = jwt.decode(
            token,
            sec.jwt_config["secret_key"],
            algorithms=[sec.jwt_config["algorithm"]],
        )

        mock_user = _complete_user_override(uid, payload)
        app.dependency_overrides[get_current_user] = mock_user
        app.dependency_overrides[get_current_user_with_complete_profile] = mock_user

        mock_client = MagicMock()
        mock_client.generate = AsyncMock(
            return_value={
                "response": '{"assignments":[],"skipped":['
                '{"field_uid":"0","reason":"skip a"},'
                '{"field_uid":"99","reason":"skip ghost"}'
                "]}",
                "done": True,
            }
        )

        try:
            with (
                patch("api.extension_autofill.get_cached_tool_result", AsyncMock(return_value=None)),
                patch("api.extension_autofill.cache_tool_result", AsyncMock(return_value=True)),
                patch("api.extension_autofill.get_gemini_client", AsyncMock(return_value=mock_client)),
                patch("api.extension_autofill._get_user_api_key", AsyncMock(return_value=None)),
                patch("api.extension_autofill._server_has_llm", return_value=True),
            ):
                resp = await authed_client_with_user.post(f"{BASE}/autofill/map", json=_single_field_body())
        finally:
            app.dependency_overrides.pop(get_current_user, None)
            app.dependency_overrides.pop(get_current_user_with_complete_profile, None)

        assert resp.status_code == 200
        skipped = resp.json().get("skipped") or []
        uids = [s["field_uid"] for s in skipped]
        assert "0" in uids
        assert "99" not in uids


class TestExtensionAutofillHelpers:
    """Pure helper coverage (importable without HTTP)."""

    def test_validate_assignments_ignores_unknown_uid(self):
        from api.extension_autofill import AutofillFieldIn, _validate_assignments

        fields = {
            "0": AutofillFieldIn(field_uid="0", tag="input", input_type="text", label_text="A"),
        }
        raw = [
            {"field_uid": "0", "value": "ok"},
            {"field_uid": "7", "value": "nope"},
        ]
        out = _validate_assignments(raw, fields)
        assert len(out) == 1
        assert out[0].field_uid == "0"
