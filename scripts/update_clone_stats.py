#!/usr/bin/env python3
"""Merge GitHub Traffic clone stats into docs/clone-stats.json.

GitHub only retains ~14 days of Traffic. This script persists each day so
cumulative totals survive. Days already in history are left unchanged
(Traffic can revise the current day).

Usage:
  python scripts/update_clone_stats.py --input clones.json --stats docs/clone-stats.json
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {
            "total_clones": 0,
            "baseline_clones": 0,
            "tracked_clones": 0,
            "history": {},
        }
    return json.loads(path.read_text())


def merge_traffic(stats: Dict[str, Any], traffic: Dict[str, Any]) -> Dict[str, Any]:
    history: Dict[str, Any] = dict(stats.get("history") or {})
    baseline = int(stats.get("baseline_clones") or 0)

    for row in traffic.get("clones") or []:
        day = str(row["timestamp"])[:10]
        count = int(row["count"])
        uniques = int(row["uniques"])
        # Always refresh known days (GitHub revises "today"); only new days
        # increase the long-term tracked sum via recomputation below.
        history[day] = {"count": count, "uniques": uniques}

    tracked = sum(int(v["count"]) for v in history.values())
    stats["baseline_clones"] = baseline
    stats["tracked_clones"] = tracked
    stats["total_clones"] = baseline + tracked
    stats["last_14_days_clones"] = traffic.get("count")
    stats["last_14_days_uniques"] = traffic.get("uniques")
    stats["last_updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    stats["history"] = dict(sorted(history.items()))
    if "baseline_note" not in stats:
        stats["baseline_note"] = (
            "baseline_clones estimates clones before automated daily tracking; "
            "tracked_clones is the sum of persisted daily Traffic rows."
        )
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to raw Traffic /clones JSON from the GitHub API",
    )
    parser.add_argument(
        "--stats",
        type=Path,
        default=Path("docs/clone-stats.json"),
        help="Persisted stats file to update",
    )
    args = parser.parse_args()

    traffic = json.loads(args.input.read_text())
    stats = merge_traffic(_load_json(args.stats), traffic)
    args.stats.parent.mkdir(parents=True, exist_ok=True)
    args.stats.write_text(json.dumps(stats, indent=2) + "\n")
    print(
        f"Updated {args.stats}: total_clones={stats['total_clones']} "
        f"(baseline={stats['baseline_clones']} + tracked={stats['tracked_clones']})"
    )


if __name__ == "__main__":
    main()
