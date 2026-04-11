# ApplyPilot Chrome Extension

A Chrome extension that lets you extract any job posting with one click and analyze it with AI-powered assistance through your ApplyPilot account.

## Current Version

**v1.1.0** — redesigned popup UI matching the main app's design system.

## Features

- Extract job postings from any website with one click
- AI-powered analysis: match score, resume tips, cover letter, and interview prep
- Seamless integration with your ApplyPilot account
- Quick access to Dashboard, Settings, Help, and Logout
- Smart job-page detection with informative status indicator

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

1. Click the extension icon while viewing any job posting page.
2. The popup shows a "Job detected" row if it recognises the page.
3. Click **Analyze This Job** — the page content is extracted and sent to the AI.
4. View the full analysis in your dashboard.

## Supported Sites

Optimised content selectors exist for many popular job boards and ATS platforms (Greenhouse, Lever, Workday, Ashby, BambooHR, SmartRecruiters, iCIMS, Taleo, and others). For unrecognised sites the extension falls back to the page `<main>` element, which works on virtually any company careers page.

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
├── popup/
│   ├── popup.html          # Popup UI — Font Awesome icons, app font/colors
│   ├── popup.css           # Mirrors main app's CSS variables & design system
│   └── popup.js            # Auth, job detection, extraction, API calls
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

- The extension only accesses page content when you click "Analyze This Job"
- Auth tokens are stored in Chrome's secure local storage (`chrome.storage.local`)
- Content is sent only to your configured API endpoint — no third parties
