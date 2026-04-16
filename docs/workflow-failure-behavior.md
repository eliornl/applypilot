# Workflow failure behavior (client-facing)

This document describes how ApplyPilot handles a **failed** job-application workflow (any agent error, quota exhaustion, etc.) so the dashboard and APIs stay consistent.

## Principles

1. **Single outcome** — If any workflow agent fails, the session ends in `workflow_status = failed`. There is no “partial success” row of analysis data exposed to the client.
2. **No agent names in user copy** — Stored `error_messages` and WebSocket payloads use plain language from `user_facing_message_from_llm_exception()` in `utils/llm_client.py`. Which agent failed remains in `failed_agents` and server logs only.
3. **Strip persisted outputs** — On `failed`, JSONB columns on `workflow_sessions` (`job_analysis`, `company_research`, `profile_matching`, `resume_recommendations`, `cover_letter`) are cleared so partial LLM blobs are not retained for that session.
4. **Soft-delete the application row** — Background failure paths call `_soft_delete_job_application_for_failed_workflow()` in `api/workflow.py`, which sets `job_applications.deleted_at` and `status = failed` when the update matches the session.

## Dashboard list and stats

`GET /api/v1/applications/` and `GET /api/v1/applications/stats/overview` apply **`_dashboard_application_visibility_filter()`** in `api/applications.py`:

- Exclude soft-deleted rows and rows whose `job_applications.status` is `failed`.
- **LEFT JOIN** `workflow_sessions` on `job_applications.session_id` and **exclude** rows where `workflow_sessions.workflow_status = 'failed'`.

This addresses a race: `job_applications` can still be `processing` while `workflow_sessions` is already `failed`, and `_format_application_response()` would otherwise surface a **FAILED** badge from workflow state alone. The join hides those cards until the application row is updated or soft-deleted.

## Dashboard toast

`ui/static/js/dashboard-home.js`:

- **`formatWorkflowFailureDetail()`** — Shortens quota/rate-limit noise and strips legacy `[agent_name]` prefixes from old rows.
- **`notifyReady(..., failed, failureDetail)`** — On failure, shows message + dismiss only (no navigation button), since failed analyses are not listed.

## Code map

| Area | Files |
|------|--------|
| LangGraph routing, parallel merge, clear outputs | `workflows/job_application_workflow.py` |
| Append errors without agent prefix | `workflows/state_schema.py` (`add_error`) |
| Session + job_application updates, strip on exception | `api/workflow.py` |
| List/stats visibility filter | `api/applications.py` |
| User-facing exception strings | `utils/llm_client.py` |
