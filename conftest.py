"""
Root-level conftest.

Stubs GCP infrastructure packages that are not installed locally so that
agent unit tests (tests/test_agents/) can import agent modules without a
GCP project or credentials.

The stub must be in place BEFORE any other conftest or test module imports
application code, which is why it lives at the project root (loaded first).
"""

import sys
from unittest.mock import MagicMock

_GCP_STUBS = [
    "google.cloud.tasks_v2",
    "google.cloud.tasks_v2.services",
    "google.cloud.tasks_v2.services.cloud_tasks",
    "google.cloud.tasks_v2.types",
    "google.cloud.pubsub_v1",
]
for _mod in _GCP_STUBS:
    if _mod not in sys.modules:
        sys.modules[_mod] = MagicMock()
