"""
JSON utilities for handling UUID serialization and other custom types.
"""

import json
import uuid
from datetime import datetime
from typing import Any


class CustomJSONEncoder(json.JSONEncoder):
    """
    Custom JSON encoder that handles UUID and datetime objects.
    """

    def default(self, obj: Any) -> Any:
        if isinstance(obj, uuid.UUID):
            return str(obj)  # Convert UUID to string
        if isinstance(obj, datetime):
            return obj.isoformat()  # Convert datetime to ISO format string
        return super().default(obj)


def serialize_object_for_json(obj: Any, _seen: set | None = None, _depth: int = 0) -> Any:
    """
    Recursively convert a Python object to be JSON serializable,
    handling special types like UUID and datetime.

    Guards against circular references and excessive nesting depth.
    """
    _MAX_DEPTH = 50
    if _depth > _MAX_DEPTH:
        return "<max depth exceeded>"

    if _seen is None:
        _seen = set()

    if isinstance(obj, uuid.UUID):
        return str(obj)
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    elif isinstance(obj, dict):
        obj_id = id(obj)
        if obj_id in _seen:
            return "<circular reference>"
        _seen = _seen | {obj_id}
        return {k: serialize_object_for_json(v, _seen, _depth + 1) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        obj_id = id(obj)
        if obj_id in _seen:
            return "<circular reference>"
        _seen = _seen | {obj_id}
        result = [serialize_object_for_json(item, _seen, _depth + 1) for item in obj]
        return tuple(result) if isinstance(obj, tuple) else result
    else:
        return obj
