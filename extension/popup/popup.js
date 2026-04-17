/**
 * ApplyPilot - Chrome Extension Popup
 * Handles user authentication, job extraction, and API communication
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

// ⚠️  BEFORE PUBLISHING: Set IS_DEV = false and fill in PRODUCTION_URL below.
const IS_DEV = true;
const DEV_URL = 'http://localhost:8000';
const PRODUCTION_URL = 'https://YOUR_CLOUD_RUN_URL.a.run.app';
const BASE_URL = IS_DEV ? DEV_URL : PRODUCTION_URL;

const CONFIG = {
  API_BASE_URL: `${BASE_URL}/api/v1`,
  DASHBOARD_URL: `${BASE_URL}/dashboard`,
  APP_URL: BASE_URL,
  STORAGE_KEYS: {
    TOKEN: 'jaa_token',
    USER: 'jaa_user',
    API_URL: 'jaa_api_url'
  }
};

/** Injected into the page tab; shared with the background context menu path. */
const JAA_EXTRACT_FILE = 'lib/extract-page-content.js';
/** MAIN world: hooks fetch/XHR on job search so Voyager JSON can be cached for extraction */
const JAA_LI_MAIN_HOOK_FILE = 'lib/linkedin-voyager-hook.js';
/** MAIN world: prefetch jobs-guest API body into sessionStorage (isolated extractor reads it). */
const JAA_LI_GUEST_PREFETCH_FILE = 'lib/linkedin-guest-prefetch.js';

/**
 * Loads the page extractor and returns `{ content, title, source?, diagnostics? }` from the tab.
 * `@param {{ forceDiagnostics?: boolean }} options` — when true, sets debug before extract (page `localStorage`
 * alone does not reach the extension isolated world where the extractor runs).
 * @param {number} tabId
 * @returns {Promise<{ content: string, title: string, source?: string, diagnostics?: object, error?: string }>}
 */
async function runExtractPageContent(tabId, options = {}) {
  let forceDiagnostics = !!options.forceDiagnostics;
  if (!forceDiagnostics) {
    try {
      const st = await chrome.storage.local.get(['extract_diagnostics']);
      if (st.extract_diagnostics === true) forceDiagnostics = true;
    } catch (e) {
      /* ignore */
    }
  }
  if (!forceDiagnostics) forceDiagnostics = IS_DEV;

  try {
    const tabInfo = await chrome.tabs.get(tabId);
    const tabUrl = tabInfo.url || '';
    if (/linkedin\.com\/jobs/i.test(tabUrl)) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [JAA_LI_MAIN_HOOK_FILE],
        world: 'MAIN'
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [JAA_LI_GUEST_PREFETCH_FILE],
        world: 'MAIN'
      });
      await new Promise(function (r) {
        setTimeout(r, 750);
      });
    }
  } catch (eHook) {
    /* ignore — tab closed or no permission */
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [JAA_EXTRACT_FILE]
  });
  const [exec] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (diag) => {
      try {
        if (diag) window.__JAA_EXTRACT_DEBUG = true;
      } catch (e) {
        /* ignore */
      }
      const runAsync = window.__jaaExtractPageContentAsync;
      if (typeof runAsync === 'function') {
        return await runAsync();
      }
      const fn = window.__jaaExtractPageContent;
      if (typeof fn !== 'function') {
        return {
          content: '',
          title: document.title || '',
          error: 'extractor_missing'
        };
      }
      return fn();
    },
    args: [forceDiagnostics]
  });
  return exec.result;
}

// =============================================================================
// DOM ELEMENTS
// =============================================================================

const elements = {
  // Views
  notAuthView: document.getElementById('notAuthView'),
  authView: document.getElementById('authView'),

  // Auth status
  statusDot: document.querySelector('.status-dot'),

  // Login form
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginSubmitBtn: document.getElementById('loginSubmitBtn'),
  loginError: document.getElementById('loginError'),
  openRegisterBtn: document.getElementById('openRegisterBtn'),

  // User info
  userInitials: document.getElementById('userInitials'),
  userName: document.getElementById('userName'),
  userEmail: document.getElementById('userEmail'),

  // Job detection
  jobDetection: document.getElementById('jobDetection'),
  detectedSource: document.getElementById('detectedSource'),

  // Buttons
  extractBtn: document.getElementById('extractBtn'),
  copyBtn: document.getElementById('copyBtn'),
  openDashboardBtn: document.getElementById('openDashboardBtn'),
  retryBtn: document.getElementById('retryBtn'),

  // Status displays
  extractionStatus: document.getElementById('extractionStatus'),
  statusText: document.getElementById('statusText'),
  successMessage: document.getElementById('successMessage'),
  errorMessage: document.getElementById('errorMessage'),
  errorTitle: document.getElementById('errorTitle'),
  errorText: document.getElementById('errorText'),

  // Quick links
  dashboardLink: document.getElementById('dashboardLink'),
  settingsLink: document.getElementById('settingsLink'),
  logoutLink: document.getElementById('logoutLink'),
  helpLink: document.getElementById('helpLink'),
  helpLinkFooter: document.getElementById('helpLinkFooter')
};

