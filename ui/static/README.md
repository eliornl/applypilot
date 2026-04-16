# UI Static Assets

Static assets for the ApplyPilot frontend.

## Directory Structure

```
ui/static/
├── css/
│   └── style.css                       # Main dark theme stylesheet
├── js/
│   ├── jsconfig.json                   # TypeScript strict-mode config (checkJs)
│   ├── types.js                        # Shared JSDoc type definitions
│   │
│   ├── app.js                          # Core app class — auth, API, notifications
│   ├── auth.js                         # AuthManager class
│   ├── profile.js                      # ProfileManager class
│   ├── event-bus.js                    # Custom publish/subscribe event bus
│   │
│   ├── dashboard.js                    # DashboardManager + WebSocket
│   ├── dashboard-home.js               # Home tab
│   ├── dashboard-new-application.js    # New application workflow form
│   ├── dashboard-history.js            # Application history page
│   ├── dashboard-tools.js              # Career tools page (6 tools)
│   ├── dashboard-settings.js           # Settings page + API key management
│   ├── dashboard-interview-prep.js     # Interview prep tab
│   ├── application-detail.js           # Application detail — 7-tab page
│   │
│   ├── auth-login.js                   # Login page
│   ├── auth-register.js                # Registration page
│   ├── auth-reset-password.js          # Password reset page
│   ├── auth-verify-email.js            # Email verification page
│   │
│   ├── profile-setup.js                # 5-step profile setup wizard
│   │
│   ├── cookie-consent.js               # GDPR cookie consent banner
│   ├── onboarding.js                   # New user onboarding tour
│   ├── analytics.js                    # PostHog analytics integration
│   ├── help.js                         # Help page
│   └── landing.js                      # Landing page
├── img/
│   └── pattern.svg                     # Background pattern
└── favicon.ico                         # Site favicon
```

---

## TypeScript Strict Mode

All 23 JavaScript files are checked by TypeScript in **strict mode** via `jsconfig.json`:

```json
{
  "compilerOptions": {
    "checkJs": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

Zero linter errors are expected across the entire `ui/static/js/` directory.

---

## `app.js` — Core Application (`JobApplicationAssistant`)

The `app.js` module is the foundation that every other page-level file depends on. It exposes a global `window.app` instance of the `JobApplicationAssistant` class.

### Public API surface

| Method | Signature | Purpose |
|--------|-----------|---------|
| `apiCall` | `(endpoint, method?, data?) → Promise<any>` | Authenticated HTTP request with automatic token refresh on 401 |
| `getAuthToken` | `() → string\|null` | Read JWT from `localStorage` (`authToken` or `access_token`) |
| `showNotification` | `(message, type?) → void` | Show a Bootstrap toast (`success`, `error`, `warning`, `info`) |
| `escapeHtml` | `(str) → string` | XSS-safe HTML entity encoding |
| `formatStatus` | `(status) → string` | Convert snake_case status to human-readable label |
| `formatFileSize` | `(bytes) → string` | e.g. `1.4 MB` |
| `copyToClipboard` | `(text, successMsg?) → Promise<void>` | Clipboard API with success toast |

### Usage from any page-level file

```javascript
// @ts-ignore
const app = window.app;

// API call
const data = await app.apiCall('/api/v1/profile');

// Notification
app.showNotification('Profile saved!', 'success');

// XSS-safe rendering
container.innerHTML = app.escapeHtml(userInput);
```

---

## Notification Pattern — `notify()` Helper

Every page-level file (e.g. `dashboard-history.js`) defines a `notify()` helper that delegates to `window.app.showNotification()` with an HTML fallback for early-load timing:

```javascript
/**
 * @param {string} msg
 * @param {'success'|'error'|'warning'|'info'} [type]
 */
