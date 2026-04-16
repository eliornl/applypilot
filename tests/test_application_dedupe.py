"""Unit tests for application deduplication helpers."""

from api.workflow import _fingerprint_job_content


def test_fingerprint_matches_after_zero_width_and_nfc_normalization():
    """Extension vs browser paste can differ by invisible characters only."""
    filler = (
        "We are hiring a Staff Fullstack Engineer to join our payments team. "
        "You will build APIs, collaborate with product, and improve reliability. "
        "Requirements: Python, PostgreSQL, distributed systems experience. "
    )
    a = filler + "x" * 30
    b = "\u200b" + filler + "x" * 30
    fa = _fingerprint_job_content(a)
    fb = _fingerprint_job_content(b)
    assert fa is not None and fb is not None
    assert fa == fb