// =============================================================================
// STATE
// =============================================================================

let state = {
  isAuthenticated: false,
  user: null,
  token: null,
  currentTab: null,
  detectedJob: null,
  isExtracting: false,
  isLoggingIn: false
};

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  await initialize();
});

async function initialize() {
  // Load stored credentials
  await loadStoredCredentials();

  // Update UI based on auth state
  updateAuthUI();

  // If authenticated, detect job on current page
  if (state.isAuthenticated) {
    await detectJobOnCurrentPage();
  }

  // Setup event listeners
  setupEventListeners();
}

// =============================================================================
// AUTHENTICATION - Direct Login
// =============================================================================

async function handleLogin(email, password) {
  if (state.isLoggingIn) return;
  state.isLoggingIn = true;

  // Update button state
  elements.loginSubmitBtn.disabled = true;
  elements.loginSubmitBtn.textContent = 'Signing in...';
  elements.loginError.classList.add('hidden');

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const msg = data?.detail || data?.message || 'Invalid email or password';
      throw new Error(msg);
    }

    if (!data || !data.access_token) {
      throw new Error('No token received from server');
    }

    // Build user object from response
    const user = data.user || {
      email: email,
      full_name: data.full_name || email.split('@')[0]
    };

    // Save credentials
    await saveCredentials(data.access_token, user);

    // Update UI
    updateAuthUI();
    showToast('Signed in successfully!', 'success');

    // Detect job on current page
    await detectJobOnCurrentPage();

  } catch (error) {
    console.error('Login failed:', error);
    elements.loginError.textContent = error.message;
    elements.loginError.classList.remove('hidden');
  } finally {
    state.isLoggingIn = false;
    elements.loginSubmitBtn.disabled = false;
    elements.loginSubmitBtn.textContent = 'Sign In';
  }
}

// =============================================================================
// CREDENTIALS MANAGEMENT
// =============================================================================

async function loadStoredCredentials() {
  try {
    const result = await chrome.storage.local.get([
      CONFIG.STORAGE_KEYS.TOKEN,
      CONFIG.STORAGE_KEYS.USER,
      CONFIG.STORAGE_KEYS.API_URL
    ]);

    if (result[CONFIG.STORAGE_KEYS.API_URL]) {
      CONFIG.API_BASE_URL = result[CONFIG.STORAGE_KEYS.API_URL];
      CONFIG.APP_URL = CONFIG.API_BASE_URL.replace(/\/api\/v1$/, '').replace(/\/api$/, '');
      CONFIG.DASHBOARD_URL = `${CONFIG.APP_URL}/dashboard`;
    }

    if (result[CONFIG.STORAGE_KEYS.TOKEN]) {
      state.token = result[CONFIG.STORAGE_KEYS.TOKEN];
      state.user = result[CONFIG.STORAGE_KEYS.USER] || null;

      // Verify token is still valid
      const isValid = await verifyToken();
      state.isAuthenticated = isValid;

      if (!isValid) {
        await clearCredentials();
      }
    }
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }
}

async function verifyToken() {
  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}/auth/extension-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${state.token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      // Update user info from extension-status response
      const data = await response.json().catch(() => null);
      if (data && data.user) {
        state.user = data.user;
        // Also update storage with latest user info
        await chrome.storage.local.set({
          [CONFIG.STORAGE_KEYS.USER]: data.user
        });
      }
    }

    return response.ok;
  } catch (error) {
    console.error('Token verification failed:', error);
    return false;
  }
}

async function saveCredentials(token, user) {
  try {
    await chrome.storage.local.set({
      [CONFIG.STORAGE_KEYS.TOKEN]: token,
      [CONFIG.STORAGE_KEYS.USER]: user
    });

    state.token = token;
    state.user = user;
    state.isAuthenticated = true;
  } catch (error) {
    console.error('Failed to save credentials:', error);
  }
}

async function clearCredentials() {
  try {
    await chrome.storage.local.remove([
      CONFIG.STORAGE_KEYS.TOKEN,
      CONFIG.STORAGE_KEYS.USER
    ]);

    state.token = null;
    state.user = null;
    state.isAuthenticated = false;
  } catch (error) {
    console.error('Failed to clear credentials:', error);
  }
}

