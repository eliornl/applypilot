#!/usr/bin/env python3
"""Create .env from .env.local.example with random secrets (Unix / macOS / manual dev)."""
from __future__ import annotations

import base64
import os
import secrets
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    env_path = root / ".env"
    example = root / ".env.local.example"
    if env_path.exists():
        print("  .env already exists — skipping.")
        return
    content = example.read_text(encoding="utf-8")
    jwt_val = secrets.token_urlsafe(48)
    enc_val = base64.urlsafe_b64encode(os.urandom(32)).decode()
    content = content.replace("REPLACE_WITH_STRONG_SECRET_AT_LEAST_32_CHARS", jwt_val)
    content = content.replace("REPLACE_WITH_FERNET_KEY", enc_val)
    env_path.write_text(content, encoding="utf-8")
    print("  .env created with auto-generated secrets.")


if __name__ == "__main__":
    main()
