"""
Conftest for agent unit tests.

Stubs GCP infrastructure modules that are not installed in the local dev/CI
environment (Cloud Tasks, Pub/Sub, etc.) so agent unit tests can run without
a GCP project or credentials.

This file is intentionally minimal — agent unit tests mock the Gemini client
directly and have no other infrastructure dependencies.
"""

import sys
from unittest.mock import MagicMock

# ---------------------------------------------------------------------------
# Stub unavailable GCP packages BEFORE any agent module is imported.
# The chain is:  agents/__init__.py
#                → agents/job_analyzer.py
#                → workflows/job_application_workflow.py
#                → api/websocket.py  →  api/workflow.py
#                → utils/cloud_tasks.py
#                → google.cloud.tasks_v2   ← not installed locally
# ---------------------------------------------------------------------------
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
