"""
Chrome extension: map visible job-application form fields to the user's profile via LLM.

MVP: same-document fields only; client previews suggestions before applying values in-tab.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import get_settings
from models.database import User, UserProfile as UserProfileModel
from utils.auth import get_current_user_with_complete_profile
from utils.cache import (
    cache_tool_result,
    check_rate_limit_with_headers,
    generate_hash,
    get_cached_tool_result,
)
from utils.database import get_database
from utils.encryption import decrypt_api_key
from utils.error_responses import (
    ErrorCode,
    external_service_error,
    internal_error,
    no_api_key_error,
    not_found_error,
    rate_limit_error,
)
from utils.llm_client import GeminiError, get_gemini_client, user_facing_message_from_llm_exception
from utils.llm_parsing import parse_json_from_llm_response
from utils.security import sanitize_llm_output, sanitize_text

logger = logging.getLogger(__name__)
router = APIRouter()

# =============================================================================
# CONSTANTS
# =============================================================================

_MAX_FIELDS: int = 60
_MAX_LABEL_CHARS: int = 600
_MAX_OPTION_TEXT: int = 200
_MAX_OPTIONS_PER_SELECT: int = 40
_MAX_PAGE_URL_LEN: int = 2048
_MAX_EXTRAS_KEYS: int = 16
_MAX_EXTRA_KEY_LEN: int = 64
_MAX_EXTRA_VALUE_LEN: int = 500
_MAX_ASSIGNMENT_VALUE: int = 8000

_RATE_LIMIT: int = 15
_RATE_WINDOW_S: int = 3600

_SYSTEM_PROMPT: str = """You map job application form fields to a user's profile data.

