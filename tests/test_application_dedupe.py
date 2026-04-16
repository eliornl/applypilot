"""Tests for utils/application_dedupe.py."""

from utils.application_dedupe import (
    _effective_title_company,
    normalize_title_company_key,
)


def test_normalize_title_company_key_both_required() -> None:
    assert normalize_title_company_key("", "Co") is None
    assert normalize_title_company_key("Title", "") is None
    assert normalize_title_company_key(None, "Co") is None


def test_normalize_title_company_key_collapses_whitespace() -> None:
    key = normalize_title_company_key("  Senior   Engineer  ", "  Acme  Inc  ")
    assert key is not None
    assert key == ("senior engineer", "acme inc")


def test_effective_title_company_fallback_to_job_analysis() -> None:
    """Parity with dashboard: use job_analysis when application columns are empty."""
    class _App:
        job_title = None
        company_name = None

    class _Ws:
        job_analysis = {"job_title": "Engineer", "company_name": "North Island Ventures"}

    assert _effective_title_company(_App(), _Ws()) == ("Engineer", "North Island Ventures")