function notify(msg, type = 'info') {
    // @ts-ignore
    if (window.app && window.app.showNotification) {
        // @ts-ignore
        window.app.showNotification(msg, type);
        return;
    }
    // Inline fallback — msg MUST be escaped; it may contain API error text
    const c = document.getElementById('alertContainer');
    if (!c) return;
    const d = document.createElement('div');
    d.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show`;
    d.innerHTML = `${escapeHtml(msg)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
    c.appendChild(d);
    setTimeout(() => d.remove(), 5000);
}
```

Never use `alert()`, bare `showAlert()`, or direct `alertContainer.innerHTML` insertion in new code.

---

## Security: XSS Prevention

**Every page-level file defines a local `escapeHtml()` function.** It must be applied to all potentially-untrusted content (LLM output, user-supplied text, API field values) before inserting into `innerHTML`.

```javascript
/**
 * Escape special HTML characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

**Usage rules:**

| Content type | Method |
|---|---|
| Plain text from API / LLM | `escapeHtml(value)` inside template literal |
| Plain text (no tags needed) | `element.textContent = value` |
| Trusted static HTML | Allowed without escaping |
| Rendered markdown / rich HTML | Sanitise first; never raw-insert LLM output |

```javascript
// ✅ Correct
container.innerHTML = `<h2>${escapeHtml(data.job_title)}</h2>`;

// ❌ Wrong — direct insertion of API data
container.innerHTML = `<h2>${data.job_title}</h2>`;
```

`window.app.escapeHtml()` also exists and can be used directly; the local copy is the fallback for files loaded before `app.js`.

---

## Authentication Token Retrieval — `getAuthToken()` Wrapper

**Every page-level file defines a local `getAuthToken()` function** that delegates to `window.app.getAuthToken()` and falls back to `localStorage` only when `window.app` is not yet available (early-load timing). Never call `localStorage.getItem('access_token')` directly in fetch headers.

```javascript
/**
 * @returns {string|null}
 */
function getAuthToken() {
    // @ts-ignore
    return (window.app && typeof window.app.getAuthToken === 'function')
        ? window.app.getAuthToken()
        : (localStorage.getItem('access_token') || localStorage.getItem('authToken'));
}
```

```javascript
// ✅ Correct — always use the wrapper
const res = await fetch('/api/v1/something', {
    headers: { 'Authorization': `Bearer ${getAuthToken()}` }
});

// ❌ Wrong — bypasses centralized token management
const res = await fetch('/api/v1/something', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
});
```

---

## When to Use `window.app.apiCall()` vs Raw `fetch()`

`window.app.apiCall()` returns parsed JSON and throws on non-2xx responses with automatic 401 → token-refresh retry. Use it for all standard JSON API calls.

Use raw `fetch()` only for:

| Scenario | Reason |
|---|---|
| Binary downloads (PDF, DOCX) | `apiCall()` calls `.json()` — binary responses fail |
| Custom HTTP status handling (e.g. check `429` before throwing) | `apiCall()` throws before you can inspect the status |

When using raw `fetch()`, always inject the token via `getAuthToken()`:

```javascript
// ✅ Raw fetch — only for binary or status-specific logic
const res = await fetch('/api/v1/export/pdf', {
    headers: { 'Authorization': `Bearer ${getAuthToken()}` }
});
if (!res.ok) { ... }
const blob = await res.blob();
```

---

## Event Delegation Pattern

**Never put `onclick` / `onchange` attributes on dynamically-generated HTML.** Instead, attach a single delegated listener to the stable parent container and route with `data-action` attributes.

```javascript
// ✅ Correct — one listener, any number of dynamic children
container.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const btn = target.closest('[data-action]');
    if (!btn) return;
    const id = /** @type {HTMLElement} */ (btn).dataset['id'] || '';
    switch (/** @type {HTMLElement} */ (btn).dataset['action']) {
        case 'view':   openItem(id); break;
        case 'delete': deleteItem(id); break;
    }
});

// Dynamic HTML — use data attributes + aria-label, no onclick
function renderCard(item) {
    return `
        <div class="card" data-card-id="${escapeHtml(item.id)}">
            <button data-action="delete" data-id="${escapeHtml(item.id)}"
                    aria-label="Delete ${escapeHtml(item.title)}">
                <i class="fas fa-trash"></i>
            </button>
        </div>`;
}

