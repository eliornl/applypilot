(function () {
    'use strict';

    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api/v1';

    /** @type {boolean} — true for email-registered users, false for Google-only */
    let userHasPassword = true;

    /** @param {string} str */
    function escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    /** @type {typeof window.showConfirm} */
    const showConfirm = window.showConfirm;

    /**
     * Show a notification via window.app; falls back to alertContainer HTML.
     * @param {string} message
     * @param {string} [type] - 'success' | 'danger' | 'warning' | 'info'
     */
    function notify(message, type = 'info') {
        const notifType = type === 'danger' ? 'error' : type;
        // @ts-ignore
        const bus = window.eventBus; const busEvents = window.BusEvents;
        if (bus && busEvents) {
            /** @type {Record<string,string>} */ const evtMap = { success: busEvents.NOTIFY_SUCCESS, error: busEvents.NOTIFY_ERROR, warning: busEvents.NOTIFY_WARNING, info: busEvents.NOTIFY_INFO };
            bus.emit(evtMap[notifType] ?? busEvents.NOTIFY_INFO, { message });
        }
        // @ts-ignore
        const app = window.app;
        if (app && typeof app.showNotification === 'function') { app.showNotification(message, notifType); return; }
        const container = document.getElementById('alertContainer');
        if (container) container.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert"><i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2"></i>${escapeHtml(message)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`;
    }

    // =============================================================================
    // PASSWORD SECTION
    // =============================================================================

    function togglePasswordSection() {
        const header  = document.querySelector('.password-header');
        const content = document.getElementById('passwordFormContent');
        header?.classList.toggle('collapsed');
        content?.classList.toggle('expanded');
    }

    /** @param {string} fieldId */
    function togglePasswordField(fieldId) {
        const input = /** @type {HTMLInputElement|null} */ (document.getElementById(fieldId));
        const icon  = document.getElementById(fieldId + '-toggle-icon');
        if (!input || !icon) return;
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    }

    /** @param {string} password */
    function validateNewPassword(password) {
        const req = {
            length:    password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number:    /[0-9]/.test(password),
            special:   /[!@#$%^&*(),.?":{}|<>]/.test(password)
        };
        document.getElementById('req-length')?.classList.toggle('valid', req.length);
        document.getElementById('req-uppercase')?.classList.toggle('valid', req.uppercase);
        document.getElementById('req-lowercase')?.classList.toggle('valid', req.lowercase);
        document.getElementById('req-number')?.classList.toggle('valid', req.number);
        document.getElementById('req-special')?.classList.toggle('valid', req.special);

        const allValid  = Object.values(req).every(v => v);
        const container = document.getElementById('newPassword-container');
        if (!container) return allValid;
        if (password.length > 0) {
            container.classList.toggle('is-valid', allValid);
            container.classList.toggle('is-invalid', !allValid);
        } else {
            container.classList.remove('is-valid', 'is-invalid');
        }
        return allValid;
    }

    function validateConfirmPassword() {
        const newPw  = /** @type {HTMLInputElement|null} */ (document.getElementById('newPassword'));
        const confPw = /** @type {HTMLInputElement|null} */ (document.getElementById('confirmPassword'));
        const container = document.getElementById('confirmPassword-container');
        if (!newPw || !confPw || !container) return false;

        if (confPw.value.length > 0) {
            const isMatch = newPw.value === confPw.value;
            container.classList.toggle('is-valid', isMatch);
            container.classList.toggle('is-invalid', !isMatch);
            return isMatch;
        } else {
            container.classList.remove('is-valid', 'is-invalid');
            return false;
        }
    }

    // =============================================================================
    // WORKFLOW PREFERENCES
    // =============================================================================

    /** @type {ReturnType<typeof setTimeout>|null} */
    let _prefsSaveTimer = null;

    /** Show the "Saved" indicator briefly. */
    function _showPrefsSaved() {
        const el = document.getElementById('prefsSavedIndicator');
        if (!el) return;
        el.style.opacity = '1';
        setTimeout(() => { el.style.opacity = '0'; }, 2000);
    }

    /**
     * @param {{ workflow_gate_threshold: number, auto_generate_documents: boolean, cover_letter_tone?: string, resume_length?: string, preferred_model?: string|null }} prefs
     */
    function _applyPreferencesToUI(prefs) {
        const slider  = /** @type {HTMLInputElement|null} */ (document.getElementById('gateThresholdSlider'));
        const display = document.getElementById('gateThresholdDisplay');
        const toggle  = /** @type {HTMLInputElement|null} */ (document.getElementById('autoGenerateDocsToggle'));
        const toneSelect   = /** @type {HTMLSelectElement|null} */ (document.getElementById('coverLetterToneSelect'));
        const lengthSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('resumeLengthSelect'));

        if (slider && display) {
            const pct = Math.round((prefs.workflow_gate_threshold ?? 0.5) * 100);
            slider.value = String(pct);
            display.textContent = `${pct}%`;
            _updateSliderFill(slider);
        }
        if (toggle)       toggle.checked = prefs.auto_generate_documents ?? false;
        if (toneSelect)   toneSelect.value   = prefs.cover_letter_tone ?? 'professional';
        if (lengthSelect) lengthSelect.value = prefs.resume_length    ?? 'concise';
    }

    /** Read current UI state and return payload object. */
    function _readPrefsFromUI() {
        const slider       = /** @type {HTMLInputElement|null} */  (document.getElementById('gateThresholdSlider'));
        const toggle       = /** @type {HTMLInputElement|null} */  (document.getElementById('autoGenerateDocsToggle'));
        const toneSelect   = /** @type {HTMLSelectElement|null} */ (document.getElementById('coverLetterToneSelect'));
        const lengthSelect = /** @type {HTMLSelectElement|null} */ (document.getElementById('resumeLengthSelect'));
        return {
            workflow_gate_threshold: slider ? parseFloat(slider.value) / 100 : 0.5,
            auto_generate_documents: toggle ? toggle.checked : false,
            cover_letter_tone: toneSelect   ? toneSelect.value   : 'professional',
            resume_length:     lengthSelect ? lengthSelect.value : 'concise',
        };
    }

    /** Persist preferences to backend (called via debounce). */
    async function _persistPreferences() {
        try {
            const res = await fetch(`${API_BASE}/profile/preferences`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(_readPrefsFromUI())
            });
            if (res.ok) {
                _showPrefsSaved();
            } else {
                const err = await res.json().catch(() => ({}));
                notify(err.message || err.detail || 'Could not save preferences', 'danger');
            }
        } catch (err) {
            console.error('Error saving preferences:', err);
        }
    }

    /** Debounced save — waits 600 ms after the last change before hitting the API. */
    function _schedulePreferencesSave() {
        if (_prefsSaveTimer) clearTimeout(_prefsSaveTimer);
        _prefsSaveTimer = setTimeout(_persistPreferences, 600);
    }

    /** @param {HTMLInputElement} slider */
    function _updateSliderFill(slider) {
        const pct = ((parseInt(slider.value) - parseInt(slider.min)) / (parseInt(slider.max) - parseInt(slider.min))) * 100;
        slider.style.setProperty('--val', `${pct}%`);
    }

    /** Load preferences from the backend and populate the UI. */
    async function loadWorkflowPreferences() {
        try {
            const res = await fetch(`${API_BASE}/profile/preferences`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (!res.ok) return;
            _applyPreferencesToUI(await res.json());
        } catch (err) {
            console.error('Error loading workflow preferences:', err);
        }
    }

    // =============================================================================
    // INIT
    // =============================================================================

    document.addEventListener('DOMContentLoaded', function () {
        checkAuthentication();
        loadApiKeyStatus();
        loadGoogleAccountStatus();
        loadWorkflowPreferences();

        document.getElementById('passwordForm')?.addEventListener('submit', handlePasswordChange);
        document.getElementById('apiKeyForm')?.addEventListener('submit', handleApiKeySave);

        // Resume file input change (replaces inline onchange="handleResumeUpload(this)")
        const resumeInput = document.getElementById('resumeUploadInput');
        if (resumeInput) {
            resumeInput.addEventListener('change', function () {
                handleResumeUpload(/** @type {HTMLInputElement} */ (this));
            });
        }

        const newPasswordInput  = document.getElementById('newPassword');
        const confPasswordInput = document.getElementById('confirmPassword');
        if (newPasswordInput) {
            newPasswordInput.addEventListener('input', function () {
                validateNewPassword(/** @type {HTMLInputElement} */ (this).value);
                validateConfirmPassword();
            });
        }
        if (confPasswordInput) confPasswordInput.addEventListener('input', validateConfirmPassword);

        // Delegated handler for settings nav tabs (replaces inline onclick="showSection('...')")
        document.querySelector('.settings-nav, .settings-sidebar')?.addEventListener('click', function (e) {
            const link = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a[data-section]'));
            if (!link) return;
            e.preventDefault();
            showSection(link.dataset['section'] ?? '', /** @type {MouseEvent} */ (e));
        });

        // Delegated click handler for all data-action and data-field buttons (replaces inline onclick)
        document.addEventListener('click', function (e) {
            const el = /** @type {HTMLElement} */ (e.target);

            // Password toggle buttons
            const fieldBtn = /** @type {HTMLElement|null} */ (el.closest('.password-toggle[data-field]'));
            if (fieldBtn) { togglePasswordField(fieldBtn.dataset['field'] ?? ''); return; }

            // Generic action buttons
            const actionEl = /** @type {HTMLElement|null} */ (el.closest('[data-action]'));
            if (!actionEl) return;
            const action = actionEl.dataset['action'];
            switch (action) {
                case 'triggerResumeUpload':
                    document.getElementById('resumeUploadInput')?.click(); break;
                case 'toggleApiKeyVisibility':
                    toggleApiKeyVisibility(); break;
                case 'deleteApiKey':
                    deleteApiKey(); break;
                case 'exportData':
                    exportData(); break;
                case 'restartOnboarding':
                    restartOnboarding(); break;
                case 'togglePasswordSection':
                    togglePasswordSection(); break;
                case 'clearAllData':
                    clearAllData(); break;
                case 'deleteAccount':
                    deleteAccount(); break;
            }

        });

        // Slider: live display + fill + auto-save
        document.getElementById('gateThresholdSlider')?.addEventListener('input', function () {
            const slider  = /** @type {HTMLInputElement} */ (this);
            const display = document.getElementById('gateThresholdDisplay');
            if (display) display.textContent = `${slider.value}%`;
            _updateSliderFill(slider);
            _schedulePreferencesSave();
        });

        // Toggle auto-save
        document.getElementById('autoGenerateDocsToggle')?.addEventListener('change', _schedulePreferencesSave);

        // Dropdown selects auto-save
        document.getElementById('coverLetterToneSelect')?.addEventListener('change', _schedulePreferencesSave);
        document.getElementById('resumeLengthSelect')?.addEventListener('change', _schedulePreferencesSave);

        // Model select: separate debounced save
        document.getElementById('preferredModelSelect')?.addEventListener('change', function () {
            if (_modelSaveTimer) clearTimeout(_modelSaveTimer);
            _modelSaveTimer = setTimeout(saveModelPreference, 600);
        });

        // Allow keyboard activation for role="button" elements
        document.querySelectorAll('[role="button"][data-action]').forEach(el => {
            el.addEventListener('keydown', function (/** @type {KeyboardEvent} */ e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    /** @type {HTMLElement} */ (e.currentTarget).click();
                }
            });
        });
    });

    function getAuthToken() {
        // @ts-ignore
        return (window.app && typeof window.app.getAuthToken === 'function')
            ? window.app.getAuthToken()
            : (localStorage.getItem('access_token') || localStorage.getItem('authToken'));
    }

    function checkAuthentication() {
        // @ts-ignore
        const authenticated = window.app ? window.app.isAuthenticated() : !!getAuthToken();
        if (!authenticated) { window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login'; return; }
        if (localStorage.getItem('profile_completed') !== 'true') { window.location.href = '/profile/setup'; }
    }

    // =============================================================================
    // RESUME UPLOAD
    // =============================================================================

    /** @param {HTMLInputElement} input */
    async function handleResumeUpload(input) {
        const file = input.files?.[0];
        if (!file) return;

        const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
        if (!['.pdf', '.docx', '.txt'].includes(ext)) {
            showAlert('Please upload a PDF, DOCX, or TXT file', 'danger');
            input.value = ''; return;
        }

        const formData = new FormData();
        formData.append('resume', file);
        showAlert('Parsing resume...', 'info');

        try {
            const response = await fetch(`${API_BASE}/profile/parse-resume`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}` },
                body: formData
            });
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    showAlert('Resume parsed! Redirecting to update your profile...', 'success');
                    sessionStorage.setItem('parsedResumeData', JSON.stringify(result.data));
                    setTimeout(() => { window.location.href = '/profile/setup?edit=true&fromResume=true'; }, 1500);
                } else {
                    throw new Error(result.message || 'Failed to parse resume');
                }
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || errorData.detail || 'Failed to parse resume');
            }
        } catch (error) {
            const err = /** @type {Error} */ (error);
            console.error('Error uploading resume:', err);
            showAlert(err.message || 'Error parsing resume. Please try again.', 'danger');
        }
        input.value = '';
    }

    // =============================================================================
    // SECTION NAVIGATION
    // =============================================================================

    /**
     * @param {string} sectionName
     * @param {MouseEvent} [evt]
     */
    function showSection(sectionName, evt) {
        document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById(sectionName + 'Section')?.classList.add('active');
        (/** @type {HTMLElement|null} */ (evt?.target ?? null))?.classList.add('active');
        const alertContainer = document.getElementById('alertContainer');
        if (alertContainer) alertContainer.innerHTML = '';
    }

    // =============================================================================
    // PASSWORD CHANGE
    // =============================================================================

    /** @param {Event} event */
    async function handlePasswordChange(event) {
        event.preventDefault();
        const curPw  = /** @type {HTMLInputElement|null} */ (document.getElementById('currentPassword'));
        const newPw  = /** @type {HTMLInputElement|null} */ (document.getElementById('newPassword'));
        const confPw = /** @type {HTMLInputElement|null} */ (document.getElementById('confirmPassword'));
        if (!curPw || !newPw || !confPw) return;

        if (newPw.value !== confPw.value) { showAlert('New passwords do not match.', 'danger'); return; }
        if (newPw.value.length < 8)       { showAlert('Password must be at least 8 characters long.', 'danger'); return; }

        try {
            const response = await fetch(`${API_BASE}/auth/change-password`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password: curPw.value, new_password: newPw.value, confirm_password: confPw.value })
            });
            if (response.ok) {
                const data = await response.json();
                // Replace the old (now-invalidated) token with the fresh one the server issued
                if (data.access_token) {
                    localStorage.setItem('access_token', data.access_token);
                    localStorage.setItem('authToken', data.access_token);
                }
                showAlert('Password updated successfully!', 'success');
                /** @type {HTMLFormElement|null} */ (document.getElementById('passwordForm'))?.reset();
                document.getElementById('newPassword-container')?.classList.remove('is-valid', 'is-invalid');
                document.getElementById('confirmPassword-container')?.classList.remove('is-valid', 'is-invalid');
                document.querySelectorAll('.password-requirements li').forEach(li => li.classList.remove('valid'));
                document.querySelector('.password-header')?.classList.add('collapsed');
                document.getElementById('passwordFormContent')?.classList.remove('expanded');
            } else {
                let errData;
                try { errData = await response.json(); } catch { errData = { detail: 'Server error occurred' }; }
                throw new Error(errData.message || errData.detail || 'Failed to update password');
            }
        } catch (error) {
            const err = /** @type {Error} */ (error);
            console.error('Error updating password:', err);
            showAlert(err.message, 'danger');
        }
    }

    // =============================================================================
    // DATA MANAGEMENT
    // =============================================================================

    async function exportData() {
        try {
            const response = await fetch(`${API_BASE}/profile/export`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (response.ok) {
                const blob = await response.blob();
                const url  = window.URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href = url; a.download = `applypilot-data-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a); a.click();
                window.URL.revokeObjectURL(url); document.body.removeChild(a);
                showAlert('Data export downloaded successfully!', 'success');
            } else { throw new Error('Failed to export data'); }
        } catch (error) {
            console.error('Error exporting data:', error);
            showAlert('Error exporting data. Please try again.', 'danger');
        }
    }

    function restartOnboarding() {
        localStorage.removeItem('onboarding_completed');
        window.location.href = '/dashboard';
    }

    async function clearAllData() {
        // Check if there's anything to clear before showing the destructive modal
        try {
            const res = await fetch(`${API_BASE}/applications/stats/overview`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (res.ok) {
                const stats = await res.json();
                if ((stats.total_applications || 0) === 0) {
                    showAlert('You have no applications to clear.', 'info');
                    return;
                }
            }
        } catch { /* proceed to modal if check fails */ }

        const confirmed = await showConfirm({
            title: 'Clear All Applications',
            message: 'This will permanently delete all your job applications and AI-generated results (cover letters, analyses, interview prep). Your account and profile stay intact.',
            confirmText: 'Yes, Clear Applications',
            type: 'danger',
        });
        if (!confirmed) return;
        performDataClear();
    }

    async function performDataClear() {
        try {
            const response = await fetch(`${API_BASE}/profile/clear-data`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ confirm: true })
            });
            if (response.ok) {
                showAlert('All application data has been cleared.', 'success');
                setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
            } else if (response.status === 429) {
                throw new Error('You have no applications to clear.');
            } else {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || errData.detail || 'Failed to clear data');
            }
        } catch (error) {
            const err = /** @type {Error} */ (error);
            console.error('Error clearing data:', err);
            showAlert(err.message || 'Error clearing data. Please try again.', 'danger');
        }
    }

    async function deleteAccount() {
        const confirmed = await showConfirm({
            title: 'Delete Account',
            message: 'This will permanently delete your account and all associated data. This action cannot be undone.',
            confirmText: 'Delete Account',
            type: 'danger',
        });
        if (!confirmed) return;

        let password = '';
        if (userHasPassword) {
            const result = await showConfirm({
                title: 'Enter Your Password',
                message: 'Enter your current password to confirm account deletion.',
                confirmText: 'Delete Account',
                type: 'danger',
                inputPlaceholder: 'Your password',
                inputType: 'password',
            });
            if (result === null) return;
            password = /** @type {string} */ (result);
        }
        performAccountDeletion(password);
    }

    async function performAccountDeletion(/** @type {string} */ password) {
        try {
            const response = await fetch(`${API_BASE}/profile/delete-account`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password: password }),
            });
            if (response.ok) {
                const cookieConsent = localStorage.getItem('cookie_consent');
                localStorage.clear();
                if (cookieConsent) localStorage.setItem('cookie_consent', cookieConsent);
                window.location.href = '/auth/login?account_deleted=1';
            } else {
                const data = await response.json().catch(() => ({}));
                throw new Error((data && (data.message || data.detail)) || 'Failed to delete account');
            }
        } catch (error) {
            console.error('Error deleting account:', error);
            showAlert('Error deleting account. Please try again.', 'danger');
        }
    }

    // =============================================================================
    // API KEY MANAGEMENT
    // =============================================================================

    async function loadApiKeyStatus() {
        try {
            const response = await fetch(`${API_BASE}/profile/api-key/status`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (response.ok) {
                updateApiKeyStatusUI(await response.json());
            } else if (response.status === 401) {
                window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login';
            }
        } catch (error) {
            console.error('Error loading API key status:', error);
            const el = document.getElementById('apiKeyStatusText');
            if (el) el.textContent = 'Error loading status';
        }
    }

    /** @param {Record<string,unknown>} data */
    function updateApiKeyStatusUI(data) {
        const serverNotice   = document.getElementById('serverKeyNotice');
        const byokNotice     = document.getElementById('byokNotice');
        const userKeyNotice  = document.getElementById('userKeyNotice');
        const statusText     = document.getElementById('apiKeyStatusText');
        const userKeyIcon    = document.getElementById('userKeyIcon');
        const modelCard      = /** @type {HTMLElement|null} */ (document.getElementById('modelSelectorCard'));

        serverNotice  && (serverNotice.style.display  = 'none');
        byokNotice    && (byokNotice.style.display    = 'none');
        userKeyNotice && (userKeyNotice.style.display = 'none');

        const hasUserKey   = !!(data['has_user_key'] || data['has_api_key']);
        const useVertexAI  = !!data['use_vertex_ai'];
        const serverHasKey = !!data['server_has_key'];

        if (hasUserKey) {
            if (userKeyNotice) userKeyNotice.style.display = 'block';

            if (useVertexAI) {
                // Key is stored but not used — server runs Vertex AI
                if (statusText)  statusText.textContent = `Key ${data['key_preview'] || '****'} is saved but not used — this server handles AI internally. You can safely remove it.`;
                if (userKeyIcon) userKeyIcon.className = 'account-icon account-icon--amber';
                if (userKeyNotice) userKeyNotice.classList.add('account-card--warning');
            } else {
                // Key is active and being used
                if (statusText)  statusText.textContent = `Active: ${data['key_preview'] || '****'}`;
                if (userKeyIcon) userKeyIcon.className = 'account-icon account-icon--cyan';
                if (userKeyNotice) userKeyNotice.classList.remove('account-card--warning');
            }
        } else if (serverHasKey) {
            if (serverNotice) serverNotice.style.display = 'block';
        } else {
            if (byokNotice) byokNotice.style.display = 'block';
        }

        // Model selector: only when user has their own key AND server is NOT using Vertex AI
        if (modelCard) {
            const showModel = hasUserKey && !useVertexAI;
            modelCard.style.display = showModel ? 'block' : 'none';
            if (showModel) loadModelPreference();
        }
    }

    /** @type {ReturnType<typeof setTimeout>|null} */
    let _modelSaveTimer = null;

    async function loadModelPreference() {
        try {
            const res = await fetch(`${API_BASE}/profile/preferences`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('preferredModelSelect'));
            if (sel && data['preferred_model']) sel.value = data['preferred_model'];
        } catch (err) {
            console.error('Error loading model preference:', err);
        }
    }

    async function saveModelPreference() {
        const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById('preferredModelSelect'));
        if (!sel) return;
        try {
            const res = await fetch(`${API_BASE}/profile/preferences`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ preferred_model: sel.value })
            });
            if (res.ok) {
                const ind = document.getElementById('modelSavedIndicator');
                if (ind) { ind.style.opacity = '1'; setTimeout(() => { ind.style.opacity = '0'; }, 2000); }
            }
        } catch (err) {
            console.error('Error saving model preference:', err);
        }
    }

    function toggleApiKeyVisibility() {
        const input = /** @type {HTMLInputElement|null} */ (document.getElementById('geminiApiKey'));
        const icon  = document.getElementById('toggleApiKeyIcon');
        if (!input || !icon) return;
        if (input.type === 'password') {
            input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    }

    async function validateApiKey() {
        const input     = /** @type {HTMLInputElement|null} */ (document.getElementById('geminiApiKey'));
        const resultDiv = document.getElementById('apiKeyValidationResult');
        const apiKey    = input?.value.trim() ?? '';
        if (!apiKey)    { showAlert('Please enter an API key to validate.', 'warning'); return; }
        if (!resultDiv) return;

        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div class="alert alert-info"><i class="fas fa-spinner fa-spin me-2"></i>Validating API key...</div>';

        try {
            const response = await fetch(`${API_BASE}/profile/api-key/validate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });
            const data = await response.json();
            if (response.ok && data.valid) {
                resultDiv.innerHTML = `<div class="alert alert-success"><i class="fas fa-check-circle me-2"></i><strong>Valid!</strong> API key works correctly. ${escapeHtml(String(data.models_available))} models available.</div>`;
            } else {
                resultDiv.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle me-2"></i><strong>Invalid:</strong> ${escapeHtml(data.message || data.detail || 'API key validation failed')}</div>`;
            }
        } catch (error) {
            console.error('Error validating API key:', error);
            if (resultDiv) resultDiv.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle me-2"></i>Failed to validate API key. Please try again.</div>`;
        }
    }

    /** @param {Event} event */
    async function handleApiKeySave(event) {
        event.preventDefault();
        const input  = /** @type {HTMLInputElement|null} */ (document.getElementById('geminiApiKey'));
        const apiKey = input?.value.trim() ?? '';
        if (!apiKey) { showAlert('Please enter an API key.', 'warning'); return; }

        try {
            const response = await fetch(`${API_BASE}/profile/api-key`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });
            if (response.ok) {
                showAlert('API key saved successfully!', 'success');
                if (input) input.value = '';
                const resultDiv = document.getElementById('apiKeyValidationResult');
                if (resultDiv) resultDiv.style.display = 'none';
                await loadApiKeyStatus();
            } else {
                const errData = await response.json();
                throw new Error(errData.message || errData.detail || 'Failed to save API key');
            }
        } catch (error) {
            const err = /** @type {Error} */ (error);
            console.error('Error saving API key:', err);
            showAlert(err.message || 'Error saving API key. Please try again.', 'danger');
        }
    }

    async function deleteApiKey() {
        const confirmed = await showConfirm({
            title: 'Remove API Key',
            message: 'Are you sure? You will need to add a new key to use AI features.',
            confirmText: 'Remove',
            type: 'danger',
        });
        if (!confirmed) return;
        try {
            const response = await fetch(`${API_BASE}/profile/api-key`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (response.ok) {
                showAlert('API key deleted successfully.', 'success');
                const resultDiv = document.getElementById('apiKeyValidationResult');
                if (resultDiv) resultDiv.style.display = 'none';
                await loadApiKeyStatus();
            } else { throw new Error('Failed to delete API key'); }
        } catch (error) {
            console.error('Error deleting API key:', error);
            showAlert('Error deleting API key. Please try again.', 'danger');
        }
    }

    /**
     * @param {string} message
     * @param {string} type
     */
    function showAlert(message, type) { notify(message, type); }

    // =============================================================================
    // ACCOUNT SECTION — PASSWORD VISIBILITY
    // Email-registered users see the password section; Google-registered users do not.
    // =============================================================================

    async function loadGoogleAccountStatus() {
        try {
            const response = await fetch(`${API_BASE}/profile/`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            if (!response.ok) return;
            const data         = await response.json();
            const userInfo     = data.user_info || {};
            userHasPassword    = userInfo.auth_method === 'local' || userInfo.has_password;
            const passwordSection = /** @type {HTMLElement|null} */ (document.getElementById('passwordSection'));
            if (passwordSection) passwordSection.style.display = userHasPassword ? 'block' : 'none';
        } catch (error) {
            console.error('Error loading account status:', error);
        }
    }

    // Public API
    // @ts-ignore
    window.clearAllData            = clearAllData;
    // @ts-ignore
    window.deleteAccount           = deleteAccount;
    // @ts-ignore
    window.deleteApiKey            = deleteApiKey;
    // @ts-ignore
    window.exportData              = exportData;
    // @ts-ignore
    window.handleResumeUpload      = handleResumeUpload;
    // @ts-ignore
    window.restartOnboarding       = restartOnboarding;
    // @ts-ignore
    window.showSection             = showSection;
    // @ts-ignore
    window.toggleApiKeyVisibility  = toggleApiKeyVisibility;
    // @ts-ignore
    window.togglePasswordField     = togglePasswordField;
    // @ts-ignore
    window.togglePasswordSection   = togglePasswordSection;
    // @ts-ignore
    window.validateApiKey          = validateApiKey;

}());
