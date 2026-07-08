# =============================================================================
# CONSTANTS AND CONFIGURATION
# =============================================================================

from __future__ import annotations

from typing import Any, Dict, List


# =============================================================================
# CLASSES/FUNCTIONS
# =============================================================================


def format_autofill_map(data: Dict[str, Any]) -> str:
    """Human-readable autofill assignments preview."""
    lines: List[str] = ["# Autofill map result", ""]

    assignments = data.get("assignments") or []
    if assignments:
        lines.append(f"## Assignments ({len(assignments)})")
        for item in assignments:
            if not isinstance(item, dict):
                continue
            uid = item.get("field_uid", "?")
            label = item.get("label_text") or "Field"
            value = item.get("value", "")
            lines.append(f"- [{uid}] {label} → {value}")
        lines.append("")

    skipped = data.get("skipped") or []
    if skipped:
        lines.append(f"## Skipped ({len(skipped)})")
        for item in skipped:
            if not isinstance(item, dict):
                continue
            uid = item.get("field_uid", "?")
            reason = item.get("reason", "")
            lines.append(f"- [{uid}] {reason}")
        lines.append("")

    warnings = data.get("warnings") or []
    if warnings:
        lines.append("## Warnings")
        for warning in warnings:
            lines.append(f"- {warning}")

    return "\n".join(lines).rstrip()
