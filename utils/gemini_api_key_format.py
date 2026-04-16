"""
Loose format check for Google Gemini / Google AI Studio API keys.

Keys were historically `AIza…` strings; Google may issue other URL-safe / base64-style
shapes. We only reject obvious junk (too short/long, whitespace, disallowed characters)
— real validity is enforced by the API when used.
"""

import re
from typing import Final

_MIN_LEN: Final[int] = 12
_MAX_LEN: Final[int] = 1024
# URL-safe base64 alphabet plus slash/dot (covers rotated Google key formats).
_KEY_RE = re.compile(rf"^[A-Za-z0-9_=+\/.-]{{{_MIN_LEN},{_MAX_LEN}}}$")


def validate_gemini_api_key(api_key: str) -> bool:
    """
    Return True if the string plausibly looks like a Gemini API key.

    This is intentionally permissive so we do not reject formats Google introduces.
    """
    if not api_key or not api_key.strip():
        return False
    k = api_key.strip()
    # No embedded whitespace (catches accidental multi-line pastes)
    if any(c.isspace() for c in k):
        return False
    return bool(_KEY_RE.match(k))