Rules:
- Output ONLY a JSON object with keys "assignments" and "skipped". No markdown fences.
- "assignments" is an array of {"field_uid": string, "value": string}. Use ONLY field_uid values from the input list.
- "skipped" is an array of {"field_uid": string, "reason": string} for fields you refuse to fill or cannot map.
- Use ONLY facts present in the provided profile JSON and extras JSON. Do not invent employers, degrees, or credentials.
- If a field asks for legally sensitive attestations, diversity/EEO self-ID, or anything you should not infer, skip it.
- For salary questions, you may use desired_salary_range if present; otherwise skip.
- Keep values concise. Match the expected format when obvious (e.g. email for email fields).
- If unsure, skip rather than guess wrong.
"""

# =============================================================================
# MODELS
# =============================================================================


class AutofillSelectOption(BaseModel):
    """One <option> for a select control."""

    value: str = Field(default="", max_length=500)
    text: str = Field(default="", max_length=_MAX_OPTION_TEXT)


class AutofillFieldIn(BaseModel):
    """Serialized form control from the extension (main document only)."""

    field_uid: str = Field(
        ...,
        min_length=1,
        max_length=64,
        pattern=r"^\d+$",
        description="Stable id from the extension serializer (digits only)",
    )
    tag: str = Field(..., max_length=24)
    input_type: Optional[str] = Field(None, max_length=32)
    name_attr: Optional[str] = Field(None, max_length=240)
    id_attr: Optional[str] = Field(None, max_length=240)
    label_text: str = Field(default="", max_length=_MAX_LABEL_CHARS)
    placeholder: Optional[str] = Field(None, max_length=500)
    aria_label: Optional[str] = Field(None, max_length=500)
    required: bool = False
    max_length: Optional[int] = Field(None, ge=0, le=1_000_000)
    options: Optional[List[AutofillSelectOption]] = Field(None, max_length=_MAX_OPTIONS_PER_SELECT)


class AutofillMapRequest(BaseModel):
    """Request body for POST /extension/autofill/map."""

    fields: List[AutofillFieldIn] = Field(..., min_length=1)
    page_url: str = Field(..., min_length=1, max_length=_MAX_PAGE_URL_LEN)
    extras: Optional[Dict[str, str]] = Field(
        default=None,
        description="Optional key/value hints stored in the extension (phone, URLs, etc.)",
    )

    @field_validator("page_url")
    @classmethod
    def _page_url_scheme(cls, v: str) -> str:
        t = v.strip()
        if not t.startswith(("http://", "https://")):
            raise ValueError("page_url must start with http:// or https://")
        return t

    @model_validator(mode="after")
    def _aggregate_field_rules(self) -> AutofillMapRequest:
        if len(self.fields) > _MAX_FIELDS:
            raise ValueError(f"At most {_MAX_FIELDS} fields allowed")
        uids = [f.field_uid for f in self.fields]
        if len(uids) != len(set(uids)):
            raise ValueError("Each field_uid must be unique")
        if self.extras is not None:
            if len(self.extras) > _MAX_EXTRAS_KEYS:
                raise ValueError(f"At most {_MAX_EXTRAS_KEYS} extras keys allowed")
            for k, val in self.extras.items():
                if len(k) > _MAX_EXTRA_KEY_LEN:
                    raise ValueError("extras key too long")
                if val is not None and len(val) > _MAX_EXTRA_VALUE_LEN:
                    raise ValueError("extras value too long")
        return self


class AutofillAssignmentOut(BaseModel):
    """One suggested value for a field."""

    field_uid: str
    value: str
    label_text: str = Field(default="", description="Echo from request for preview UI")


class AutofillMapResponse(BaseModel):
    """LLM mapping result returned to the extension."""

    assignments: List[AutofillAssignmentOut] = Field(default_factory=list)
    skipped: List[Dict[str, str]] = Field(default_factory=list)
    warnings: List[str] = Field(
        default_factory=list,
        description="UX hints (e.g. same-document MVP, no iframes)",
    )


# =============================================================================
# HELPERS
# =============================================================================


def _get_user_uuid(current_user: Dict[str, Any]) -> uuid.UUID:
    uid = current_user.get("id") or current_user.get("_id")
    if isinstance(uid, str):
        return uuid.UUID(uid)
    return uid


async def _get_user_api_key(db: AsyncSession, user_id: uuid.UUID) -> Optional[str]:
    try:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user and user.gemini_api_key_encrypted:
            return decrypt_api_key(user.gemini_api_key_encrypted)
    except Exception as e:
        logger.warning("Failed to decrypt user API key for autofill: %s", e, exc_info=True)
    return None


def _server_has_llm() -> bool:
    """Read settings at call time so tests and env reloads see current config."""
    cfg = get_settings()
    return bool(getattr(cfg, "gemini_api_key", None)) or bool(getattr(cfg, "use_vertex_ai", False))


async def _load_profile_bundle(
    db: AsyncSession, user_id: uuid.UUID, user_row: User
) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Build a JSON-serializable snapshot for the LLM (user + profile).

    Returns:
        Tuple of (snapshot dict, profile updated_at iso or None for cache keying)
    """
    result = await db.execute(select(UserProfileModel).where(UserProfileModel.user_id == user_id))
    prof = result.scalar_one_or_none()
    snap: Dict[str, Any] = {
        "email": user_row.email,
        "full_name": user_row.full_name,
    }
    prof_sig = ""
    if prof:
        d = prof.to_dict()
        summary = d.get("summary") or ""
        if isinstance(summary, str) and len(summary) > 2500:
            summary = summary[:2500] + "…"
        d["summary"] = summary
        we = d.get("work_experience") or []
        if isinstance(we, list) and len(we) > 12:
            d["work_experience"] = we[:12]
        snap["profile"] = d
        if prof.updated_at:
            prof_sig = prof.updated_at.isoformat()
    else:
        snap["profile"] = {}

    return snap, prof_sig


def _sanitize_field_dict(f: AutofillFieldIn) -> Dict[str, Any]:
    opts = None
    if f.options:
        opts = [
            {"value": sanitize_text(o.value)[:500], "text": sanitize_text(o.text)[:_MAX_OPTION_TEXT]}
            for o in f.options[:_MAX_OPTIONS_PER_SELECT]
        ]
    return {
        "field_uid": sanitize_text(f.field_uid)[:64],
        "tag": sanitize_text(f.tag)[:24],
        "input_type": sanitize_text(f.input_type)[:32] if f.input_type else None,
        "name_attr": sanitize_text(f.name_attr)[:240] if f.name_attr else None,
        "id_attr": sanitize_text(f.id_attr)[:240] if f.id_attr else None,
        "label_text": sanitize_text(f.label_text)[:_MAX_LABEL_CHARS],
        "placeholder": sanitize_text(f.placeholder)[:500] if f.placeholder else None,
        "aria_label": sanitize_text(f.aria_label)[:500] if f.aria_label else None,
        "required": f.required,
        "max_length": f.max_length,
        "options": opts,
    }


