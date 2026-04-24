#!/usr/bin/env python3
"""
Run Alembic from a temp cwd so the repo's ./alembic/ tree does not shadow the installed package.

Invoked by Just/Makefile as: python scripts/run_alembic.py upgrade|current
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("upgrade", "current"):
        print("Usage: run_alembic.py upgrade|current", file=sys.stderr)
        sys.exit(2)
    cmd = sys.argv[1]
    project = _project_root()
    root = str(project)
    if root not in sys.path:
        sys.path.append(root)

    from dotenv import load_dotenv

    # Load before chdir so nothing relies on cwd; path is absolute.
    load_dotenv(project / ".env")
    os.chdir(tempfile.gettempdir())

    from alembic import command
    from alembic.config import Config

    cfg = Config(str(project / "alembic.ini"))
    cfg.set_main_option("script_location", str(project / "alembic"))
    if cmd == "upgrade":
        command.upgrade(cfg, "head")
        print("Migrations applied.")
    else:
        command.current(cfg, verbose=True)


if __name__ == "__main__":
    main()
