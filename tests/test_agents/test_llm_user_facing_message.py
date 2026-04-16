"""Tests for user_facing_message_from_llm_exception (quota / rate-limit copy)."""

from utils.llm_client import (
    GeminiError,
    user_facing_message_from_llm_exception,
    _GEMINI_QUOTA_USER_MESSAGE,
)


def test_quota_valueerror_maps_to_friendly_message() -> None:
    raw = (
        "AI extraction failed: Generate failed: 429 RESOURCE_EXHAUSTED. "
        "{'error': {'message': 'You exceeded your current quota'"
    )
    assert user_facing_message_from_llm_exception(ValueError(raw)) == _GEMINI_QUOTA_USER_MESSAGE


def test_resource_exhausted_alone_maps() -> None:
    assert (
        user_facing_message_from_llm_exception(RuntimeError("RESOURCE_EXHAUSTED"))
        == _GEMINI_QUOTA_USER_MESSAGE
    )


def test_unrelated_error_passthrough() -> None:
    assert user_facing_message_from_llm_exception(ValueError("bad json")) == "bad json"


def test_gemini_error_with_original_chain() -> None:
    inner = Exception(
        "429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'quota'}}"
    )
    ge = GeminiError("Generate failed", original_error=inner)
    assert user_facing_message_from_llm_exception(ge) == _GEMINI_QUOTA_USER_MESSAGE
