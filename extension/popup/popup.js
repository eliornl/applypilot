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

function showToast(message, type = 'info') {
  const bar = document.getElementById('popupNotification');
  if (!bar) return;

  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
  const icon = icons[type] ?? icons.info;

  if (_notifTimer) { clearTimeout(_notifTimer); _notifTimer = null; }

  bar.className = `popup-notification ${type}`;
  bar.innerHTML = `<i class="fas ${icon} notif-icon"></i><span>${message}</span>`;

  _notifTimer = setTimeout(() => {
    bar.classList.add('hidden');
    _notifTimer = null;
  }, 3000);
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

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent
    });

    if (!result || !result.result || !result.result.content) {
      throw new Error('Failed to extract content from page');
    }

    const { content } = result.result;

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

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent
    });

    if (!result || !result.result || !result.result.content) {
      throw new Error('Failed to extract content from page');
    }

    await navigator.clipboard.writeText(result.result.content);
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

/**
 * Universal page content extraction.
 *
 * PHILOSOPHY: Prefer a single main job pane when the DOM exposes one (split-view
 * job search UIs put the job list before the open role in document order). Otherwise
 * clone the page body — the LLM can still find the posting, but mixed lists confuse it.
 *
 * This function is injected into the page via chrome.scripting.executeScript.
 */
function extractPageContent() {
  const result = { content: '', title: document.title || '' };

  /**
   * When a site uses a list + detail layout, `document.body` innerText often leads
   * with the first list row, not the selected job. Narrow the root when possible.
   * Class names are heuristic and may change with site updates — fallback is always body.
   */
  function getPreferredJobContentRoot() {
    try {
      const host = window.location.hostname || '';
      const path = window.location.pathname || '';
      if (!/linkedin\.(com|cn)$/i.test(host) || !/\/jobs/i.test(path)) {
        return null;
      }

      const trySelectors = ['.jobs-search__job-details-body', '.jobs-details__main-content'];
      for (const sel of trySelectors) {
        const el = document.querySelector(sel);
        const t = el && (el.innerText || el.textContent || '').trim();
        if (t && t.length >= 80) return el;
      }

      const articles = document.querySelectorAll('article.jobs-description__container');
      if (articles.length === 0) return null;

      let best = null;
      let bestLen = 0;
      articles.forEach((a) => {
        const len = (a.innerText || '').length;
        if (len > bestLen) {
          bestLen = len;
          best = a;
        }
      });
      if (!best) return null;

      const wrap =
        best.closest('.jobs-search__job-details-body') ||
        best.closest('[class*="jobs-details"]') ||
        best.closest('main') ||
        best;
      const t = (wrap.innerText || '').trim();
      return t.length >= 80 ? wrap : null;
    } catch (e) {
      return null;
    }
  }

  // Elements to remove (definitely not job content)
  const REMOVE_SELECTORS = [
    // Technical elements - be aggressive
    'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'template', 'link', 'meta',
    'code', 'pre', // Often contains JSON/code data
    '[type="application/json"]',
    '[type="application/ld+json"]',
    // Navigation and structure  
    'header', 'footer', 'nav', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    // Hidden elements
    '[aria-hidden="true"]', '[hidden]', '.hidden', '.visually-hidden',
    '[style*="display: none"]', '[style*="display:none"]',
    // Popups and overlays
    '.cookie-banner', '.cookie-consent', '[class*="cookie"]',
    '.popup', '.modal', '.overlay', '.dialog', '[role="dialog"]',
    // Ads
    '.advertisement', '.ad-container', '[class*="advert"]', '[id*="google_ads"]',
    '[class*="sponsored"]', '[class*="promo"]',
    // Social/comments
    '.social-share', '.share-buttons', '.comments', '.comment-section',
    // Chat widgets
    '[class*="chat-widget"]', '[class*="intercom"]', '[class*="drift"]', '[class*="zendesk"]'
  ];

  function cleanText(raw) {
    let text = raw
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+$/gm, '')
      .trim();
    
    // Remove JSON-like garbage (some job sites embed structured data in page text)
    // Pattern: lines that look like JSON objects/arrays
    text = text.split('\n').filter(line => {
      const trimmed = line.trim();
      // Skip lines that look like JSON
      if (trimmed.startsWith('{') && trimmed.includes('"$type"')) return false;
      if (trimmed.startsWith('[') && trimmed.includes('"$type"')) return false;
      if (trimmed.includes('urn:li:')) return false;
      if (trimmed.includes('entityUrn')) return false;
      if (trimmed.includes('chameleon')) return false;
      if (trimmed.includes('lixTracking')) return false;
      // Skip very long lines with no spaces (likely encoded data)
      if (trimmed.length > 500 && !trimmed.includes(' ')) return false;
      return true;
    }).join('\n');
    
    return text.trim();
  }

  function removeUnwantedElements(node) {
    REMOVE_SELECTORS.forEach(selector => {
      try {
        node.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) { /* skip */ }
    });
    
    // Also remove any element with data attributes containing JSON
    try {
      node.querySelectorAll('[data-entity-hovercard-id]').forEach(el => el.remove());
      node.querySelectorAll('[data-tracking-control-name]').forEach(el => el.remove());
    } catch (e) { /* skip */ }
    
    return node;
  }

  const rootEl = getPreferredJobContentRoot() || document.body;
  const bodyClone = rootEl.cloneNode(true);
  removeUnwantedElements(bodyClone);
  
  // Get clean text content
  let text = cleanText(bodyClone.innerText || bodyClone.textContent || '');
  
  // Final cleanup - remove any remaining JSON blobs
  text = text.replace(/\{"[^}]{500,}\}/g, ''); // Remove large JSON objects
  text = text.replace(/\[[^\]]{500,}\]/g, '');  // Remove large JSON arrays
  
  // Limit size (50KB should be plenty for the AI to find the job posting)
  if (text.length > 50000) {
    text = text.substring(0, 50000);
  }

  result.content = text;
  return result;
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
