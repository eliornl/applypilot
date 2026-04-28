# ApplyPilot Chrome Extension

A Chrome extension that connects your browsing to ApplyPilot in two ways: **Analyze This Job** sends a posting to your dashboard for the full multi-agent workflow, and **Match Form To Profile** suggests field values from your profile (via LLM) on application pages for you to review before you submit.

## Current Version

**v1.1.1** — popup UI aligned with the main app; form match uses `lib/form-autofill.js` + `POST /api/v1/extension/autofill/map`.

## Features

- **Analyze This Job** — extract a posting from almost any job page and run dashboard AI analysis
- **Match Form To Profile** — profile-aware suggestions on visible apply forms (main document MVP)
- Same account, tokens, and API base URL as the web app
- Quick access to Dashboard, Settings, Help, and Logout
- Job-page detection with a clear status row in the popup

## Installation (Development)

1. **Generate icons** (first time only — requires Pillow):
   ```bash
   cd extension/icons
   python generate_icons.py
   ```

2. **Load in Chrome**:
   - Go to `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked** and select the `extension/` folder

3. **Configure for local dev** (already the default):
   - `popup.js` and `service-worker.js` both contain an `IS_DEV` flag at the top.
   - `IS_DEV = true` targets `http://localhost:8000`.
   - Before deploying to production, set `IS_DEV = false` and fill in `PRODUCTION_URL`.

4. **After any code change**: go to `chrome://extensions/` and click the ↺ refresh icon.

## Usage

**Analyze a posting**

1. Open a job posting page and click the extension icon.
2. If the popup shows a job-detected row, click **Analyze This Job** to extract and send it to the API.
3. Open your dashboard to see the full workflow results.

**Match an application form**

1. Open a normal tab with a visible application form (main page only; no iframes in the MVP).
2. Click **Match Form To Profile** — fields are serialized, mapped with your profile server-side, then values are applied on the page for you to check before you submit.

## Supported Sites

Optimised content selectors exist for many popular job boards and ATS platforms (Greenhouse, Lever, Workday, Ashby, BambooHR, SmartRecruiters, iCIMS, Taleo, and others). For unrecognised sites the extension falls back to the page `<main>` element, which works on virtually any company careers page.

### Connectors & maintenance

- **Per-host roots:** `lib/extract-page-content.js` → `SITE_CONNECTOR_ROOTS` (hostname regex + CSS selectors). Update when a major site changes layout and users report bad extracts.
- **Structured data:** JSON-LD `JobPosting` is preferred when the page embeds a full description.
- **User override:** Highlighting the job description on the page, then **Analyze**, always uses the selection (most reliable).
- **Quality tips:** After a successful analyze, the popup may show a short **info** tip when extraction confidence is **medium** or **low** (heuristic: length, line count, and source). This nudges users toward the selection fallback without blocking success.

## Configuration

### Switching environments

Both `popup.js` and `service-worker.js` expose a toggle at the top of the file:

```javascript
const IS_DEV = true;                     // ← change to false for production
const DEV_URL = 'http://localhost:8000';
const PRODUCTION_URL = 'https://your-server.example.com';  // ← fill in your server URL
```

You can also override the API URL at runtime without reloading the extension (useful for testing):
```javascript
// Run in DevTools → Extensions → Service Worker console
chrome.storage.local.set({ jaa_api_url: 'http://localhost:8000/api/v1' })
```

## Project Structure

```
extension/
├── manifest.json           # Manifest V3 — version, permissions, metadata
├── lib/
│   ├── extract-page-content.js  # Injected extractor (JSON-LD, connectors, DOM)
│   └── form-autofill.js         # Serialize + apply form fields (autofill MVP)
├── popup/
│   ├── popup.html          # Popup UI — Font Awesome icons, app font/colors
│   ├── popup.css           # Mirrors main app's CSS variables & design system
│   └── popup.js            # Auth, job detection, extraction, autofill API calls
├── content/
│   ├── content.js          # Injected into job pages to extract content
│   └── content.css
├── background/
│   └── service-worker.js   # Token refresh (every 55 min) + API proxy
└── icons/
    ├── icon16.png           # Generated from app logo (Pillow)
    ├── icon48.png
    ├── icon128.png
    └── generate_icons.py
```

## Design

The popup is pixel-matched to the main app:
- Font: **Outfit** (Google Fonts)
- Icons: **Font Awesome 6** (CDN) — no emoji anywhere
- Colors and CSS variables match `app.css` (e.g. `--accent-gradient`, `--bg-primary`)
- Header logo: gradient rounded square + "Apply**Pilot**" wordmark
- Footer: version number only

> Note: Chrome controls the outer shape of the popup window. CSS `border-radius` on the popup root is clipped by the browser and cannot be applied.

## Debugging

| What | How |
|---|---|
| Popup | Right-click extension icon → "Inspect popup" |
| Service Worker | `chrome://extensions/` → click "service worker" |
| Content Script | Page DevTools → Console (filter by extension ID) |

## Troubleshooting

**"Not authenticated"** — Log out and back in from the extension popup.  
**Job not detected** — Make sure you're on the job detail page, not search results.  
**Extension not loading** — Check `chrome://extensions/` for errors; verify all icon files exist.  
**API errors (dev)** — Confirm the server is running at `http://localhost:8000` and that `IS_DEV = true` in both JS files.

## Privacy & Security

- Page content is only read when you click **Analyze This Job** or **Match Form To Profile**
- Auth tokens are stored in Chrome's secure local storage (`chrome.storage.local`)
- Content is sent only to your configured API endpoint — no third parties