async function logout() {
  try {
    if (state.token) {
      await fetch(`${CONFIG.API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    await clearCredentials();
    updateAuthUI();
    showToast('Logged out successfully', 'success');
  }
}

// =============================================================================
// UI UPDATES
// =============================================================================

function updateAuthUI() {
  if (state.isAuthenticated && state.user) {
    elements.notAuthView.classList.add('hidden');
    elements.authView.classList.remove('hidden');
    elements.statusDot.classList.add('connected');
    elements.statusDot.classList.remove('disconnected');

    const name = state.user.full_name || state.user.email || 'User';
    const initials = getInitials(name);
    elements.userInitials.textContent = initials;
    elements.userName.textContent = name;
    elements.userEmail.textContent = state.user.email || '';
  } else {
    elements.notAuthView.classList.remove('hidden');
    elements.authView.classList.add('hidden');
    elements.statusDot.classList.remove('connected');
    elements.statusDot.classList.add('disconnected');
  }
}

function getInitials(name) {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name[0] || '?').toUpperCase();
}

function showExtracting() {
  elements.extractBtn.disabled = true;
  if (elements.copyBtn) elements.copyBtn.disabled = true;
  elements.extractionStatus.classList.remove('hidden');
  elements.successMessage.classList.add('hidden');
  elements.errorMessage.classList.add('hidden');
  state.isExtracting = true;
}

function hideExtracting() {
  elements.extractBtn.disabled = false;
  if (elements.copyBtn) elements.copyBtn.disabled = false;
  elements.extractionStatus.classList.add('hidden');
  state.isExtracting = false;
}

function showSuccess() {
  hideExtracting();
  elements.successMessage.classList.remove('hidden');
  // Hide the entire actions section and job detection
  const actionsSection = elements.extractBtn.closest('.actions');
  if (actionsSection) actionsSection.classList.add('hidden');
  elements.jobDetection.classList.add('hidden');
}

function showError(title, message) {
  hideExtracting();
  elements.errorTitle.textContent = title;
  elements.errorText.textContent = message;
  elements.errorMessage.classList.remove('hidden');
}

function resetView() {
  hideExtracting();
  elements.successMessage.classList.add('hidden');
  elements.errorMessage.classList.add('hidden');
  const actionsSection = elements.extractBtn.closest('.actions');
  if (actionsSection) actionsSection.classList.remove('hidden');
  elements.jobDetection.classList.remove('hidden');
}

let _notifTimer = null;

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} [type]
 * @param {number} [durationMs] Defaults to 3000; use longer for multi-line tips.
 */
function showToast(message, type = 'info', durationMs = 3000) {
  const bar = document.getElementById('popupNotification');
  if (!bar) return;

  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const icon = icons[type] ?? icons.info;

  if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }

  bar.className = `popup-notification ${type}`;
  bar.innerHTML = `<i class="fas ${icon} notif-icon"></i><span></span>`;
  const span = bar.querySelector('span');
  if (span) span.textContent = message;

  _notifTimer = setTimeout(() => {
    bar.classList.add('hidden');
    _notifTimer = null;
  }, durationMs);
}

/**
 * Last-mile UX: when heuristics say extraction may be noisy, nudge user toward selection fallback.
 * @param {{ confidence?: string } | null | undefined} extracted
 */
function maybeShowExtractionQualityTip(extracted) {
  const conf = extracted && extracted.confidence;
  if (conf === 'low') {
    showToast(
      'Tip: If the role or company look wrong on your dashboard, highlight the full job description on the page, then tap Analyze again.',
      'info',
      14000
    );
  } else if (conf === 'medium') {
    showToast(
      'Tip: On split job lists, wrong title or company? Select only the job description text, then analyze.',
      'info',
      8000
    );
  }
}

// =============================================================================
// JOB DETECTION
// =============================================================================

async function detectJobOnCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.currentTab = tab;

    if (!tab || !tab.url) {
      elements.jobDetection.style.display = 'none';
      return;
    }

    try {
      const hostname = new URL(tab.url).hostname.replace(/^www\./, '');
      elements.detectedSource.textContent = hostname;
    } catch (e) {
      elements.detectedSource.textContent = 'this page';
    }
  } catch (error) {
    console.error('Failed to detect job:', error);
    elements.jobDetection.style.display = 'none';
  }
}

function isJobRelatedURL(url) {
  if (!url) return false;
  const jobPatterns = [
    /\/careers?\//i,
    /\/jobs?\//i,
    /\/job-/i,
    /\/positions?\//i,
    /\/openings?\//i,
    /\/vacancies?\//i,
    /\/apply\//i,
    /\/hiring\//i,
    /\/opportunities?\//i,
    /workday\.com/i,
    /greenhouse\.io/i,
    /lever\.co/i,
    /ashbyhq\.com/i,
    /bamboohr\.com/i,
    /smartrecruiters\.com/i,
    /icims\.com/i,
    /jobvite\.com/i
  ];

  return jobPatterns.some(pattern => pattern.test(url));
}

// =============================================================================
// JOB EXTRACTION
// =============================================================================

async function extractAndSubmitJob() {
  if (state.isExtracting) return;

  showExtracting();
  elements.statusText.textContent = 'Extracting page content...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');

    const extracted = await runExtractPageContent(tab.id);

    if (!extracted || extracted.error || !extracted.content) {
      throw new Error('Failed to extract content from page');
    }

    if (extracted.diagnostics) {
      console.info('[ApplyPilot] extract diagnostics — copy this object when reporting bugs:', extracted.diagnostics);
    }

    const { content } = extracted;

    if (content.length < 100) {
      throw new Error('Page content is too short. Make sure the job posting is fully loaded.');
    }

    elements.statusText.textContent = 'Sending to AI for analysis...';

    const formData = new FormData();
    formData.append('job_text', content);
    // Do NOT send detected_title / detected_company — page titles (e.g. "(5) LinkedIn")
    // are unreliable. The dashboard shows skeleton shimmers until the Job Analyzer
    // extracts the correct title and company from the job text.

    const response = await fetch(`${CONFIG.API_BASE_URL}/workflow/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => (/** @type {Record<string, any>} */ ({})));
      if (errorData.error_code === 'RES_3002') {
        hideExtracting();
        const dupMsg =
          errorData.message ||
          'You already have this role and company on your list. Open your dashboard to view that application.';
        showToast(dupMsg, 'info');
        return;
      }
      throw new Error(errorData.detail || errorData.message || `API error: ${response.status}`);
    }

    showSuccess();
    maybeShowExtractionQualityTip(extracted);

  } catch (error) {
    console.error('Extraction failed:', error);
    showError('Extraction Failed', error.message || 'Please try again.');
  }
}

