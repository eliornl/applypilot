# ApplyPilot — Claude Code Rules Index

**Product name:** ApplyPilot (repo folder: `applypilot`).

All detailed rules live in `.claude/rules/`. Read the relevant file(s) **before** working in that area. Never load all files — only pull what the task needs.

---

## Rule Files

| File | Read when... |
|------|-------------|
| `.claude/rules/applypilot-core.mdc` | any task — app name, `APIError`/`ErrorCode`, background tasks, route prefixes |
| `.claude/rules/python-conventions.mdc` | writing or editing any Python file |
| `.claude/rules/database-patterns.mdc` | touching models, migrations, JSONB fields, SQLAlchemy queries |
| `.claude/rules/auth-patterns.mdc` | auth endpoints, JWT, login, registration, token revocation, lockout |
| `.claude/rules/security-python.mdc` | any security-sensitive Python code (XSS, file upload, tokens, secrets) |
| `.claude/rules/security-middleware.mdc` | middleware, CORS, CSP, `.is-hidden`, maintenance mode |
| `.claude/rules/settings-and-env.mdc` | env vars, `get_settings()`, `.env`, `ENCRYPTION_KEY` |
| `.claude/rules/llm-integration.mdc` | Gemini client, BYOK, `asyncio.wait_for()`, JSON parsing, `thinking_budget` |
| `.claude/rules/agent-patterns.mdc` | workflow agents, `workflow_preferences`, BYOK model override |
| `.claude/rules/interview-prep-feature.mdc` | interview prep agent, background task, Redis lock, rate limit |
| `.claude/rules/career-tools.mdc` | 6 career tool agents, endpoints, rate limits, output schemas, copy button |
| `.claude/rules/caching-redis.mdc` | cache TTLs, Redis helpers, rate limiting, auth-specific keys |
| `.claude/rules/websocket-patterns.mdc` | WebSocket endpoints, connection limits, broadcast helpers |
| `.claude/rules/logging-patterns.mdc` | `StructuredLogger`, redaction, `exc_info=True`, bulk-script safety |
| `.claude/rules/google-oauth.mdc` | OAuth flow, CSRF state in Redis, exchange-code pattern, open-redirect |
| `.claude/rules/email-and-misc-utils.mdc` | Gmail SMTP, resume parser, BYOK encryption |
| `.claude/rules/frontend-js-strict.mdc` | any `.js` file — JSDoc, null safety, event delegation, no `style=` attrs |
| `.claude/rules/landing-page.mdc` | `index.html`, landing page sections, screenshot showcase |
| `.claude/rules/dashboard-home.mdc` | dashboard app list, search/filter/sort, card CSS, session storage |
| `.claude/rules/ui-application-detail.mdc` | application detail page, 8-tab layout, render functions, CSS classes |
| `.claude/rules/accessibility.mdc` | any template — WCAG 2.1 AA, heading hierarchy, landmarks, aria |
| `.claude/rules/analytics-consent-onboarding.mdc` | PostHog, cookie consent, onboarding tour |
| `.claude/rules/chrome-extension.mdc` | anything inside `chrome-extension/` |
| `.claude/rules/adding-new-features.mdc` | adding a new endpoint, agent, tool, migration, asset, or preference |
| `.claude/rules/settings-page.mdc` | settings tabs, Preferences, AI Setup, auto-save, account-icon variants |
| `.claude/rules/frontend-build-pipeline.mdc` | esbuild, `asset_url()`, new JS/CSS files, manifest, `make build-frontend` |
| `.claude/rules/mobile-responsive.mdc` | breakpoints, navbar collapse, scrollable tab bars, mobile utilities |
| `.claude/rules/unit-testing.mdc` | writing or running tests in `tests/test_agents/` or `tests/test_api/` |
| `.claude/rules/e2e-testing.mdc` | Playwright specs, `setupAuth`, `page.route()`, JWT/cookie-consent setup |

---

## Non-Negotiables (always true — no file needed)

1. **Never raise bare `HTTPException`** — use `APIError` / `not_found_error()` / `rate_limit_error()` etc. from `utils/error_responses.py`
2. **Never call `flag_modified()` zero times on a JSONB mutation** — every write to a JSONB field needs it
3. **Background tasks use `get_session()`**, not `get_database()` (request-scoped)
4. **All `run_in_executor` LLM calls must be wrapped in `asyncio.wait_for()`**
5. **Never add inline `onclick=` / `onchange=` attributes** — use event delegation + `data-action`
6. **Never use `random` for security values** — always use `secrets`
7. **Never put a JWT in an HTTP redirect URL** — use the OAuth exchange-code pattern; WebSocket `?token=` is the only exception
8. **Never return user-existence hints from unauthenticated endpoints** — forgot-password and resend-verification always return identical responses
9. **`ENCRYPTION_KEY` must be set before any `JWT_SECRET` rotation**
10. **`DEBUG` must be `false` in any shared environment**
11. **Never hardcode `/static/js/` or `/static/css/` in templates** — always use `{{ asset_url('js/...') }}` / `{{ asset_url('css/...') }}`
12. **Never write `except Exception: pass`** — always log at minimum `logger.debug(..., exc_info=True)`
13. **Every background task top-level `except` must call `await report_exception(exc, user_id=user_id)`** and log with `exc_info=True`
14. **Every `logger.error(...)` inside an `except` block must include `exc_info=True`**
15. **Never add `style="..."` HTML attributes** — CSP blocks inline styles; use CSS classes
16. **Every `<style>` block in a template must include `nonce="{{ request.state.csp_nonce | default('') }}"`**
17. **Never use native `confirm()`, `alert()`, or `prompt()`** — use `window.showConfirm()` from `confirm-modal.js`
18. **Never inject `<style>` elements from JavaScript** — dynamically created `<style>` tags are blocked by CSP
19. **`thinking_budget=0` must always be set in `GenerateContentConfig`** — Gemini 2.5/3 Flash enables thinking by default, burning the output token budget
20. **`google-generativeai` is removed — never add it back** — use `google-genai` for both Vertex AI and BYOK paths
21. **`check_account_lockout()` returns a tuple — always unpack it** — `if await check_account_lockout(email):` is ALWAYS truthy; always write `is_locked, remaining = await check_account_lockout(email)`
22. **Never mention specific job site names in user-facing text** — use "any job site", "any job board", "company careers pages"
23. **`datetime.strptime()` results must have `.replace(tzinfo=timezone.utc)`** before comparing with timezone-aware datetimes
24. **`escapeHtml()` must decode `&amp;` FIRST** — canonical order: `&amp;` → `&`, then `&#x27;`, `&#039;`, `&quot;`, `&lt;`, `&gt;`, then re-encode
25. **`.textContent` assignments must use `decodeEntities()`** — `.textContent` does not interpret HTML entities; `escapeHtml()` is for `.innerHTML` only
