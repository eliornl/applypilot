# Workflow start — duplicate job detection

This document describes server-side deduplication for `POST /api/v1/workflow/start` and how clients should handle **`RES_3002`** (HTTP **409**).

## When a duplicate is detected

Before creating a new `WorkflowSession` / `JobApplication`, the API checks for an existing **non-deleted** application for the same user that matches **any** of:

| Signal | Notes |
|--------|--------|
| Canonical job URL | `JobApplication.job_url` is compared using `_canonical_job_url()` (scheme, host, path, sorted query). |
| Title + company | Both sides normalized (trim, collapse whitespace, lower case). Requires non-empty title and company on **both** the incoming request and the stored row. |
| Content fingerprint | SHA-256 hex digest of normalized full job text. Only computed when normalized length **≥ 80** characters (`_MIN_JOB_CONTENT_FINGERPRINT_CHARS`). Stored under `WorkflowSession.job_input_data["content_fingerprint"]` for manual paste, file upload, and extension flows (URL-only starts do not set a fingerprint). |

If a match is found, the API raises **`ErrorCode.RESOURCE_ALREADY_EXISTS`** (`error_code`: **`RES_3002`**) with HTTP **409**. Response `details` include `application_id` and, when present, `session_id` (entries with `code: "DUPLICATE_APPLICATION"`).

The handler **deletes** the Redis key `workflow_creating:{user_id}` before returning so a duplicate attempt does not leave the client blocked on the short-lived creation lock.

## Client behavior

- **Dashboard — new application** (`dashboard-new-application.js`): show a **warning**-style alert with the server `message`; do not treat as a hard 500-style failure.
- **Dashboard — job form** (`dashboard.js`): `apiCall` surfaces `errorCode`; use warning styling for `RES_3002`.
- **Chrome extension** (`extension/popup/popup.js`, `extension/background/service-worker.js`): show the message in the **inline** `#popupNotification` bar (info/warning), not a generic fetch error.

## Tests

See `tests/test_api/test_workflow.py` (duplicate URL and duplicate manual/extension-style text scenarios).

## Related rules

- `.cursor/rules/applypilot-core.mdc` — `RES_3002` section  
- `.cursor/rules/dashboard-home.mdc` — toast deduplication and `RES_3002`  
- `.cursor/rules/chrome-extension.mdc` — popup notification bar and `RES_3002`  
