(function () {
    'use strict';

    // ================================================================
    // APPLYPILOT - PROFILE SETUP
    // ================================================================
    // 4-Step Profile Setup Implementation
    // Step 1: Basic Information + Professional Summary
    // Step 2: Work Experience (minimum 1 entry required)
    // Step 3: Skills
    // Step 4: Career Preferences (job types, company sizes, arrangements)
    //
    // Features:
    // - Form validation with detailed error messages
    // - Dynamic form sections (add/remove entries)
    // - Progress tracking and completion summary
    // - API integration with backend profile endpoints
    // - Enum-based dropdowns for consistent data entry
    // ================================================================

    // ================================================================
    // GLOBAL VARIABLES AND CONFIGURATION
    // ================================================================

    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api/v1';

    /** @param {string} str */
    function escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    let currentStep = 0;  // Start at step 0 (resume upload)
    const totalSteps = 5; // 0: Resume, 1: Basic Info, 2: Experience, 3: Skills, 4: Preferences

    // Data collections for dynamic form sections
    let skills = [];
    let workExperience = [];

    // In-flight request tracker — aborted on page unload
    let _pageAbortController = new AbortController();

    // Constants and global variables
    const STORAGE_KEYS = {
        ACCESS_TOKEN: "access_token",
        TOKEN_TYPE: "token_type",
        USER_DATA: "user_data",
        PROFILE_COMPLETED: "profile_completed"
    };

    /**
     * Get authentication token from URL parameters or localStorage
     * Checks both 'access_token' and legacy 'authToken' keys for backward compatibility
     */
    function getAuthToken() {
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromUrl = urlParams.get('token') || urlParams.get('access_token');
        if (tokenFromUrl) return tokenFromUrl;
        return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) || localStorage.getItem('authToken');
    }

    /**
     * Set authentication token in localStorage under both keys for backward compatibility
     */
    function setAuthToken(token) {
        if (!token) return;
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, token);
        localStorage.setItem('authToken', token);
    }

    /**
     * Returns a debounced version of fn that delays invocation until after
     * wait milliseconds have elapsed since the last call.
     * @template {(...args: any[]) => void} T
     * @param {T} fn
     * @param {number} wait
     * @returns {T}
     */
    function debounce(fn, wait) {
        let timer = 0;
        return /** @type {T} */ (function (...args) {
            clearTimeout(timer);
            timer = window.setTimeout(() => fn.apply(this, args), wait);
        });
    }

    // Validation rules and constants
    const VALIDATION_RULES = {
        MIN_EXPERIENCE_ENTRIES: 1,
        MIN_SKILLS: 1,
        MIN_JOB_TYPES: 1,
        MIN_COMPANY_SIZES: 1,
        MIN_WORK_ARRANGEMENTS: 1
    };

    // Cached DOM elements — resolved once at module load to avoid repeated getElementById calls
    const progressBar   = document.getElementById("progress-bar");
    const prevBtn       = document.getElementById("prev-btn");
    const nextBtn       = document.getElementById("next-btn");
    const completeBtn   = document.getElementById("complete-btn");
    const errorAlert    = document.getElementById("error-alert");
    const successAlert  = document.getElementById("success-alert");
    const errorMessage  = document.getElementById("error-message");
    const successMessage = document.getElementById("success-message");
    const skillsContainer = document.getElementById("skills-container");
    const experienceContainer = document.getElementById("experience-container");

    /**
     * If the URL contains ?code= from an OAuth callback, exchange it for a JWT
     * and store it in localStorage before the auth check runs.
     * @returns {Promise<boolean>}
     */
    async function exchangeOAuthCodeIfPresent() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (!code) return false;

        // Remove ?code= from the URL immediately so a refresh doesn't replay it.
        urlParams.delete('code');
        const newSearch = urlParams.toString();
        history.replaceState(null, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));

        try {
            const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api/v1';
            const response = await fetch(`${API_BASE}/auth/oauth/exchange-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
            });
            if (!response.ok) return false;
            const data = await response.json();
            const token = /** @type {string|undefined} */ (data.access_token);
            if (!token) return false;
            setAuthToken(token);
            return true;
        } catch (err) {
            const error = /** @type {Error} */ (err);
            console.error('OAuth code exchange failed:', error.message);
            return false;
        }
    }

    // Initialize page
    document.addEventListener("DOMContentLoaded", async function () {
        await exchangeOAuthCodeIfPresent();
        checkAuthentication();

        // Handle edit mode and fromResume parameters
        const urlParams = new URLSearchParams(window.location.search);
        const isEditMode = urlParams.get('edit') === 'true';
        const fromResume = urlParams.get('fromResume') === 'true';

        // If profile is already complete and this isn't an intentional edit, redirect to dashboard
        // immediately — prevents the wizard from flashing for users who have finished setup.
        if (!isEditMode && !fromResume && localStorage.getItem('profile_completed') === 'true') {
            window.location.href = '/dashboard';
            return;
        }

        // Must finish loading saved profile before applying parsed resume from sessionStorage.
        // Otherwise populateFormData() can resolve after autoFillProfile() and overwrite parsed data.
        await loadUserData();

        initializeEventListeners();
        updateStepDisplay();

        // Button event listeners for navigation
        nextBtn.addEventListener("click", goToNextStep);
        prevBtn.addEventListener("click", goToPrevStep);
        completeBtn.addEventListener("click", completeProfile);
        document.getElementById("logout-btn").addEventListener("click", logout);

        // Skip resume button - go directly to basic info
        const skipResumeBtn = document.getElementById("skip-resume-btn");
        if (skipResumeBtn) {
            skipResumeBtn.addEventListener("click", function() {
                changeStep(1); // Go to Basic Info step
            });
        }

        // Silently check key status on load so we know before the user interacts.
        // The prompt card only appears when they actually try to upload.
        checkApiKeyStatus();
        setupInlineApiKey();

        if (fromResume) {
            const parsedData = sessionStorage.getItem('parsedResumeData');
            if (parsedData) {
                try {
                    const resumeData = JSON.parse(parsedData);
                    autoFillProfile(resumeData);
                    sessionStorage.removeItem('parsedResumeData');
                } catch (e) {
                    console.error('Failed to parse resume data:', e);
                }
            }
        }

        if (isEditMode) {
            // In edit mode, skip step 0 (resume upload) and go to step 1
            // Use requestAnimationFrame to defer until layout is settled
            requestAnimationFrame(() => changeStep(1));

            // Update page title for edit mode
            const headerTitle = document.querySelector('.sidebar h2');
            if (headerTitle) {
                headerTitle.textContent = 'Edit Your Profile';
            }
        }

        // Update UI
        updateStepIndicators();
        updateProgressBar();
        checkPreferencesStep();
        updateStepDisplay();
    });

    // Abort any in-flight requests when the user navigates away
    window.addEventListener('beforeunload', function () {
        _pageAbortController.abort();
    });

    // Authentication check
    function checkAuthentication() {
        // @ts-ignore
        const app = window.app;
        if (app && typeof app.isAuthenticated === 'function') {
            if (!app.isAuthenticated()) { window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login'; }
            return;
        }
        // Fallback: read from localStorage directly
        const token = localStorage.getItem('access_token') || localStorage.getItem('authToken');
        if (!token) { window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login'; return; }
        if (token.split('.').length !== 3) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('authToken');
            window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login';
        }
    }

    /**
     * Make an authenticated API call via window.app.apiCall.
     * Falls back to a direct fetch if window.app is not yet available.
     * @param {string} endpoint - API endpoint (e.g. "/profile/basic-info")
     * @param {string} [method] - HTTP method (default: 'GET')
     * @param {Object|null} [body] - Request body object (will be JSON-stringified)
     * @returns {Promise<Object>} Parsed JSON response
     */
    async function makeAuthenticatedApiCall(endpoint, method = 'GET', body = null) {
        // @ts-ignore
        const app = window.app;
        if (app && typeof app.apiCall === 'function') {
            return app.apiCall(endpoint, method, body);
        }
        // Fallback: direct fetch (should not normally be needed)
        const token = getAuthToken();
        if (!token) { window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login'; throw new Error('Authentication required'); }
        const fetchOptions = /** @type {RequestInit} */ ({
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        });
        if (body && method !== 'GET') fetchOptions.body = JSON.stringify(body);
        const response = await fetch(`${API_BASE}${endpoint}`, fetchOptions);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            if (response.status === 401) { window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login'; }
            throw new Error(err.message || err.detail || `API error: ${response.status}`);
        }
        return response.json();
    }

    // Load existing user data
    async function loadUserData() {
        try {
            const data = await makeAuthenticatedApiCall("/profile/");
            populateFormData(data);

        } catch (error) {
            // For new users, this error is expected and will be silently ignored
        }
    }

    // Populate form with existing data
    function populateFormData(data) {
        const userInfo = data.user_info;
        const profileData = data.profile_data;

        // Populate location fields
        if (profileData.city)
            document.getElementById("city").value = profileData.city;
        if (profileData.state)
            document.getElementById("state").value = profileData.state;
        if (profileData.country)
            document.getElementById("country").value = profileData.country;

        // Populate professional details
        if (profileData.professional_title)
            document.getElementById("professional-title").value = profileData.professional_title;
        if (profileData.years_experience !== undefined && profileData.years_experience !== null)
            document.getElementById("years-experience").value = String(profileData.years_experience);
        if (profileData.summary)
            document.getElementById("summary").value = profileData.summary;

        // Student status field has been removed

        // Work experience — empty array is truthy in JS; sync "no experience" checkbox
        workExperience = Array.isArray(profileData.work_experience)
            ? profileData.work_experience
            : [];
        renderWorkExperience();
        const noExpOnLoad = /** @type {HTMLInputElement|null} */ (document.getElementById("no-experience"));
        if (noExpOnLoad) {
            noExpOnLoad.checked = workExperience.length === 0;
            if (noExpOnLoad.checked) {
                noExpOnLoad.dispatchEvent(new Event("change"));
            }
        }

        // Skills
        if (profileData.skills) {
            skills = profileData.skills;
            renderSkills();
        }

        // Job preferences
        if (profileData.desired_salary_range) {
            document.getElementById("min-salary").value =
                profileData.desired_salary_range.min;
            document.getElementById("max-salary").value =
                profileData.desired_salary_range.max;
        }

        // Company sizes
        if (profileData.desired_company_sizes) {
            profileData.desired_company_sizes.forEach((size) => {
                // Extract the lowercase first word for matching
                const sizeKey = size.split(' ')[0].toLowerCase();
                const checkbox = document.querySelector(
                    `input[value="${sizeKey}"][id^="company-size-"]`,
                );
                if (checkbox) {
                    checkbox.checked = true;
                } else {
                }
            });
        }

        // Job types
        if (profileData.job_types) {
            profileData.job_types.forEach((type) => {
                // Convert "Full-time" to "full-time", etc.
                const typeKey = type.toLowerCase().replace(' ', '-');
                const checkbox = document.querySelector(
                    `input[value="${typeKey}"][id^="job-type-"]`,
                );
                if (checkbox) {
                    checkbox.checked = true;
                } else {
                }
            });
        }

        // Work arrangements
        if (profileData.work_arrangements) {
            profileData.work_arrangements.forEach((arrangement) => {
                // Convert "Onsite" to "onsite", etc.
                const arrangementKey = arrangement.toLowerCase();
                const checkbox = document.querySelector(`input[value="${arrangementKey}"][id^="work-arrangement-"]`);
                if (checkbox) {
                    checkbox.checked = true;
                } else {
                }
            });
        }

        // Populate additional career options
        if (profileData.willing_to_relocate) {
            document.getElementById("willing-to-relocate").checked = true;
        }

        // Handle visa sponsorship checkbox - check for both field names in DB
        if (profileData.requires_visa_sponsorship === true) {
            document.getElementById("requires-visa-sponsorship").checked = true;
        }

        if (profileData.has_security_clearance) {
            document.getElementById("has-security-clearance").checked = true;
        }

        // Handle student status checkbox
        if (profileData.is_student === true) {
            document.getElementById("is-student").checked = true;
        }

        // Set travel preference
        if (profileData.max_travel_preference) {

            // Map percentage values to enum values
            const travelPreferenceMap = {
                "0": "NONE",
                "25": "MINIMAL",
                "50": "MODERATE",
                "75": "FREQUENT",
                "100": "EXTENSIVE"
            };

            // Try direct match first
            let travelRadio = document.querySelector(`input[name="travel-preference"][value="${profileData.max_travel_preference}"]`);

            // If not found, try mapping from percentage to enum value
            if (!travelRadio && travelPreferenceMap[profileData.max_travel_preference]) {
                const mappedValue = travelPreferenceMap[profileData.max_travel_preference];
                travelRadio = document.querySelector(`input[name="travel-preference"][value="${mappedValue}"]`);
            }

            if (travelRadio) {
                travelRadio.checked = true;
            } else {
            }
        }
    }

    // Function to check if we need to show the preferences step
    function checkPreferencesStep() {
        // Logic to determine if preferences step should be shown
        // This would typically check if previous steps are completed
    }

    /**
     * Display an error message to the user
     * @param {string} message - Error message to display
     */
    function showErrorMessage(message) {
        if (errorAlert && errorMessage) {
            errorMessage.textContent = message;
            errorAlert.classList.remove("d-none");
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            alert(message);
        }
    }

    // Function to handle next button click
    function goToNextStep() {

        try {
            // Hide any previous error messages
            hideAlerts();

            // Validate the current step before proceeding
            let isValid = false;

            // Step-specific validation
            switch(currentStep) {
                case 1: // Basic Info
                    isValid = validateBasicInfo();
                    break;
                case 2: // Work Experience
                    isValid = validateWorkExperience();
                    break;
                case 3: // Skills
                    isValid = validateSkillsQualifications();
                    break;
                case 4: // Career Preferences
                    isValid = validateCareerPreferences();
                    break;
                default:
                    isValid = true;
            }

            // Only proceed if validation passes
            if (isValid) {
                changeStep(currentStep + 1);
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        } catch (error) {
            console.error("Error in goToNextStep:", error);
            showError("Error moving to next step: " + error.message);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // Function to handle previous button click
    function goToPrevStep() {
        changeStep(currentStep - 1);
    }

    function initializeEventListeners() {

        // Resume upload functionality
        initializeResumeUpload();

        // Skills input — debounced to avoid processing partial words
        const skillsInput = document.getElementById("skills-input");
        skillsInput.addEventListener("keypress", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                addSkill(this.value.trim());
                this.value = "";
            }
        });

        // Salary inputs — debounced validation (300 ms) to avoid on-every-keystroke work
        const debouncedSalaryValidate = debounce(() => {
            const min = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('min-salary'))?.value) || 0;
            const max = parseInt(/** @type {HTMLInputElement} */ (document.getElementById('max-salary'))?.value) || 0;
            const maxInput = /** @type {HTMLInputElement|null} */ (document.getElementById('max-salary'));
            if (maxInput && max > 0 && min > 0 && max <= min) {
                maxInput.setCustomValidity('Maximum salary must be greater than minimum salary.');
            } else if (maxInput) {
                maxInput.setCustomValidity('');
            }
        }, 300);
        document.getElementById('min-salary')?.addEventListener('input', debouncedSalaryValidate);
        document.getElementById('max-salary')?.addEventListener('input', debouncedSalaryValidate);

        // Add experience button (wired here; also used below for no-experience toggle)
        document
            .getElementById("add-experience-btn")
            ?.addEventListener("click", addWorkExperience);

        // No experience checkbox — uses cached container reference
        const noExperienceCheckbox = document.getElementById("no-experience");
        const addExperienceBtn = /** @type {HTMLElement|null} */ (document.getElementById("add-experience-btn"));
        if (noExperienceCheckbox) {
            noExperienceCheckbox.addEventListener("change", function() {
                const container = experienceContainer || document.getElementById("experience-container");
                if (this.checked) {
                    if (addExperienceBtn) { addExperienceBtn.style.opacity = "0.5"; addExperienceBtn.style.pointerEvents = "none"; }
                    if (container) container.style.opacity = "0.5";
                } else {
                    if (addExperienceBtn) { addExperienceBtn.style.opacity = "1"; addExperienceBtn.style.pointerEvents = "auto"; }
                    if (container) container.style.opacity = "1";
                }
            });
        }
    }

    // =============================================================================
    // RESUME UPLOAD AND PARSING
    // =============================================================================

    /**
     * Initialize resume upload functionality
     */
    function initializeResumeUpload() {
        const dropZone = document.getElementById("resume-drop-zone");
        const fileInput = document.getElementById("resume-file-input");

        if (!dropZone || !fileInput) return;

        // Click to upload — show API key prompt first if no key is configured
        dropZone.addEventListener("click", () => {
            if (!_hasApiKey) {
                showApiKeyPrompt();
                return;
            }
            fileInput.click();
        });

        // File input change (triggered after click passes the key check)
        fileInput.addEventListener("change", (e) => {
            const target = /** @type {HTMLInputElement} */ (e.target);
            if (target.files && target.files.length > 0) {
                handleResumeUpload(target.files[0]);
            }
        });

        // Drag visual feedback
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.classList.add("dragover");
        });

        dropZone.addEventListener("dragleave", (e) => {
            e.preventDefault();
            dropZone.classList.remove("dragover");
        });

        // Drop — show API key prompt if no key, otherwise upload
        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.classList.remove("dragover");

            if (!_hasApiKey) {
                showApiKeyPrompt();
                return;
            }

            const files = e.dataTransfer ? e.dataTransfer.files : null;
            if (files && files.length > 0) {
                handleResumeUpload(files[0]);
            }
        });
    }

    /**
     * Module-level flag: true when the user or server already has a key.
     * Populated silently on load — never mutates the DOM directly.
     * @type {boolean}
     */
    let _hasApiKey = true; // optimistic default; corrected by checkApiKeyStatus()

    /**
     * Silently fetch key status and store the result in _hasApiKey.
     * Does NOT touch the DOM — the prompt card appears only when the user
     * actually tries to interact with the upload zone.
     */
    async function checkApiKeyStatus() {
        try {
            const token = getAuthToken();
            if (!token) return;
            const res = await fetch(`${API_BASE}/profile/api-key/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            _hasApiKey = !!(data.has_user_key || data.server_has_key || data.use_vertex_ai);
        } catch (_e) {
            // Non-fatal — assume key available so we never block upload incorrectly
        }
    }

    /**
     * Show the API key prompt card and focus the input.
     */
    function showApiKeyPrompt() {
        const prompt = document.getElementById('api-key-prompt');
        if (!prompt) return;
        prompt.style.display = 'flex';
        const input = /** @type {HTMLInputElement|null} */ (document.getElementById('setup-api-key-input'));
        if (input) input.focus();
        prompt.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Wire up the inline API key save button on step 0.
     * On success: marks _hasApiKey = true, shows confirmation briefly,
     * then collapses the card so the upload zone is the focus.
     */
    function setupInlineApiKey() {
        const saveBtn   = document.getElementById('setup-save-key-btn');
        const input     = /** @type {HTMLInputElement|null} */ (document.getElementById('setup-api-key-input'));
        const spinner   = document.getElementById('setup-save-key-spinner');
        const btnText   = document.getElementById('setup-save-key-text');
        const successEl = document.getElementById('setup-key-success');
        const errorEl   = document.getElementById('setup-key-error');
        const prompt    = document.getElementById('api-key-prompt');

        if (!saveBtn || !input) return;

        saveBtn.addEventListener('click', async function () {
            const key = input.value.trim();

            if (!key) {
                if (errorEl) { errorEl.textContent = 'Please paste your API key.'; errorEl.style.display = 'block'; }
                input.focus();
                return;
            }
            if (!key.startsWith('AIza')) {
                if (errorEl) { errorEl.textContent = 'Gemini API keys start with "AIza" — please double-check your key.'; errorEl.style.display = 'block'; }
                input.focus();
                return;
            }
            if (errorEl) errorEl.style.display = 'none';

            saveBtn.disabled = true;
            if (spinner) spinner.style.display = 'inline-block';
            if (btnText) btnText.textContent = 'Saving…';

            try {
                const token = getAuthToken();
                const res = await fetch(`${API_BASE}/profile/api-key`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ api_key: key })
                });

                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || data.detail || 'Failed to save key.');

                // Mark key as available so next interaction goes straight to upload
                _hasApiKey = true;
                input.value = '';

                // Swap input row for success message
                const inputRow = document.getElementById('api-key-input-row');
                if (inputRow) inputRow.style.display = 'none';
                if (successEl) successEl.style.display = 'flex';

                // Collapse the card after a moment so the upload zone takes focus
                setTimeout(() => {
                    if (prompt) prompt.style.display = 'none';
                    // Re-show input row for the edge case where they open it again
                    if (inputRow) inputRow.style.display = 'flex';
                    if (successEl) successEl.style.display = 'none';
                }, 2000);

            } catch (err) {
                const e = /** @type {Error} */ (err);
                if (errorEl) { errorEl.textContent = e.message || 'Could not save key — please try again.'; errorEl.style.display = 'block'; }
            } finally {
                saveBtn.disabled = false;
                if (spinner) spinner.style.display = 'none';
                if (btnText) btnText.textContent = 'Save & Continue';
            }
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') saveBtn.click();
        });
    }

    /**
     * The template has a Bootstrap spinner next to #upload-status-text; toggle it so it
     * does not keep animating after success or failure.
     * @param {boolean} visible
     */
    function setResumeUploadSpinnerVisible(visible) {
        const spin = document.querySelector("#upload-status .spinner-border");
        if (spin) spin.classList.toggle("d-none", !visible);
    }

    /**
     * Handle resume file upload and parsing
     * @param {File} file - The resume file to upload
     */
    async function handleResumeUpload(file) {
        const dropZone = document.getElementById("resume-drop-zone");
        const progressContainer = document.getElementById("upload-progress");
        const progressBar = document.getElementById("upload-progress-bar");
        const progressTrack = progressContainer?.querySelector(".progress");
        const statusText = document.getElementById("upload-status-text");
        const statusContainer = document.getElementById("upload-status");

        // Validate file
        const allowedExtensions = [".pdf", ".docx", ".txt"];
        const fileExtension = "." + file.name.split(".").pop().toLowerCase();

        if (!allowedExtensions.includes(fileExtension)) {
            showError("Please upload a PDF, DOCX, or TXT file.");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            showError("File size must be less than 10MB.");
            return;
        }

        try {
            hideAlerts();
            // Show progress with indeterminate animation
            dropZone.classList.add("uploading");
            progressContainer.classList.remove("d-none");
            if (progressTrack) progressTrack.classList.remove("d-none");
            progressBar.classList.remove("d-none", "success");
            progressBar.classList.add("indeterminate");
            setResumeUploadSpinnerVisible(true);
            statusText.textContent = "Parsing your resume...";
            statusContainer.className = "upload-status";

            // Prepare form data
            const formData = new FormData();
            formData.append("resume", file);

            // Get auth token
            const token = getAuthToken();
            if (!token) {
                throw new Error("Authentication required");
            }

            // Call the parse-resume API
            const response = await fetch(`${API_BASE}/profile/parse-resume`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                // No API key — update flag and surface the prompt
                if (errorData.error_code === 'CFG_6001') {
                    _hasApiKey = false;
                    showApiKeyPrompt();
                    throw new Error('Resume parsing requires a Gemini API key. Add your key above, or use "Fill in manually".');
                }
                throw new Error(errorData.message || errorData.detail || "Failed to parse resume");
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || "Failed to parse resume");
            }

            statusText.textContent = "Auto-filling profile...";

            // Auto-fill the profile with parsed data
            await autoFillProfile(result.data);

            // Show success - switch from indeterminate to success state
            setResumeUploadSpinnerVisible(false);
            progressBar.classList.remove("indeterminate");
            progressBar.classList.remove("d-none");
            progressBar.classList.add("success");
            statusContainer.className = "upload-status success";
            statusText.innerHTML = '<i class="fas fa-check-circle me-1"></i> Resume parsed successfully!';

            showSuccess(`Resume parsed with ${result.confidence || 'MEDIUM'} confidence. Please review the auto-filled data.`);

            // Navigate to Basic Info step — let the success message render first
            requestAnimationFrame(() => changeStep(1));

        } catch (error) {
            console.error("Resume upload error:", error);
            const err = /** @type {Error} */ (error);
            const msg = err.message || "Failed to parse resume. Please try again or enter your information manually.";
            setResumeUploadSpinnerVisible(false);
            progressBar.classList.remove("indeterminate", "success");
            progressBar.classList.add("d-none");
            if (progressTrack) progressTrack.classList.add("d-none");
            statusContainer.className = "upload-status error";
            statusText.innerHTML = `<i class="fas fa-exclamation-circle me-1"></i> ${escapeHtml(msg)}`;
            // Inline status only — avoid duplicating the same text in #error-alert
            errorAlert?.classList.add("d-none");
            successAlert?.classList.add("d-none");
        } finally {
            dropZone.classList.remove("uploading");
        }
    }

    /**
     * Auto-fill profile fields with parsed resume data
     * @param {Object} data - Parsed resume data
     */
    async function autoFillProfile(data) {

        // Step 1: Basic Information
        if (data.city) document.getElementById("city").value = data.city;
        if (data.state) document.getElementById("state").value = data.state;
        if (data.country) document.getElementById("country").value = data.country;
        if (data.professional_title) document.getElementById("professional-title").value = data.professional_title;
        if (data.years_experience !== undefined) document.getElementById("years-experience").value = data.years_experience;
        if (data.summary) document.getElementById("summary").value = data.summary;
        if (data.is_student !== undefined) document.getElementById("is-student").checked = data.is_student;

        // Step 2: Work Experience
        if (data.work_experience && data.work_experience.length > 0) {
            // Clear existing work experience
            workExperience = [];

            // Add each work experience (matching existing data structure)
            for (const exp of data.work_experience) {
                workExperience.push({
                    company: exp.company || "",
                    job_title: exp.title || exp.job_title || "",
                    start_date: formatDateForInput(exp.start_date),
                    end_date: exp.is_current ? "" : formatDateForInput(exp.end_date),
                    description: exp.description || "",
                    is_current: exp.is_current || false
                });
            }

            // Use existing render function
            renderWorkExperience();

            const noExpEl = /** @type {HTMLInputElement|null} */ (document.getElementById("no-experience"));
            if (noExpEl && noExpEl.checked) {
                noExpEl.checked = false;
                noExpEl.dispatchEvent(new Event("change"));
            }
        }

        // Step 3: Skills
        if (data.skills && data.skills.length > 0) {
            // Clear existing skills
            skills = [];
            const skillsContainer = document.getElementById("skills-container");
            skillsContainer.innerHTML = "";

            // Add each skill
            for (const skill of data.skills) {
                if (skill && typeof skill === "string") {
                    addSkill(skill);
                }
            }
        }

    }

    /**
     * Format date string for input (YYYY-MM format)
     * @param {string} dateStr - Date string from parsed data
     * @returns {string} Formatted date for input
     */
    function formatDateForInput(dateStr) {
        if (!dateStr) return "";

        // Handle "present" or similar
        if (typeof dateStr === "string" && dateStr.toLowerCase() === "present") return "";

        // If already in YYYY-MM format
        if (/^\d{4}-\d{2}$/.test(dateStr)) return dateStr;

        // If just year (YYYY)
        if (/^\d{4}$/.test(dateStr)) return `${dateStr}-01`;

        // Try to parse other formats
        try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                return `${year}-${month}`;
            }
        } catch (e) {
            console.warn("Could not parse date:", dateStr);
        }

        return "";
    }

    // Step navigation
    function changeStep(newStep) {
        if (newStep < 1 || newStep > totalSteps) return;

        // Update step
        currentStep = newStep;
        updateStepDisplay();

        // Update UI elements
        updateStepIndicators();
        updateProgressBar();

    }

    /**
     * Updates the step indicators in the UI based on current step
     */
    function updateStepIndicators() {
        // Step indicators are for steps 1-4 (Basic Info to Preferences)
        // Step 0 (resume upload) doesn't have an indicator
        document
            .querySelectorAll(".step-indicator")
            .forEach((indicator, index) => {
                const stepNum = index + 1; // Indicators are 1-indexed (1, 2, 3, 4)
                indicator.classList.remove("active", "completed");

                if (currentStep === 0) {
                    // On step 0, no indicator is active yet
                    return;
                }

                if (stepNum === currentStep) {
                    indicator.classList.add("active");
                } else if (stepNum < currentStep) {
                    indicator.classList.add("completed");
                }
            });
    }

    /**
     * Updates the progress bar based on current step
     * Step 0 (resume upload) doesn't count in progress - progress is for steps 1-4
     */
    function updateProgressBar() {
        // Progress is calculated based on steps 1-4 (Basic Info to Preferences)
        // Step 0 is the resume upload intro, not part of the main progress
        const mainSteps = 4; // Steps 1, 2, 3, 4
        const adjustedStep = Math.max(0, currentStep); // Current position in main flow
        const progress = currentStep === 0 ? 0 : (adjustedStep / mainSteps) * 100;
        progressBar.style.width = `${progress}%`;
    }

    function updateStepDisplay() {
        // Show/hide step forms based on current step
        document.querySelectorAll(".step-form").forEach((form) => {
            const formId = form.id;
            const stepNum = parseInt(formId.replace("step-", ""), 10);
            form.classList.remove("active");
            if (stepNum === currentStep) {
                form.classList.add("active");
            }
        });

        // Update navigation buttons
        // Step 0: No prev/next buttons (handled by skip button)
        // Step 1: No prev (or prev goes to step 0), has next
        // Step 2-3: Has prev and next
        // Step 4: Has prev and complete
        // Show/hide progress container based on step
        const progressContainer = document.querySelector(".progress-container");
        if (progressContainer) {
            if (currentStep === 0) {
                progressContainer.classList.add("hidden");
            } else {
                progressContainer.classList.remove("hidden");
            }
        }

        if (currentStep === 0) {
            prevBtn.style.display = "none";
            nextBtn.style.display = "none";
            completeBtn.style.display = "none";
        } else {
            prevBtn.style.display = currentStep > 1 ? "block" : "none";
            nextBtn.style.display = currentStep < 4 ? "block" : "none";
            completeBtn.style.display = currentStep === 4 ? "block" : "none";
        }

        // Update completion summary on final step
        if (currentStep === totalSteps) {
            updateCompletionSummary();
        }
    }

    // Validation
    function validateCurrentStep() {
        switch (currentStep) {
            case 1:
                return validateBasicInfo();
            case 2:
                return validateWorkExperience();
            case 3:
                return validateSkillsQualifications();
            case 4:
                return validateCareerPreferences();
            default:
                return true;
        }
    }

    /**
     * Validate basic information step (Step 1)
     * Ensures all required fields are completed with proper validation
     */
    function validateBasicInfo() {
        const requiredFields = [
            { id: "full-name", name: "Full Name" },
            { id: "city", name: "City" },
            { id: "state", name: "State" },
            { id: "country", name: "Country" },
            { id: "professional-title", name: "Professional Title" },
            { id: "years-experience", name: "Years of Experience" },
            { id: "summary", name: "Professional Summary" }
        ];

        // Optional URL fields (no validation required)
        const optionalUrlFields = [
            { id: "profile-url", name: "Professional Profile URL" },
            { id: "github-url", name: "GitHub URL" },
            { id: "website-url", name: "Personal Website" }
        ];

        let isValid = true;
        let missingFields = [];

        // Check each required field
        requiredFields.forEach(fieldInfo => {
            const field = document.getElementById(fieldInfo.id);
            if (!field) return; // Skip if field doesn't exist

            const value = field.value.trim();
            if (value === "") {
                field.classList.add("is-invalid");
                isValid = false;
                missingFields.push(fieldInfo.name);
            } else {
                field.classList.remove("is-invalid");

                // Additional validation for specific fields
                if (fieldInfo.id === "years-experience") {
                    const years = parseInt(value);
                    if (isNaN(years) || years < 0 || years > 50) {
                        field.classList.add("is-invalid");
                        showError("Years of experience must be between 0 and 50");
                        return false;
                    }
                }
            }
        });

        // Validate optional URL fields if they're not empty
        optionalUrlFields.forEach(fieldInfo => {
            const field = document.getElementById(fieldInfo.id);
            if (!field) return; // Skip if field doesn't exist

            const value = field.value.trim();
            if (value !== "" && !isValidUrl(value)) {
                field.classList.add("is-invalid");
                isValid = false;
                showError(`Please enter a valid URL for ${fieldInfo.name}`);
            } else {
                field.classList.remove("is-invalid");
            }
        });

        if (!isValid && missingFields.length > 0) {
            showError(`Please fill in the following required fields: ${missingFields.join(", ")}`);
        }

        return isValid;
    }

    // Helper function to validate URLs
    function isValidUrl(url) {
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Validate work experience step (Step 2)
     * Ensures at least one work experience entry with required fields
     * or the no experience checkbox is checked
     */
    function validateWorkExperience() {
        // Check if the "no experience" checkbox is checked
        const noExperienceCheckbox = document.getElementById("no-experience");
        if (noExperienceCheckbox && noExperienceCheckbox.checked) {
            // If user has no experience, we don't need to validate further
            return true;
        }

        // Otherwise, require at least one work experience entry
        if (workExperience.length < VALIDATION_RULES.MIN_EXPERIENCE_ENTRIES) {
            showError(`Please add at least ${VALIDATION_RULES.MIN_EXPERIENCE_ENTRIES} work experience entry or check the "I don't have any relevant work experience yet" box`);
            return false;
        }

        // Validate each work experience entry has required fields
        for (let i = 0; i < workExperience.length; i++) {
            const exp = workExperience[i];
            if (!exp.company?.trim() || !exp.job_title?.trim() || !exp.start_date?.trim()) {
                showError(`Work experience entry ${i + 1}: Please fill in Company, Job Title, and Start Date`);
                return false;
            }

            // Validate date logic for completed positions
            if (!exp.is_current && !exp.end_date?.trim()) {
                showError(`Work experience entry ${i + 1}: Please provide an end date or mark as current position`);
                return false;
            }

        }

        return true;
    }

    /**
     * Validate skills step (Step 3)
     * Ensures minimum requirements for skills (at least one skill required)
     */
    function validateSkillsQualifications() {

        // Check if skills array has at least one entry
        if (skills.length < 1) {
            // If skills array is empty, check if there are any skill badges in the DOM
            // (in case the skills array wasn't properly updated)
            const skillsContainer = document.getElementById("skills-container");
            if (skillsContainer) {
                const skillElements = skillsContainer.querySelectorAll(".skill-badge");
                if (skillElements.length > 0) {
                    return true;
                }
            }

            showError("Please add at least one skill");
            return false;
        }

        return true;
    }

    /**
     * Validate career preferences step (Step 4)
     * Ensures all required fields are completed according to requirements:
     * - Minimum & Maximum Salary: Required
     * - Job Types: At least one required
     * - Company Sizes: At least one required
     * - Work Arrangements: At least one required
     * - Travel Preference: One option required
     * - Additional Options: Optional
     */
    function validateCareerPreferences() {
        let isValid = true;
        let errorMessages = [];

        // Validate Salary (both optional, but if both provided min must be less than max)
        const minSalary = document.getElementById('min-salary').value;
        const maxSalary = document.getElementById('max-salary').value;

        if (minSalary && maxSalary && parseInt(minSalary) >= parseInt(maxSalary)) {
            isValid = false;
            errorMessages.push('Minimum salary must be less than maximum salary');
        }

        // Validate Job Types (at least one required)
        const jobTypeElements = document.querySelectorAll('input[id^="job-type-"]:checked');
        if (!jobTypeElements || jobTypeElements.length === 0) {
            isValid = false;
            errorMessages.push('At least one job type must be selected');
        }

        // Validate Company Sizes (at least one required)
        const companySizeElements = document.querySelectorAll('input[id^="company-size-"]:checked');
        if (!companySizeElements || companySizeElements.length === 0) {
            isValid = false;
            errorMessages.push('At least one preferred company size must be selected');
        }

        // Validate Work Arrangements (at least one required)
        const workArrangementElements = document.querySelectorAll('input[id^="work-arrangement-"]:checked');
        if (!workArrangementElements || workArrangementElements.length === 0) {
            isValid = false;
            errorMessages.push('At least one work arrangement must be selected');
        }

        // Validate Travel Preference (one option required)
        const travelPreferenceElement = document.querySelector('input[name="travel-preference"]:checked');
        if (!travelPreferenceElement) {
            isValid = false;
            errorMessages.push('Maximum travel preference must be selected');
        }

        // Show validation errors if any
        if (!isValid) {
            showErrorMessage('Please correct the following issues: ' + errorMessages.join(', '));
        } else {
        }

        return isValid;
    }

    // Data saving
    /**
     * Save current step data to backend
     * Handles step-specific data saving with proper error handling
     */
    async function saveCurrentStepData() {
        try {

            // Get token using the same consistent approach as other functions
            // First check URL parameters for token
            const urlParams = new URLSearchParams(window.location.search);
            let token = urlParams.get('token');


            // If token is in URL, store it in localStorage with consistent key
            if (token) {
                localStorage.setItem("access_token", token);
                // Also save with alternate key for backward compatibility
                localStorage.setItem("authToken", token);
            } else {
                // Otherwise check localStorage with both possible keys
                token = localStorage.getItem("access_token") || localStorage.getItem("authToken");

                // Ensure token is stored with consistent key
                if (token) {
                    localStorage.setItem("access_token", token);
                }
            }

            if (!token) {
                console.error("Authentication token not found in URL or localStorage");
                showError("Authentication token not found. Please log in again.");
                window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || "/auth/login";
                return false;
            }


            let success = false;
            switch (currentStep) {
                case 1:
                    success = await saveBasicInfo();
                    break;
                case 2:
                    success = await saveWorkExperience();
                    break;
                case 3:
                    // For skills step, make sure we have at least one skill
                    if (skills.length === 0) {
                        const skillsContainer = document.getElementById("skills-container");
                        const skillElements = skillsContainer.querySelectorAll(".skill-badge");
                        if (skillElements.length > 0) {
                            // Update skills array from UI
                            skills = [];
                            skillElements.forEach(element => {
                                skills.push(element.textContent.trim());
                            });
                        }
                    }
                    success = await saveSkillsQualifications();
                    break;
                case 4:
                    success = await saveCareerPreferences();
                    break;
                default:
                    console.warn(`Unknown step: ${currentStep}`);
                    return false;
            }

            if (success) {
                return true;
            } else {
                console.error(`Failed to save data for step ${currentStep}`);
                return false;
            }
        } catch (error) {
            console.error(`Error saving step ${currentStep} data:`, error);
            showError(`Error saving data: ${error.message}`);
            return false;
        }
    }

    /**
     * Save basic information to backend API
     * Handles form data collection and API communication
     */
    async function saveBasicInfo() {
        try {
            const formData = new FormData(document.getElementById("basic-info-form"));
            const data = Object.fromEntries(formData.entries());

            // Convert years_experience to integer (0 is valid — do not use truthiness)
            const rawYears = data["years_experience"];
            data.years_experience =
                rawYears === undefined || rawYears === null || rawYears === ""
                    ? NaN
                    : parseInt(String(rawYears), 10);

            // Convert is_student checkbox to boolean
            data.is_student = data.is_student === "on";

            // Ensure all required fields are present (years_experience checked separately — 0 is valid)
            const requiredFields = ["city", "state", "country", "professional_title", "summary"];
            for (const field of requiredFields) {
                if (!data[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }
            if (Number.isNaN(data.years_experience)) {
                throw new Error("Missing required field: years_experience");
            }


            await makeAuthenticatedApiCall("/profile/basic-info", "PUT", data);

            console.log("Basic info saved successfully");
            return true; // Ensure we return true for success
        } catch (error) {
            console.error("Error saving basic info:", error);
            throw new Error(`Failed to save basic information: ${error.message}`);
        }
    }

    /**
     * Save work experience information to backend API
     * Formats data according to API requirements and handles API communication
     */
    async function saveWorkExperience() {
        try {
            const noExpCheckbox = /** @type {HTMLInputElement|null} */ (document.getElementById("no-experience"));
            // If "no experience" is checked, persist [] so the server can mark step 2 complete
            if (noExpCheckbox && noExpCheckbox.checked) {
                workExperience = [];
                await makeAuthenticatedApiCall("/profile/work-experience", "PUT", {
                    work_experience: [],
                });
                return true;
            }

            if (!workExperience || !Array.isArray(workExperience) || workExperience.length === 0) {
                console.error("saveWorkExperience: empty work experience without no-experience option");
                showError(
                    'Please add at least one work experience entry or check "I don\'t have any relevant work experience yet".',
                );
                return false;
            }

            // Create a deep copy of work experience to avoid modifying the original
            const workExperienceToSave = JSON.parse(JSON.stringify(workExperience));

            /**
             * Sanitize text content by removing special characters
             * that may cause validation errors
             */
            function sanitizeText(text) {
                if (!text) return text;

                // Strip ASCII control characters only (preserve all printable ASCII + all Unicode)
                // This keeps •, ■, ▪, ▸, –, — and any other Unicode bullet/symbol characters
                return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
            }
            // Clean and validate each work experience entry to ensure it meets API requirements
            for (let i = 0; i < workExperienceToSave.length; i++) {
                const exp = workExperienceToSave[i];
                // Sanitize description field to avoid validation errors
                if (exp.description) {
                    exp.description = sanitizeText(exp.description);
                }
                // Check required fields
                if (!exp.company || !exp.job_title || !exp.start_date) {
                    console.warn(`Work experience entry ${i+1} is missing required fields:`, exp);
                    // Remove this entry rather than failing the whole save
                    workExperienceToSave.splice(i, 1);
                    i--; // Adjust index since we removed an item
                    continue;
                }

                // Make sure start_date is in YYYY-MM format as required by the API
                if (exp.start_date) {
                    // Convert to YYYY-MM format if not already in that format
                    if (!exp.start_date.match(/^\d{4}-\d{2}$/)) {
                        try {
                            const date = new Date(exp.start_date);
                            if (!isNaN(date.getTime())) {
                                exp.start_date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                            } else {
                                // If date parsing failed, remove this entry
                                console.warn(`Invalid start_date format for entry ${i+1}:`, exp.start_date);
                                workExperienceToSave.splice(i, 1);
                                i--; // Adjust index
                                continue;
                            }
                        } catch (e) {
                            console.warn(`Error formatting start_date for entry ${i+1}:`, e);
                            workExperienceToSave.splice(i, 1);
                            i--; // Adjust index
                            continue;
                        }
                    }
                }

                // Handle end_date for current position and ensure proper format
                if (exp.is_current) {
                    // Clear end_date for current positions as required by API
                    exp.end_date = null;
                } else if (exp.end_date) {
                    // For non-current positions, ensure end_date is in YYYY-MM format
                    if (!exp.end_date.match(/^\d{4}-\d{2}$/)) {
                        try {
                            const date = new Date(exp.end_date);
                            if (!isNaN(date.getTime())) {
                                exp.end_date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                            } else {
                                // If we can't parse the end_date, set to null
                                console.warn(`Invalid end_date format for entry ${i+1}:`, exp.end_date);
                                exp.end_date = null;
                            }
                        } catch (e) {
                            console.warn(`Error formatting end_date for entry ${i+1}:`, e);
                            exp.end_date = null;
                        }
                    }
                }
            }

            // Check if we have any entries left after validation
            if (workExperienceToSave.length === 0) {
                console.warn("All work experience entries were invalid and removed");
                // Return true since an empty array is valid
                const requestData = { work_experience: [] };
                await makeAuthenticatedApiCall("/profile/work-experience", "PUT", requestData);
                return true;
            }


            // Format data according to backend API expectations
            const requestData = { work_experience: workExperienceToSave };

            const response = await makeAuthenticatedApiCall("/profile/work-experience", "PUT", requestData);

            console.log("Work experience saved successfully with", workExperienceToSave.length, "entries");
            return true; // Ensure we return true for success
        } catch (error) {
            console.error("Error saving work experience:", error);
            showError("Failed to save work experience: " + error.message);
            return false; // Return false on error
        }
    }

    async function saveSkillsQualifications() {
        try {

            // Backend expects just "skills" field
            const data = {
                skills: skills
            };

            await makeAuthenticatedApiCall("/profile/skills-qualifications", "PUT", data);

            return true;
        } catch (error) {
            console.error("Error saving skills:", error);
            showError("Failed to save skills: " + error.message);
            return false;
        }
    }

    /**
     * Save career preferences to backend API
     * Maps form values to API enum values and handles API communication
     */
    async function saveCareerPreferences() {
        try {

            // Initialize empty arrays for collections
            let jobTypes = [];
            let companySizes = [];
            let workArrangements = [];
            let travelPreference = "NONE";

            // Maps form values to API enum values
            const jobTypeMapping = {
                "full-time": "FULL_TIME",
                "part-time": "PART_TIME",
                "contract": "CONTRACT",
                "freelance": "FREELANCE",
                "internship": "INTERNSHIP"
            };

            const companySizeMapping = {
                "startup": "STARTUP",
                "small": "SMALL", 
                "medium": "MEDIUM",
                "large": "LARGE",
                "enterprise": "ENTERPRISE"
            };

            const workArrangementMapping = {
                "onsite": "ONSITE",
                "remote": "REMOTE",
                "hybrid": "HYBRID"
            };

            // Collect job types
            try {
                const jobTypeElements = document.querySelectorAll('input[id^="job-type-"]:checked');
                if (jobTypeElements && jobTypeElements.length > 0) {
                    jobTypes = Array.from(jobTypeElements)
                        .map(input => {
                            const mappedValue = jobTypeMapping[input.value];
                            return mappedValue || "FULL_TIME";
                        })
                        .filter(Boolean);
                }

                // API requires at least one job type
                if (jobTypes.length === 0) {
                    jobTypes = ["FULL_TIME"];
                }

            } catch (error) {
                console.error("Error mapping job types:", error);
                jobTypes = ["FULL_TIME"];
            }

            // Collect company sizes
            try {
                const companySizeElements = document.querySelectorAll('input[id^="company-size-"]:checked');
                if (companySizeElements && companySizeElements.length > 0) {
                    companySizes = Array.from(companySizeElements)
                        .map(input => {
                            const mappedValue = companySizeMapping[input.value];
                            return mappedValue || "MEDIUM";
                        })
                        .filter(Boolean);
                }

                // API requires at least one company size
                if (companySizes.length === 0) {
                    companySizes = ["MEDIUM"];
                }

            } catch (error) {
                console.error("Error mapping company sizes:", error);
                companySizes = ["MEDIUM"];
            }

            // Collect work arrangements
            try {
                const workArrangementElements = document.querySelectorAll('input[id^="work-arrangement-"]:checked');
                if (workArrangementElements && workArrangementElements.length > 0) {
                    workArrangements = Array.from(workArrangementElements)
                        .map(input => {
                            const mappedValue = workArrangementMapping[input.value];
                            return mappedValue || "REMOTE";
                        })
                        .filter(Boolean);
                }

                // API requires at least one work arrangement
                if (workArrangements.length === 0) {
                    workArrangements = ["REMOTE"];
                }

            } catch (error) {
                console.error("Error mapping work arrangements:", error);
                workArrangements = ["REMOTE"];
            }

            // Get travel preference
            try {
                const travelPreferenceElement = document.querySelector('input[name="travel-preference"]:checked');
                if (travelPreferenceElement && travelPreferenceElement.value) {
                    travelPreference = travelPreferenceElement.value.toUpperCase();
                }
            } catch (error) {
                console.error("Error mapping travel preference:", error);
                travelPreference = "NONE";
            }

            // Get preference flags
            const relocateChecked = document.getElementById('willing-to-relocate')?.checked || false;
            const visaSponsorshipChecked = document.getElementById('requires-visa-sponsorship')?.checked || false;
            const securityClearanceChecked = document.getElementById('has-security-clearance')?.checked || false;

            const minSalaryVal = parseInt(document.getElementById('min-salary')?.value) || 0;
            const maxSalaryVal = parseInt(document.getElementById('max-salary')?.value) || 0;
            const desiredSalaryRange = {};
            if (minSalaryVal > 0) desiredSalaryRange.min = minSalaryVal;
            if (maxSalaryVal > 0) desiredSalaryRange.max = maxSalaryVal;

            const data = {
                job_types: jobTypes,
                desired_company_sizes: companySizes,
                work_arrangements: workArrangements,
                max_travel_preference: travelPreference,
                desired_salary_range: Object.keys(desiredSalaryRange).length > 0 ? desiredSalaryRange : null,
                willing_to_relocate: relocateChecked,
                requires_visa_sponsorship: visaSponsorshipChecked,
                has_security_clearance: securityClearanceChecked
            };


            const response = await makeAuthenticatedApiCall("/profile/career-preferences", "PUT", data);


            if (response && response.message === "Career preferences updated successfully") {
                return true;
            } else {
                console.error("Career preferences API returned unexpected response", response);
                showError("Failed to save career preferences: API validation failed");
                return false;
            }
        } catch (error) {
            console.error("Error saving career preferences:", error);
            showError("Failed to save career preferences: " + error.message);
            return false;
        }
    }
    /**
     * Complete user profile by saving all sections in sequence
     * and redirecting to dashboard upon successful completion
     */
    async function completeProfile() {
        try {
            // Validate ALL steps upfront before making any API calls.
            // Run each validator first — it shows its own error message via showErrorMessage().
            // If it fails, navigate to that step (changeStep no longer clears the error).
            const stepValidations = [
                { step: 1, fn: validateBasicInfo },
                { step: 2, fn: validateWorkExperience },
                { step: 3, fn: validateSkillsQualifications },
                { step: 4, fn: validateCareerPreferences },
            ];

            for (const { step, fn } of stepValidations) {
                if (!fn()) {
                    changeStep(step);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                }
            }

            hideAlerts();
            setLoading(true);

            // Get token from URL or localStorage with consistent approach
            const urlParams = new URLSearchParams(window.location.search);
            let token = urlParams.get('token');


            if (token) {
                // Save token to localStorage for consistent access
                localStorage.setItem("access_token", token);
                // Also save with alternate key for backward compatibility
                localStorage.setItem("authToken", token);
            } else {
                // Get token from localStorage if not in URL
                token = localStorage.getItem("access_token") || localStorage.getItem("authToken");
            }

            if (!token) {
                console.error("No authentication token found");
                showError("Authentication token not found. Please log in again.");
                setLoading(false);
                return;
            }


            // Save basic info first
            try {
                if (validateBasicInfo()) {
                    const basicInfoResult = await saveBasicInfo();
                    if (basicInfoResult) {
                    } else {
                        console.error("Basic info save returned false");
                        showError("Failed to save basic information. Please try again.");
                        setLoading(false);
                        return false;
                    }
                } else {
                    console.error("Basic info validation failed");
                    showError("Please complete all required basic information fields before proceeding.");
                    setLoading(false);
                    return false;
                }
            } catch (error) {
                console.error("Error saving basic info:", error);
                showError("Error saving basic information: " + (error.message || "Unknown error"));
                setLoading(false);
                return false;
            }

            // Save work experience
            try {
                if (validateWorkExperience()) {
                    const workExpResult = await saveWorkExperience();
                    if (workExpResult) {
                    } else {
                        console.error("Work experience save returned false");
                        showError("Failed to save work experience. Please try again.");
                        setLoading(false);
                        return false;
                    }
                } else {
                    console.error("Work experience validation failed");
                    showError("Please add at least one work experience entry or check the 'I don't have any relevant work experience yet' box.");
                    setLoading(false);
                    return false;
                }
            } catch (error) {
                console.error("Error saving work experience:", error);
                showError("Error saving work experience: " + (error.message || "Unknown error"));
                setLoading(false);
                return false;
            }

            // Save skills
            try {
                // Make sure skills array is populated from UI if empty
                if (skills.length === 0) {
                    const skillsContainer = document.getElementById("skills-container");
                    if (skillsContainer) {
                        const skillElements = skillsContainer.querySelectorAll(".skill-badge");
                        if (skillElements.length > 0) {
                            skillElements.forEach(element => {
                                const skillText = element.textContent.trim().replace("×", "").trim();
                                if (skillText && !skills.includes(skillText)) {
                                    skills.push(skillText);
                                }
                            });
                        }
                    }
                }

                if (validateSkillsQualifications()) {
                    const skillsResult = await saveSkillsQualifications();
                    if (skillsResult) {
                    } else {
                        console.error("Skills save returned false");
                        showError("Failed to save skills. Please try again.");
                        setLoading(false);
                        return false;
                    }
                } else {
                    console.error("Skills validation failed");
                    showError("Please add at least one skill before proceeding.");
                    setLoading(false);
                    return false;
                }
            } catch (error) {
                console.error("Error saving skills:", error);
                showError("Error saving skills: " + (error.message || "Unknown error"));
                setLoading(false);
                return false;
            }

            // Step 4: Save Career Preferences
            try {
                if (validateCareerPreferences()) {
                    await saveCareerPreferences();
                } else {
                    console.error("Career preferences validation failed");
                    showError("Please complete all required career preference fields before proceeding.");
                    setLoading(false);
                    return false; // Stop the profile completion process if validation fails
                }
            } catch (error) {
                console.error("Failed to save career preferences:", error);
                showError("Error saving career preferences: " + (error.message || "Unknown error"));
                setLoading(false);
                return false; // Stop the profile completion process if saving fails
            }

            // All sections have been successfully saved, mark profile as complete

            try {
                // Make API call to mark profile as complete
                const token = getAuthToken();
                const completeResponse = await fetch(`${API_BASE}/profile/complete`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    }
                });

                if (!completeResponse.ok) {
                    const errorData = await completeResponse.json().catch(() => ({}));
                    throw new Error(errorData.message || errorData.detail || `Server error: ${completeResponse.status}`);
                }

                // Set profile completed flag in localStorage
                localStorage.setItem("profile_completed", "true");

                // Show success message
                showSuccess("Profile completed successfully! Redirecting to dashboard...");

                // Redirect to dashboard — token is already in localStorage.
                // Use a short delay so the success message is visible before navigation.
                const successEl = document.getElementById('success-alert');
                if (successEl && typeof successEl.ontransitionend !== 'undefined') {
                    successEl.addEventListener('transitionend', () => { window.location.href = '/dashboard'; }, { once: true });
                    // Fallback in case transitionend never fires
                    setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
                } else {
                    setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
                }
            } catch (error) {
                console.error("Error marking profile as complete:", error);
                showError("Error completing profile: " + (error.message || "Unknown error"));
                setLoading(false);
                return false;
            }
        } catch (error) {
            console.error("Error completing profile:", error);
            showError("Failed to complete profile: " + error.message);
        } finally {
            setLoading(false);
        }
    }

    // Function to check if we need to show the preferences step
    function checkPreferencesStep() {
        // If we're on step 4, make sure the complete button is visible
        if (currentStep === totalSteps) {
            nextBtn.style.display = "none";
            completeBtn.style.display = "inline-block";
        }
    }

    // Duplicate function removed - using the more complete version above

    // Skills management
    function addSkill(skill) {
        if (skill && !skills.includes(skill)) {
            skills.push(skill);
            renderSkills();
        }
    }

    function removeSkill(skill) {
        skills = skills.filter((s) => s !== skill);
        renderSkills();
    }

    function renderSkills() {
        const container = skillsContainer || document.getElementById("skills-container");
        container.innerHTML = "";

        skills.forEach((skill) => {
            const tag = document.createElement("div");
            tag.className = "skill-tag";
            const span = document.createElement("span");
            span.textContent = skill;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "skill-remove";
            btn.setAttribute("aria-label", `Remove skill: ${skill}`);
            btn.innerHTML = '<i class="fas fa-times"></i>';
            btn.addEventListener("click", () => removeSkill(skill));
            tag.appendChild(span);
            tag.appendChild(btn);
            container.appendChild(tag);
        });
    }



    // Work experience management
    function addWorkExperience() {
        workExperience.push({
            company: "",
            job_title: "",
            start_date: "",
            end_date: "",
            description: "",
            is_current: false,
        });
        renderWorkExperience();
    }

    function removeWorkExperience(index) {
        workExperience.splice(index, 1);
        renderWorkExperience();
    }

    function renderWorkExperience() {
        const container = experienceContainer || document.getElementById("experience-container");
        container.innerHTML = "";

        workExperience.forEach((exp, index) => {
            const div = document.createElement("div");
            div.className = "experience-item";

            /**
             * Create a labeled form-floating input row.
             * @param {string} type
             * @param {string} initialValue
             * @param {string} labelText
             * @param {string} field
             * @param {boolean} [disabled]
             * @returns {HTMLDivElement}
             */
            function makeFloatingInput(type, initialValue, labelText, field, disabled = false) {
                const wrapper = document.createElement("div");
                wrapper.className = "form-floating mb-3";
                const input = document.createElement("input");
                input.type = type;
                input.className = "form-control";
                input.placeholder = " ";
                input.value = initialValue;
                if (disabled) input.disabled = true;
                if (type !== "month") input.required = true;
                input.addEventListener("change", function () {
                    updateWorkExperience(index, field, this.value);
                });
                const label = document.createElement("label");
                label.textContent = labelText;
                wrapper.appendChild(input);
                wrapper.appendChild(label);
                return wrapper;
            }

            // Row 1: company | job title | trash button
            const row1 = document.createElement("div");
            row1.className = "row align-items-center";
            const col1 = document.createElement("div"); col1.className = "col";
            col1.appendChild(makeFloatingInput("text", exp.company, "Company Name *", "company"));
            const col2 = document.createElement("div"); col2.className = "col";
            col2.appendChild(makeFloatingInput("text", exp.job_title, "Job Title *", "job_title"));
            const colTrash = document.createElement("div"); colTrash.className = "col-auto mb-3";
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "remove-experience";
            removeBtn.setAttribute("aria-label", `Remove experience ${index + 1}`);
            removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
            removeBtn.addEventListener("click", () => removeWorkExperience(index));
            colTrash.appendChild(removeBtn);
            row1.appendChild(col1); row1.appendChild(col2); row1.appendChild(colTrash);
            div.appendChild(row1);

            const row2 = document.createElement("div");
            row2.className = "row";
            const colStart = document.createElement("div"); colStart.className = "col-md-4";
            colStart.appendChild(makeFloatingInput("month", exp.start_date, "Start Date *", "start_date"));
            const colEnd = document.createElement("div"); colEnd.className = "col-md-4";
            const endInput = makeFloatingInput("month", exp.end_date || "", "End Date", "end_date", !!exp.is_current);
            colEnd.appendChild(endInput);
            const colCurrent = document.createElement("div"); colCurrent.className = "col-md-4";
            if (index === 0) {
                const checkWrapper = document.createElement("div"); checkWrapper.className = "form-check mt-3";
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox"; checkbox.className = "form-check-input"; checkbox.checked = !!exp.is_current;
                checkbox.addEventListener("change", function () {
                    updateWorkExperience(index, "is_current", this.checked);
                });
                const checkLabel = document.createElement("label"); checkLabel.className = "form-check-label";
                checkLabel.textContent = "Currently work here";
                checkWrapper.appendChild(checkbox); checkWrapper.appendChild(checkLabel);
                colCurrent.appendChild(checkWrapper);
            } else if (exp.is_current) {
                workExperience[index]["is_current"] = false;
                workExperience[index]["end_date"] = workExperience[index]["end_date"] || "";
            }
            row2.appendChild(colStart); row2.appendChild(colEnd); row2.appendChild(colCurrent);
            div.appendChild(row2);

            const descWrapper = document.createElement("div"); descWrapper.className = "form-floating";
            const textarea = document.createElement("textarea");
            textarea.className = "form-control"; textarea.style.height = "150px"; textarea.style.minHeight = "150px";
            textarea.placeholder = " ";
            textarea.textContent = exp.description || "";
            textarea.addEventListener("change", function () {
                updateWorkExperience(index, "description", this.value);
            });
            const descLabel = document.createElement("label"); descLabel.textContent = "Job Description";
            descWrapper.appendChild(textarea); descWrapper.appendChild(descLabel);
            div.appendChild(descWrapper);

            container.appendChild(div);
        });
    }

    function updateWorkExperience(index, field, value) {
        workExperience[index][field] = value;

        if (field === "is_current") {
            if (value) {
                workExperience[index]["end_date"] = "";
            }
            renderWorkExperience(); // Re-render to update disabled state
        }
    }

    // File upload functionality removed - no longer needed in 4-step profile setup

    // Completion summary
    function updateCompletionSummary() {
        const container = document.getElementById("completion-items");

        // Check if container exists before manipulating it
        if (!container) {
            return;
        }

        container.innerHTML = "";

        const items = [
            {
                name: "Basic Information",
                completed: validateBasicInfo(),
            },
            {
                name: "Work Experience",
                completed: workExperience.length > 0,
            },
            { 
                name: "Skills", 
                completed: skills.length >= VALIDATION_RULES.MIN_SKILLS,
            },
            {
                name: "Career Preferences",
                completed: validateCareerPreferences(),
            },
        ];

        items.forEach((item) => {
            const div = document.createElement("div");
            div.className = "completion-item";
            div.innerHTML = `
            <span>${escapeHtml(item.name)}</span>
            <span class="completion-status">
                ${item.completed ? '<i class="fas fa-check text-success"></i> Complete' : '<i class="fas fa-times text-danger"></i> Incomplete'}
            </span>
        `;
            container.appendChild(div);
        });
    }

    // Utility functions
    function showError(message) {
        showErrorMessage(message);
        successAlert?.classList.add("d-none");
    }

    function showSuccess(message) {
        if (successMessage) successMessage.textContent = message;
        successAlert?.classList.remove("d-none");
        errorAlert?.classList.add("d-none");
    }

    function hideAlerts() {
        if (errorAlert) {
            errorAlert.classList.add("d-none");
        }
        if (successAlert) {
            successAlert.classList.add("d-none");
        }
    }

    function setLoading(loading) {
        if (nextBtn) {
            nextBtn.disabled = loading;
            if (loading) {
                nextBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Processing...';
            } else {
                nextBtn.innerHTML = 'Next<i class="fas fa-arrow-right ms-2"></i>';
            }
        }

        if (completeBtn) {
            completeBtn.disabled = loading;
            if (loading) {
                completeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Completing...';
            } else {
                completeBtn.innerHTML = 'Complete Profile<i class="fas fa-check ms-2"></i>';
            }
        }
    }

    function logout() {
        // @ts-ignore
        if (window.app && typeof window.app.logout === 'function') { window.app.logout(); return; }
        localStorage.removeItem('access_token');
        localStorage.removeItem('authToken');
        window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login';
    }

    // Make functions globally available
    window.removeSkill = removeSkill;
    window.removeWorkExperience = removeWorkExperience;
    window.updateWorkExperience = updateWorkExperience;

    // ---- Public API: functions accessible from inline HTML handlers ----
    window.logout = logout;

}());