def _sanitize_extras(extras: Optional[Dict[str, str]]) -> Dict[str, str]:
    if not extras:
        return {}
    out: Dict[str, str] = {}
    for k, v in list(extras.items())[:_MAX_EXTRAS_KEYS]:
        kk = sanitize_text(str(k))[:_MAX_EXTRA_KEY_LEN]
        if not kk:
            continue
        out[kk] = sanitize_text(str(v))[:_MAX_EXTRA_VALUE_LEN] if v is not None else ""
    return out


def _build_user_prompt(
    fields_compact: List[Dict[str, Any]], profile: Dict[str, Any], extras: Dict[str, str], page_url: str
) -> str:
    return (
        "Page URL (context only): "
        + sanitize_text(page_url)[:_MAX_PAGE_URL_LEN]
        + "\n\nFIELDS_JSON:\n"
        + json.dumps(fields_compact, ensure_ascii=False)
        + "\n\nPROFILE_JSON:\n"
        + json.dumps(profile, ensure_ascii=False, default=str)
        + "\n\nEXTRAS_JSON:\n"
        + json.dumps(extras, ensure_ascii=False)
        + '\n\nRespond with JSON: {"assignments":[{"field_uid":"…","value":"…"}],'
        + '"skipped":[{"field_uid":"…","reason":"…"}]}'
    )


def _validate_assignments(
    raw_assignments: List[Dict[str, Any]],
    fields_by_uid: Dict[str, AutofillFieldIn],
) -> List[AutofillAssignmentOut]:
    out: List[AutofillAssignmentOut] = []
    for item in raw_assignments:
        if not isinstance(item, dict):
            continue
        uid = item.get("field_uid")
        val = item.get("value")
        if not isinstance(uid, str) or uid not in fields_by_uid:
            continue
        if not isinstance(val, str):
            val = str(val) if val is not None else ""
        val = sanitize_text(val)[:_MAX_ASSIGNMENT_VALUE]
        meta = fields_by_uid[uid]
        if meta.max_length is not None and meta.max_length > 0 and len(val) > meta.max_length:
            val = val[: int(meta.max_length)]
        out.append(
            AutofillAssignmentOut(
                field_uid=uid,
                value=val,
                label_text=meta.label_text[:_MAX_LABEL_CHARS],
            )
        )
    return out


# =============================================================================
# ENDPOINT
# =============================================================================