// ❌ Wrong — inline handler, forces global function, no aria-label
function renderCard(item) {
    return `<button onclick="deleteItem('${item.id}')">Delete</button>`;
}
```

Always add `aria-label` to icon-only buttons generated in dynamic HTML.

---

## Debounce Pattern

Use a local timer variable — there is no shared debounce utility:

```javascript
let searchTimer = 0;
input.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const el = /** @type {HTMLInputElement} */ (e.target);
    searchTimer = window.setTimeout(() => runSearch(el.value), 300);
});
```

**`beforeunload` cleanup is required** for any `setTimeout` that lives beyond a single interaction. If debounce timers are set up inside `setupEventListeners()` or similar functions, declare them at module scope so a `beforeunload` handler can reach them:

```javascript
// ✅ Correct — module-level timer for cleanup
let _searchTimer = 0;

function setupSearch() {
    input.addEventListener('input', () => {
        clearTimeout(_searchTimer);
        _searchTimer = window.setTimeout(runSearch, 300);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupSearch();
    window.addEventListener('beforeunload', () => clearTimeout(_searchTimer));
});
```

---

## JavaScript Files

### `app.js` — Core Application
- `JobApplicationAssistant` class — global `window.app` singleton
- Authenticated API communication (`apiCall()`) with automatic token refresh
- Notification system (`showNotification()`)
- Shared utilities: `escapeHtml()`, `formatStatus()`, `formatFileSize()`, `copyToClipboard()`, `getAuthToken()`
- File upload handling, form validation, Bootstrap modal helpers

### `auth.js` — Authentication Manager
- `AuthManager` class — handles auth state for login, register, OAuth
- Password strength validation
- Session management and token storage

### `profile.js` — Profile Management
- `ProfileManager` class
- Profile data CRUD via API
- Skills tagging system

### `event-bus.js` — Event Bus
- Lightweight publish/subscribe bus (`window.eventBus`)
- Decouples modules without tight coupling
- `BusEvents` enum provides a single source-of-truth for all event name strings — always use the constant, never a raw string
- Defined event domains: `auth:*`, `workflow:*`, `profile:*`, `application:*`, `tool:*`, `apikey:*`, `settings:*`, `notify:*`

```javascript
// ✅ Correct — use BusEvents constant
// @ts-ignore
window.eventBus.emit(window.BusEvents.APPLICATION_CREATED, { id: appId });

// ❌ Wrong — raw string typos are silent
window.eventBus.emit('application:create', { id: appId });
```

### `dashboard.js` — Dashboard Manager
- `DashboardManager` class
- WebSocket connection for real-time workflow updates
- Application filtering and search (debounced 300 ms)
- Chart.js statistics visualization
- Delegates: `apiCall()`, `formatFileSize()`, `escapeHtml()`, `copyToClipboard()` → `window.app`

### `dashboard-home.js` — Home Tab
- Recent activity feed
- Quick stats rendering
- Local `escapeHtml()` applied to all dynamic card content
- Local `getAuthToken()` wrapper used for all API authentication
- Event delegation on `#applicationsList` for status update, download, and delete actions via `data-action` / `data-id` attributes
- Delegates notifications via `notify()` → `window.app.showNotification()`

### `dashboard-new-application.js` — New Application
- Job input: paste text or **upload a file** — **`.pdf`**, **`.txt`**, **`.docx`** (max **5 MB**); validates extensions client-side before `POST /api/v1/workflow/start` (`job_file`)
- Polling interval for workflow progress (`beforeunload` cleanup registered)
- Delegates notifications via `notify()`

### `dashboard-history.js` — Application History
- Application list with filtering and pagination
- Local `escapeHtml()` applied to all card and table content
- Local `getAuthToken()` wrapper used for all API authentication
- Event delegation on `#applicationsGrid` / `#applicationsTableBody` for view, download, delete, and select actions
- Pagination links use `data-page` attributes — no inline `onclick`
- Delegates notifications via `notify()`

### `dashboard-tools.js` — Career Tools
- Forms for all 6 career tools (Thank You, Rejection, Reference, Job Comparison, Follow-up, Salary Coach)
- Local `escapeHtml()` applied to all LLM-generated output before `innerHTML` insertion
- Local `getAuthToken()` wrapper used for all API authentication
- `copyToClipboard()` and `copyAllScripts()` delegate to `window.app`
- Delegates notifications via `notify()`

### `dashboard-settings.js` — Settings
- API key management (BYOK)
- Account settings and password change
- Local `getAuthToken()` wrapper used for all API authentication
- Google account link/unlink buttons use `addEventListener` (not inline `onclick`)
- Delegates notifications via `notify()`

### `dashboard-interview-prep.js` — Interview Prep
- Interview prep generation and display
- `escapeHtml()` delegates to `window.app.escapeHtml()`
- Delegates notifications via `notify()`

### `application-detail.js` — Application Detail
- 7-tab application detail page (Company, Your Fit, Strategy, Job Details, Cover Letter, Resume, Interview)
- Local `escapeHtml()` applied extensively to all LLM-generated and job data before `innerHTML` insertion
- Local `getAuthToken()` wrapper used for all API authentication (covers regenerate and interview prep calls)
- Event delegation on tab panes for regenerate and copy buttons via `data-action` attributes with `aria-label`
- Per-tab copy and PDF export actions
- `showToast()`, `copyText()`, `copyTabContent()`, `copyCoverLetter()` delegate to `window.app`

### `auth-login.js` — Login Page
- Login form with password toggle and "remember me"
- Email validation debounced at 300 ms via module-level `emailValidationTimeout`
- `beforeunload` listener clears `emailValidationTimeout` to prevent late-firing callbacks after navigation

### `auth-register.js` — Registration Page
- Registration with client-side validation
- Password, full name, and email validators debounced at 300 ms
- Module-level `_passwordTimer`, `_emailTimer`, `_nameTimer` allow the `beforeunload` handler to clear all pending timers

### `auth-reset-password.js` — Password Reset
- Token-based password reset form

### `auth-verify-email.js` — Email Verification
- Email verification link handler

### `profile-setup.js` — Profile Setup Wizard
- 5-step profile setup (Quick Start → Basic Info → Work Experience → Skills → Preferences)
- Resume upload with AI auto-fill
- Internal API helper `makeAuthenticatedApiCall()` (self-contained, intentional)
- **Years of experience = 0** — required-field and save logic must not use bare truthiness (`if (!years_experience)` / `if (!data[field])` after `parseInt`) — `0` is valid. Populate the numeric input when the saved value is `0` (`!== undefined && !== null`, not `if (years_experience)`). See `.cursor/rules/frontend-js-strict.mdc` (“Required numeric fields”).

### `cookie-consent.js` — Cookie Consent
- GDPR-compliant consent banner
- Essential / functional / analytics categories
- Consent stored in `localStorage`

### `onboarding.js` — Onboarding Tutorial
- Interactive 6-step walkthrough for new users (`window.Onboarding`)
- Auto-shows on first dashboard visit

### `analytics.js` — Analytics
- PostHog integration (`window.Analytics`)
- Only tracks if analytics cookie consent is given
- Event helpers: `track()`, `trackFeature()`, `identify()`, `trackWorkflowStarted()`, `trackWorkflowCompleted()`

### `help.js` — Help Page
- FAQ accordion and search

### `landing.js` — Landing Page
- Scroll animations and feature tab switching

### `types.js` — Type Definitions
- JSDoc `@typedef` definitions shared across files
- Types: `User`, `UserProfile`, `Application`, `WorkflowSession`, WebSocket message types

---

## CSS

### `style.css` — Dark Theme

Modern dark theme with:
- Primary background: `#0a0a0f`
- Card background: `#111118`
- Accent colors: Cyan (`#00d4ff`), Purple (`#7c3aed`)
- Bootstrap 5 customizations
- Responsive design

---

## Usage

```html
<!-- CSS in <head> -->
<link rel="stylesheet" href="/static/css/style.css">

<!-- Load app.js first — all other files depend on window.app -->
<script src="/static/js/app.js"></script>

<!-- Load other scripts as needed before </body> -->
<script src="/static/js/dashboard.js"></script>
<script src="/static/js/dashboard-home.js"></script>
```

---

## Anti-Patterns (Never Do These)

| Anti-pattern | Correct alternative |
|---|---|
| `innerHTML = \`…${userValue}…\`` without escaping | `innerHTML = \`…${escapeHtml(userValue)}…\`` |
| `d.innerHTML = \`${msg}...\`` in `notify()` fallback | `d.innerHTML = \`${escapeHtml(msg)}...\`` — msg may contain API error text |
| `localStorage.getItem('access_token')` in fetch headers | `getAuthToken()` wrapper function |
| `onclick="myFn('${id}')"` in **dynamic** HTML strings | Event delegation with `data-action` / `data-id` |
| `onclick="myFn()"` in **static** `.html` files | `addEventListener` in `DOMContentLoaded` with `data-action` / `data-field` |
| Raw `fetch('/api/v1/...')` for JSON endpoints | `window.app.apiCall('/api/v1/...')` |
| `result.message` for FastAPI errors | `result.detail` |
| JWT in URL query string | `Authorization: Bearer` header only |
| `window.eventBus.emit('application:create', ...)` | `window.eventBus.emit(window.BusEvents.APPLICATION_CREATED, ...)` |
| `let timer` inside `setupEventListeners()` for debounce | Module-level `let _timer = 0` so `beforeunload` can clear it |
| `setTimeout(fn, 3000)` with no stored ID | `_timer = window.setTimeout(fn, 3000)` + `clearTimeout(_timer)` before re-scheduling |
| No in-flight guard on async button handler | Module-level `let _submitting = false`; guard + `finally { _submitting = false; }` |
| `alert(msg)` / `showAlert(msg)` | `notify(msg, 'error')` → `window.app.showNotification()` |
| Reimplement `escapeHtml`, `copyToClipboard`, `formatFileSize` | Delegate to `window.app` method |

---

## In-Flight Guards

Any `async` button handler must guard against duplicate concurrent calls. A disabled button alone is insufficient — disable via flag **before** the first `await`:

```javascript
let _saving = false;

async function saveProfile(btn) {
    if (_saving) return;
    _saving = true;
    btn.disabled = true;
    try {
        await window.app.apiCall('/api/v1/profile', 'PUT', payload);
        notify('Saved!', 'success');
    } catch (err) {
        notify('Save failed', 'error');
    } finally {
        btn.disabled = false;
        _saving = false;   // ← always reset in finally
    }
}
```

When multiple unrelated form handlers share a loading overlay (e.g. career tools), one shared `_toolSubmitting` flag across all handlers is sufficient.

---

## AbortController — Cancellable Fetch / Polling

For polling loops that must be cleanly cancelled on navigation, use an `AbortController` stored at module scope:

```javascript
/** @type {AbortController|null} */
let pollAbortController = null;

async function startPolling() {
    if (pollAbortController) pollAbortController.abort();
    pollAbortController = new AbortController();
    const signal = pollAbortController.signal;

    while (!signal.aborted) {
        try {
            const res = await fetch(`${API_BASE}/status/${sessionId}`, { signal, headers: getAuthHeaders() });
            const data = await res.json();
            if (data.status === 'completed') break;
            await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
            if (/** @type {any} */ (err).name === 'AbortError') break;
            console.error(err);
            break;
        }
    }
}

window.addEventListener('beforeunload', () => {
    if (pollAbortController) pollAbortController.abort();
});
```

Use `AbortController` when a polling loop needs a clean stop signal (navigation, user cancel, component unmount). Prefer this over a boolean flag when fetch requests are involved — `abort()` also cancels the in-flight HTTP request.

---

## Timer Cleanup

Store every `setTimeout` / `setInterval` ID at **module scope** so the `beforeunload` listener can clear it:

```javascript
let _pollTimer = /** @type {number|null} */ (null);

function schedulePoll() {
    if (_pollTimer !== null) clearTimeout(_pollTimer);   // prevent stacking
    _pollTimer = window.setTimeout(() => { _pollTimer = null; pollStatus(); }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    schedulePoll();
    window.addEventListener('beforeunload', () => {
        if (_pollTimer !== null) clearTimeout(_pollTimer);
    });
});
```

---

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

Features used:
- ES6+ (classes, async/await, arrow functions)
- Fetch API with `Authorization` header
- WebSocket API
- LocalStorage
- Clipboard API
- CSS Custom Properties
- CSS Grid / Flexbox