async function copyPageContent() {
  if (state.isExtracting) return;

  try {
    elements.copyBtn.disabled = true;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');

    const extracted = await runExtractPageContent(tab.id);

    if (!extracted || extracted.error || !extracted.content) {
      throw new Error('Failed to extract content from page');
    }

    if (extracted.diagnostics) {
      console.info('[ApplyPilot] extract diagnostics — copy this object when reporting bugs:', extracted.diagnostics);
    }

    await navigator.clipboard.writeText(extracted.content);
    showToast('Copied to clipboard!', 'success');

    // Brief visual feedback on icon
    elements.copyBtn.classList.add('copied');
    setTimeout(() => {
      elements.copyBtn.classList.remove('copied');
    }, 2000);

  } catch (error) {
    console.error('Copy failed:', error);
    showToast('Failed to copy content', 'error');
  } finally {
    elements.copyBtn.disabled = false;
  }
}

// =============================================================================
// EVENT LISTENERS
// =============================================================================

function setupEventListeners() {
  // Login form submission
  elements.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value;

    if (!email || !password) {
      elements.loginError.textContent = 'Please enter email and password';
      elements.loginError.classList.remove('hidden');
      return;
    }

    handleLogin(email, password);
  });

  // Register link
  elements.openRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${CONFIG.APP_URL}/auth/register` });
  });

  // Extract & copy buttons
  elements.extractBtn.addEventListener('click', () => extractAndSubmitJob());
  if (elements.copyBtn) {
    elements.copyBtn.addEventListener('click', () => copyPageContent());
  }

  // Open dashboard
  elements.openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: CONFIG.DASHBOARD_URL });
  });

  // Retry
  elements.retryBtn.addEventListener('click', () => {
    resetView();
    detectJobOnCurrentPage();
  });

  // Quick links
  elements.dashboardLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: CONFIG.DASHBOARD_URL });
  });

  elements.settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${CONFIG.DASHBOARD_URL}/settings` });
  });

  elements.logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
  });

  elements.helpLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: `${CONFIG.APP_URL}/help` });
  });

  if (elements.helpLinkFooter) {
    elements.helpLinkFooter.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: `${CONFIG.APP_URL}/help` });
    });
  }
}

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AUTH_SUCCESS') {
    saveCredentials(message.token, message.user).then(() => {
      updateAuthUI();
      detectJobOnCurrentPage();
      showToast('Signed in!', 'success');
    });
    sendResponse({ success: true });
  } else if (message.type === 'AUTH_LOGOUT') {
    clearCredentials().then(() => {
      updateAuthUI();
      showToast('Logged out', 'info');
    });
    sendResponse({ success: true });
  }

  return true;
});