@router.post("/autofill/map", response_model=AutofillMapResponse)
async def map_form_fields_to_profile(
    request: AutofillMapRequest,
    response: Response,
    current_user: Dict[str, Any] = Depends(get_current_user_with_complete_profile),
    db: AsyncSession = Depends(get_database),
) -> AutofillMapResponse:
    """
    Map serialized form field descriptors to profile-backed values using Gemini.

    The extension must show a preview and obtain user confirmation before writing DOM values.
    """
    user_id = _get_user_uuid(current_user)

    rate = await check_rate_limit_with_headers(
        identifier=f"{user_id}:extension_autofill_map",
        limit=_RATE_LIMIT,
        window_seconds=_RATE_WINDOW_S,
    )
    if not rate.allowed:
        raise rate_limit_error(
            f"Rate limit exceeded. Maximum {_RATE_LIMIT} autofill requests per hour. "
            f"Resets in {rate.reset_seconds} seconds.",
            retry_after=rate.reset_seconds,
        )
    for hk, hv in rate.get_headers().items():
        response.headers[hk] = hv

    user_api_key = await _get_user_api_key(db, user_id)
    if not user_api_key and not _server_has_llm():
        raise no_api_key_error()

    user_result = await db.execute(select(User).where(User.id == user_id))
    user_row = user_result.scalar_one_or_none()
    if not user_row:
        raise not_found_error(resource_type="User")

    profile_bundle, prof_sig = await _load_profile_bundle(db, user_id, user_row)
    extras_clean = _sanitize_extras(request.extras)

    fields_by_uid = {f.field_uid: f for f in request.fields}
    fields_compact = [_sanitize_field_dict(f) for f in request.fields]
    page_url_clean = sanitize_text(request.page_url.strip())[:_MAX_PAGE_URL_LEN]

    cache_payload: Dict[str, Any] = {
        "tool": "extension_autofill",
        "user_id": str(user_id),
        "page_url": page_url_clean,
        "fields": fields_compact,
        "profile_sig": prof_sig or "",
        "extras_sig": generate_hash(json.dumps(extras_clean, sort_keys=True)),
    }

    cached = await get_cached_tool_result("extension_autofill", cache_payload)
    warnings = [
        "Main page only: fields inside iframes or shadow roots are not included.",
        "Review every value before applying; the model can mis-map similar labels.",
    ]

    if cached and isinstance(cached, dict) and "assignments" in cached:
        raw_assign = [x for x in (cached.get("assignments") or []) if isinstance(x, dict)]
        assignments = _validate_assignments(raw_assign, fields_by_uid)
        raw_skip = cached.get("skipped") or []
        skipped_safe: List[Dict[str, str]] = []
        for s in raw_skip:
            if isinstance(s, dict) and isinstance(s.get("field_uid"), str):
                uid = s["field_uid"]
                if uid not in fields_by_uid:
                    continue
                skipped_safe.append(
                    {
                        "field_uid": sanitize_text(uid)[:64],
                        "reason": sanitize_text(str(s.get("reason", "")))[:500],
                    }
                )
        return AutofillMapResponse(assignments=assignments, skipped=skipped_safe, warnings=warnings)

    user_prompt = _build_user_prompt(fields_compact, profile_bundle, extras_clean, page_url_clean)

    try:
        client = await get_gemini_client()
        # Tool-level Redis cache (get_cached_tool_result) is sufficient; avoid a second
        # LLM-response cache layer that can drift from this endpoint's validation rules.
        gen = await client.generate(
            prompt=user_prompt,
            system=_SYSTEM_PROMPT,
            temperature=0.15,
            max_tokens=8192,
            use_cache=False,
            user_api_key=user_api_key,
            user_id=str(user_id),
        )
    except GeminiError as e:
        logger.error("Autofill LLM error: %s", e, exc_info=True)
        raise external_service_error(
            user_facing_message_from_llm_exception(e),
            error_code=ErrorCode.LLM_SERVICE_ERROR,
        )
    except Exception as e:
        logger.error("Autofill unexpected error: %s", e, exc_info=True)
        raise internal_error("Failed to generate autofill suggestions")

    raw_text = gen.get("response") or ""
    parsed = parse_json_from_llm_response(raw_text)
    if not isinstance(parsed, dict) or "assignments" not in parsed:
        logger.warning("Autofill parse failed; raw snippet: %s", raw_text[:400])
        raise external_service_error(
            "Could not parse AI response. Try again with fewer fields visible.",
            error_code=ErrorCode.LLM_SERVICE_ERROR,
        )

    parsed = sanitize_llm_output(parsed)
    raw_assignments = parsed.get("assignments") if isinstance(parsed.get("assignments"), list) else []
    skipped = parsed.get("skipped") if isinstance(parsed.get("skipped"), list) else []

    assignments = _validate_assignments(
        [x for x in raw_assignments if isinstance(x, dict)],
        fields_by_uid,
    )

    skipped_safe: List[Dict[str, str]] = []
    for s in skipped:
        if isinstance(s, dict) and isinstance(s.get("field_uid"), str):
            sk_uid = s["field_uid"]
            if sk_uid not in fields_by_uid:
                continue
            skipped_safe.append(
                {
                    "field_uid": sanitize_text(sk_uid)[:64],
                    "reason": sanitize_text(str(s.get("reason", "")))[:500],
                }
            )

    cache_body = {
        "assignments": [a.model_dump() for a in assignments],
        "skipped": skipped_safe,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await cache_tool_result("extension_autofill", cache_payload, cache_body)

    return AutofillMapResponse(assignments=assignments, skipped=skipped_safe, warnings=warnings)
