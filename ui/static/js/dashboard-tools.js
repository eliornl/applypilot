(function () {
    'use strict';

    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '/api/v1';

    /** @param {string|null|undefined} str */
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

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
        if (container) container.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert"><i class="fas fa-${type === 'success' ? 'check-circle' : type === 'danger' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>${escapeHtml(message)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`;
    }

    document.addEventListener('DOMContentLoaded', function () {
        checkAuthentication();

        // Live character counters for Job Comparison detail textareas
        ['job1Description', 'job2Description', 'job3Description'].forEach(id => {
            const ta = /** @type {HTMLTextAreaElement|null} */ (document.getElementById(id));
            const counter = document.getElementById(id.replace('Description', 'DescCount'));
            if (!ta || !counter) return;
            ta.addEventListener('input', () => {
                const len = ta.value.length;
                counter.textContent = len.toLocaleString();
                const wrap = /** @type {HTMLElement|null} */ (counter.parentElement);
                if (!wrap) return;
                wrap.classList.toggle('char-near-limit', len >= 4000 && len < 5000);
                wrap.classList.toggle('char-at-limit',   len >= 5000);
            });
        });

        document.getElementById('thankYouForm')?.addEventListener('submit', handleThankYouSubmit);
        document.getElementById('rejectionForm')?.addEventListener('submit', handleRejectionSubmit);
        document.getElementById('referenceForm')?.addEventListener('submit', handleReferenceSubmit);
        document.getElementById('comparisonForm')?.addEventListener('submit', handleComparisonSubmit);
        document.getElementById('followupForm')?.addEventListener('submit', handleFollowupSubmit);
        document.getElementById('salaryForm')?.addEventListener('submit', handleSalarySubmit);

        // Delegated handler for tool nav tabs (replaces inline onclick="showTool('...')")
        document.querySelector('.tools-nav')?.addEventListener('click', function (e) {
            const link = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('a[data-tool]'));
            if (!link) return;
            e.preventDefault();
            showTool(link.dataset['tool'] ?? '', /** @type {MouseEvent} */ (e));
        });

        // Delegated handler for copy buttons and action buttons (replaces inline onclick)
        document.querySelector('.tools-content')?.addEventListener('click', function (e) {
            const el = /** @type {HTMLElement} */ (e.target);

            const copyBtn = el.closest('[data-copy]');
            if (copyBtn) {
                e.preventDefault();
                copyToClipboard(/** @type {HTMLElement} */ (copyBtn).dataset['copy'] ?? '');
                return;
            }

            const actionBtn = /** @type {HTMLElement|null} */ (el.closest('[data-action]'));
            if (actionBtn) {
                const action = actionBtn.dataset['action'];
                if (action === 'toggleJob3')          { e.preventDefault(); toggleJob3(); }
                if (action === 'copyAllScripts')      { e.preventDefault(); copyAllScripts(); }
                if (action === 'copyFollowupEmail')   { e.preventDefault(); copyFollowupEmail(); }
                if (action === 'copyThankYouNote')    { e.preventDefault(); copyThankYouNote(); }
                if (action === 'copyFollowUpTemplate') { e.preventDefault(); copyFollowUpTemplate(); }
                if (action === 'copyReferenceEmail')   { e.preventDefault(); copyReferenceEmail(); }
            }
        });
    });

    function checkAuthentication() {
        // @ts-ignore
        const authenticated = window.app ? window.app.isAuthenticated() : !!(localStorage.getItem('access_token') || localStorage.getItem('authToken'));
        if (!authenticated) { window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login'; return; }
        if (localStorage.getItem('profile_completed') !== 'true') { window.location.href = '/profile/setup'; }
    }

    function getAuthToken() {
        // @ts-ignore
        return (window.app && typeof window.app.getAuthToken === 'function')
            ? window.app.getAuthToken()
            : (localStorage.getItem('access_token') || localStorage.getItem('authToken'));
    }

    /** In-flight guard: prevents duplicate concurrent tool API calls */
    let _toolSubmitting = false;

    /**
     * @param {string} toolName
     * @param {MouseEvent} [evt]
     */
    function showTool(toolName, evt) {
        document.querySelectorAll('.tool-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.getElementById(toolName + 'Section')?.classList.add('active');
        /** @type {Element|null} */ (evt?.target ?? null)?.closest('.nav-link')?.classList.add('active');
        // Clear any lingering success/error notifications from the previous tab
        const alertContainer = document.getElementById('alertContainer');
        if (alertContainer) alertContainer.innerHTML = '';
    }

    /** @param {string} [text] */
    function showLoading(text = 'Generating...') {
        const el = document.getElementById('loadingText');
        if (el) el.textContent = text;
        document.getElementById('loadingOverlay')?.classList.add('show');
    }

    function hideLoading() {
        document.getElementById('loadingOverlay')?.classList.remove('show');
    }

    /**
     * @param {string} message
     * @param {string} type
     */
    function showAlert(message, type) { notify(message, type); }

    /**
     * Robust clipboard write — tries navigator.clipboard first, falls back to execCommand.
     * @param {string} text
     * @param {string} [successMsg]
     */
    function _clipboardWrite(text, successMsg) {
        successMsg = successMsg || 'Copied to clipboard!';
        // @ts-ignore
        const app = window.app;
        if (app && typeof app.copyToClipboard === 'function') { app.copyToClipboard(text); notify(successMsg, 'success'); return; }

        const doFallback = () => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            try {
                document.execCommand('copy');
                notify(successMsg || 'Copied!', 'success');
            } catch (e) {
                notify('Copy failed — please select and copy manually.', 'danger');
            }
            document.body.removeChild(ta);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text)
                .then(() => notify(successMsg || 'Copied!', 'success'))
                .catch(doFallback);
        } else {
            doFallback();
        }
    }

    /** @param {string} elementId */
    function copyToClipboard(elementId) {
        const el = /** @type {HTMLElement|null} */ (document.getElementById(elementId));
        _clipboardWrite(el?.textContent ?? el?.innerText ?? '', 'Copied to clipboard!');
    }

    // =============================================================================
    // HELPER: getValue from input by id
    // =============================================================================

    /** @param {string} id */
    const getVal = (id) => /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|null} */ (document.getElementById(id))?.value ?? '';

    // =============================================================================
    // THANK YOU NOTE
    // =============================================================================

    /** @param {Event} event */
    async function handleThankYouSubmit(event) {
        event.preventDefault();
        if (_toolSubmitting) return;
        _toolSubmitting = true;
        showLoading('Generating thank you note...');
        const rawPoints = getVal('discussionPoints');
        const payload = {
            interviewer_name:      getVal('interviewerName'),
            interviewer_role:      getVal('interviewerRole') || null,
            interview_type:        getVal('interviewType'),
            company_name:          getVal('companyName'),
            job_title:             getVal('jobTitle'),
            key_discussion_points: rawPoints ? rawPoints.split(',').map(p => p.trim()).filter(p => p) : null,
            additional_notes:      getVal('additionalNotes') || null
        };
        try {
            const response = await fetch(`${API_BASE}/tools/thank-you`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                displayThankYouResult(await response.json()); showAlert('Thank you note generated successfully!', 'success');
            } else if (response.status === 429) {
                showAlert('Rate limit exceeded. Please wait before trying again.', 'warning');
            } else {
                const errData = await response.json();
                showAlert(errData.message || errData.detail || 'Failed to generate thank you note', response.status === 400 ? 'warning' : 'danger');
            }
        } catch (error) {
            console.error('Error:', error); showAlert('Failed to generate thank you note. Please try again.', 'danger');
        } finally { hideLoading(); _toolSubmitting = false; }
    }

    /** @param {Record<string,unknown>} data */
    function displayThankYouResult(data) {
        const subjEl = document.getElementById('thankYouSubject');
        if (subjEl) subjEl.innerHTML = `<div class="followup-subject">${escapeHtml(String(data['subject_line'] ?? ''))}</div>`;

        const bodyEl = document.getElementById('thankYouEmailBody');
        if (bodyEl) bodyEl.innerHTML = `<div class="followup-body">${escapeHtml(String(data['email_body'] ?? ''))}</div>`;

        const out = document.getElementById('thankYouOutput');
        if (out) { out.style.display = 'block'; out.scrollIntoView({ behavior: 'smooth' }); }
    }

    function copyThankYouNote() {
        const subjectText = (document.getElementById('thankYouSubject')?.textContent ?? '').trim();
        const bodyText    = (document.getElementById('thankYouEmailBody')?.textContent ?? '').trim();
        const parts = [];
        if (subjectText) parts.push(`Subject: ${subjectText}`);
        if (bodyText)    parts.push(bodyText);
        _clipboardWrite(parts.join('\n\n'), 'Email copied to clipboard!');
    }

    // =============================================================================
    // REJECTION ANALYSIS
    // =============================================================================

    /** @param {Event} event */
    async function handleRejectionSubmit(event) {
        event.preventDefault();
        if (_toolSubmitting) return;
        _toolSubmitting = true;
        showLoading('Analyzing rejection...');
        const payload = {
            rejection_email:  getVal('rejectionEmail'),
            job_title:        getVal('rejectionJobTitle')  || null,
            company_name:     getVal('rejectionCompany')   || null,
            interview_stage:  getVal('interviewStage')     || null
        };
        try {
            const response = await fetch(`${API_BASE}/tools/rejection-analysis`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                displayRejectionResult(await response.json()); showAlert('Analysis complete!', 'success');
            } else if (response.status === 429) {
                showAlert('Rate limit exceeded. Please wait before trying again.', 'warning');
            } else {
                const errData = await response.json();
                showAlert(errData.message || errData.detail || 'Failed to analyze rejection', response.status === 400 ? 'warning' : 'danger');
            }
        } catch (error) {
            console.error('Error:', error); showAlert('Failed to analyze rejection. Please try again.', 'danger');
        } finally { hideLoading(); _toolSubmitting = false; }
    }

    /** @param {Record<string,unknown>} data */
    function displayRejectionResult(data) {
        // Summary
        const summaryEl = document.getElementById('rejectionSummary');
        if (summaryEl) summaryEl.innerHTML = `<div class="rejection-summary">${escapeHtml(String(data['analysis_summary'] ?? ''))}</div>`;

        // Likely Reasons
        const reasonsEl = document.getElementById('likelyReasons');
        if (reasonsEl) reasonsEl.innerHTML = (/** @type {string[]} */ (data['likely_reasons'] ?? [])).map(r =>
            `<div class="rejection-item"><div class="rejection-item-icon"><i class="fas fa-angle-right"></i></div><span>${escapeHtml(String(r))}</span></div>`
        ).join('');

        // Improvement Suggestions
        const suggestEl = document.getElementById('improvementSuggestions');
        if (suggestEl) suggestEl.innerHTML = (/** @type {string[]} */ (data['improvement_suggestions'] ?? [])).map(s =>
            `<div class="rejection-item"><div class="rejection-item-icon"><i class="fas fa-check"></i></div><span>${escapeHtml(String(s))}</span></div>`
        ).join('');

        // Positive Signals
        const posDiv = document.getElementById('positiveSignals');
        if (posDiv) {
            const signals = /** @type {string[]} */ (data['positive_signals'] ?? []);
            posDiv.innerHTML = signals.length > 0
                ? signals.map(s => `<div class="rejection-positive-card"><i class="fas fa-star"></i><span>${escapeHtml(String(s))}</span></div>`).join('')
                : '<span style="color:var(--text-muted);font-size:0.875rem;">No specific positive signals identified.</span>';
        }

        // Follow-up Email
        const followUpSection = document.getElementById('followUpSection');
        if (followUpSection) {
            if (data['follow_up_recommended'] && (data['follow_up_body'] || data['follow_up_subject'])) {
                const subjEl = document.getElementById('followUpSubject');
                if (subjEl) subjEl.innerHTML = `<div class="followup-subject">${escapeHtml(String(data['follow_up_subject'] ?? ''))}</div>`;
                const tmplEl = document.getElementById('followUpTemplate');
                if (tmplEl) tmplEl.innerHTML = `<div class="followup-body">${escapeHtml(String(data['follow_up_body'] ?? ''))}</div>`;
                followUpSection.style.display = 'block';
            } else {
                followUpSection.style.display = 'none';
            }
        }

        // Encouragement
        const encourageEl = document.getElementById('encouragementText');
        if (encourageEl) encourageEl.textContent = String(data['encouragement'] ?? '');

        const out = document.getElementById('rejectionOutput');
        if (out) { out.style.display = 'block'; out.scrollIntoView({ behavior: 'smooth' }); }
    }

    function copyFollowUpTemplate() {
        const subjectText = (document.getElementById('followUpSubject')?.textContent ?? '').trim();
        const bodyText    = (document.getElementById('followUpTemplate')?.textContent ?? '').trim();
        const parts = [];
        if (subjectText) parts.push(`Subject: ${subjectText}`);
        if (bodyText)    parts.push(bodyText);
        _clipboardWrite(parts.join('\n\n'), 'Email copied to clipboard!');
    }

    // =============================================================================
    // REFERENCE REQUEST
    // =============================================================================

    /** @param {Event} event */
    async function handleReferenceSubmit(event) {
        event.preventDefault();
        if (_toolSubmitting) return;
        _toolSubmitting = true;
        showLoading('Generating reference request...');
        const raw = getVal('keyAccomplishments');
        const payload = {
            reference_name:         getVal('referenceName'),
            reference_relationship: getVal('referenceRelationship'),
            target_job_title:       getVal('targetJobTitle')    || null,
            target_company:         getVal('targetCompany')     || null,
            key_accomplishments:    raw ? raw.split(',').map(a => a.trim()).filter(a => a) : null,
            time_since_contact:     getVal('timeSinceContact')  || null
        };
        try {
            const response = await fetch(`${API_BASE}/tools/reference-request`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                displayReferenceResult(await response.json()); showAlert('Reference request generated successfully!', 'success');
            } else if (response.status === 429) {
                showAlert('Rate limit exceeded. Please wait before trying again.', 'warning');
            } else {
                const errData = await response.json();
                showAlert(errData.message || errData.detail || 'Failed to generate reference request', response.status === 400 ? 'warning' : 'danger');
            }
        } catch (error) {
            console.error('Error:', error); showAlert('Failed to generate reference request. Please try again.', 'danger');
        } finally { hideLoading(); _toolSubmitting = false; }
    }

    /** @param {Record<string,unknown>} data */
    function displayReferenceResult(data) {
        const subjEl = document.getElementById('referenceSubject');
        if (subjEl) subjEl.innerHTML = `<div class="followup-subject">${escapeHtml(String(data['subject_line'] ?? ''))}</div>`;

        const bodyEl = document.getElementById('referenceEmailBody');
        if (bodyEl) bodyEl.innerHTML = `<div class="followup-body">${escapeHtml(String(data['email_body'] ?? ''))}</div>`;

        const tpEl = document.getElementById('talkingPoints');
        if (tpEl) tpEl.innerHTML = (/** @type {string[]} */ (data['talking_points'] ?? [])).map(p =>
            `<div class="rejection-item"><div class="rejection-item-icon"><i class="fas fa-comment"></i></div><span>${escapeHtml(String(p))}</span></div>`
        ).join('');

        const tipsEl = document.getElementById('referenceTips');
        if (tipsEl) tipsEl.innerHTML = (/** @type {string[]} */ (data['tips'] ?? [])).map(t =>
            `<div class="rejection-item"><div class="rejection-item-icon"><i class="fas fa-lightbulb"></i></div><span>${escapeHtml(String(t))}</span></div>`
        ).join('');

        const timeEl = document.getElementById('followUpTimeline');
        if (timeEl) timeEl.textContent = String(data['follow_up_timeline'] ?? '');

        const out = document.getElementById('referenceOutput');
        if (out) { out.style.display = 'block'; out.scrollIntoView({ behavior: 'smooth' }); }
    }

    function copyReferenceEmail() {
        const subjectText = (document.getElementById('referenceSubject')?.textContent ?? '').trim();
        const bodyText    = (document.getElementById('referenceEmailBody')?.textContent ?? '').trim();
        const parts = [];
        if (subjectText) parts.push(`Subject: ${subjectText}`);
        if (bodyText)    parts.push(bodyText);
        _clipboardWrite(parts.join('\n\n'), 'Email copied to clipboard!');
    }

    // =============================================================================
    // JOB COMPARISON
    // =============================================================================

    let job3Visible = false;

    function toggleJob3() {
        job3Visible = !job3Visible;
        const body     = /** @type {HTMLElement|null} */ (document.getElementById('job3Body'));
        const icon     = document.getElementById('job3ToggleIcon');
        const text     = document.getElementById('job3ToggleText');
        if (body) body.style.display = job3Visible ? 'block' : 'none';
        if (icon) icon.className = job3Visible ? 'fas fa-minus me-1' : 'fas fa-plus me-1';
        if (text) text.textContent = job3Visible ? 'Remove' : 'Add';
    }

    /** @param {Event} event */
    async function handleComparisonSubmit(event) {
        event.preventDefault();
        if (_toolSubmitting) return;
        _toolSubmitting = true;
        showLoading('Comparing jobs...');
        const jobs = [
            { title: getVal('job1Title'), company: getVal('job1Company'), description: getVal('job1Description') || null },
            { title: getVal('job2Title'), company: getVal('job2Company'), description: getVal('job2Description') || null }
        ];
        if (job3Visible && getVal('job3Title') && getVal('job3Company')) {
            jobs.push({ title: getVal('job3Title'), company: getVal('job3Company'), description: getVal('job3Description') || null });
        }
        const payload = { jobs, user_context: { priorities: getVal('userPriorities') || null } };
        try {
            const response = await fetch(`${API_BASE}/tools/job-comparison`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                displayComparisonResult(await response.json()); showAlert('Job comparison complete!', 'success');
            } else if (response.status === 429) {
                showAlert('Rate limit exceeded. Please wait before trying again.', 'warning');
            } else {
                const errData = await response.json();
                showAlert(errData.message || errData.detail || 'Failed to compare jobs', response.status === 400 ? 'warning' : 'danger');
            }
        } catch (error) {
            console.error('Error:', error); showAlert('Failed to compare jobs. Please try again.', 'danger');
        } finally { hideLoading(); _toolSubmitting = false; }
    }

    /** @param {Record<string,unknown>} data */
    function displayComparisonResult(data) {
        // Recommendation summary card
        const sumEl = document.getElementById('comparisonSummary');
        if (sumEl) {
            const conf = String(data['recommendation_confidence'] ?? '').toLowerCase();
            const confClass = conf === 'high' ? 'high' : conf === 'low' ? 'low' : 'medium';
            sumEl.innerHTML = `
                <div class="comp-recommendation-card">
                    <div class="comp-recommendation-label">Recommendation</div>
                    <div class="comp-recommendation-value">
                        ${escapeHtml(String(data['recommended_job'] ?? ''))}
                        <span class="comp-confidence-badge comp-confidence-badge--${escapeHtml(confClass)}">${escapeHtml(confClass)} confidence</span>
                    </div>
                    <div class="comp-recommendation-text">${escapeHtml(String(data['executive_summary'] ?? ''))}</div>
                </div>`;
        }

        // Job cards
        const jobsEl = document.getElementById('jobCards');
        if (jobsEl) {
            const jobs = /** @type {Record<string,unknown>[]} */ (data['jobs_analysis'] ?? []);
            jobsEl.innerHTML = jobs.map(job => {
                const isRec = job['job_identifier'] === data['recommended_job'];
                const title   = String(job['title']   ?? '');
                const company = String(job['company'] ?? '');
                const pros    = /** @type {string[]} */ (job['pros'] ?? []);
                const cons    = /** @type {string[]} */ (job['cons'] ?? []);
                const idealFor = String(job['ideal_for'] ?? '');
                const score = escapeHtml(String(job['overall_score'] ?? ''));
                return `
                <div class="comp-job-card${isRec ? ' comp-job-card--recommended' : ''}">
                    <div class="comp-job-body">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.75rem;">
                            <div class="comp-job-title-text" style="margin:0;">${escapeHtml(title)} <span style="font-weight:400;font-size:0.82rem;color:var(--text-muted);">(${escapeHtml(company)})</span></div>
                            <span class="comp-job-score-badge" style="flex-shrink:0;">${score}/100</span>
                        </div>
                        <div class="comp-pros-header"><i class="fas fa-plus"></i> Pros</div>
                        <ul class="comp-job-list">${pros.map(p => `<li>${escapeHtml(String(p))}</li>`).join('')}</ul>
                        <div class="comp-cons-header"><i class="fas fa-minus"></i> Cons</div>
                        <ul class="comp-job-list">${cons.map(c => `<li>${escapeHtml(String(c))}</li>`).join('')}</ul>
                        ${idealFor ? `<div class="comp-ideal-for">Ideal for: ${escapeHtml(idealFor)}</div>` : ''}
                    </div>
                </div>`;
            }).join('');
        }

        // Decision factors
        const dfEl = document.getElementById('decisionFactors');
        if (dfEl) {
            const factors = /** @type {Record<string,string>[]} */ (data['decision_factors'] ?? []);
            dfEl.innerHTML = factors.length > 0
                ? factors.map(f => {
                    const imp = (f['importance'] ?? '').toLowerCase();
                    const impClass = imp === 'high' ? 'high' : imp === 'low' ? 'low' : 'medium';
                    return `<div class="decision-factor-row">
                        <div class="decision-factor-left">
                            <span class="decision-factor-name">${escapeHtml(String(f['factor'] ?? ''))}</span>
                            <span class="decision-factor-winner">${escapeHtml(String(f['winner'] ?? ''))}</span>
                            <span class="decision-factor-importance decision-factor-importance--${escapeHtml(impClass)}">${escapeHtml(imp)}</span>
                        </div>
                        <div class="decision-factor-explanation">${escapeHtml(String(f['explanation'] ?? ''))}</div>
                    </div>`;
                }).join('')
                : '<span style="color:var(--text-muted);font-size:0.875rem;">No decision factors available.</span>';
        }

        // Questions to ask
        const qEl = document.getElementById('questionsToAsk');
        if (qEl) qEl.innerHTML = (/** @type {string[]} */ (data['questions_to_ask'] ?? [])).map(q =>
            `<div class="rejection-item"><div class="rejection-item-icon"><i class="fas fa-question-circle"></i></div><span>${escapeHtml(String(q))}</span></div>`
        ).join('');

        // Final advice
        const advEl = document.getElementById('comparisonAdvice');
        if (advEl) advEl.textContent = String(data['final_advice'] ?? '');

        const out = document.getElementById('comparisonOutput');
        if (out) { out.style.display = 'block'; out.scrollIntoView({ behavior: 'smooth' }); }
    }

    // =============================================================================
    // FOLLOW-UP GENERATOR
    // =============================================================================

    /** @param {Event} event */
    async function handleFollowupSubmit(event) {
        event.preventDefault();
        if (_toolSubmitting) return;
        _toolSubmitting = true;
        showLoading('Generating follow-up email...');
        const rawPoints = getVal('followupKeyPoints');
        const daysVal   = getVal('followupDays');
        const payload = {
            stage:            getVal('followupStage'),
            company_name:     getVal('followupCompany'),
            job_title:        getVal('followupJobTitle'),
            contact_name:     getVal('followupContactName') || null,
            days_since_contact: daysVal ? parseInt(daysVal, 10) : null,
            key_points:       rawPoints ? rawPoints.split(',').map(p => p.trim()).filter(p => p) : null
        };
        try {
            const response = await fetch(`${API_BASE}/tools/followup`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                displayFollowupResult(await response.json()); showAlert('Follow-up email generated!', 'success');
            } else if (response.status === 429) {
                showAlert('Rate limit exceeded. Please wait before trying again.', 'warning');
            } else {
                const errData = await response.json();
                showAlert(errData.message || errData.detail || 'Failed to generate follow-up', response.status === 400 ? 'warning' : 'danger');
            }
        } catch (error) {
            console.error('Error:', error); showAlert('Failed to generate follow-up email. Please try again.', 'danger');
        } finally { hideLoading(); _toolSubmitting = false; }
    }

    /** @param {Record<string,unknown>} data */
    function displayFollowupResult(data) {
        const subjEl = document.getElementById('followupSubject');
        if (subjEl) subjEl.innerHTML = `<div class="followup-subject">${escapeHtml(String(data['subject_line'] ?? ''))}</div>`;

        const bodyEl = document.getElementById('followupEmailBody');
        if (bodyEl) bodyEl.innerHTML = `<div class="followup-body">${escapeHtml(String(data['email_body'] ?? ''))}</div>`;

        const setText = /** @param {string} id @param {unknown} val */ (id, val) => {
            const el = document.getElementById(id); if (el) el.textContent = String(val ?? '');
        };
        setText('followupTimingAdvice', data['timing_advice']);
        setText('followupNextSteps',    data['next_steps']);

        const out = document.getElementById('followupOutput');
        if (out) { out.style.display = 'block'; out.scrollIntoView({ behavior: 'smooth' }); }
    }

    // =============================================================================
    // SALARY COACH
    // =============================================================================

    /** @param {Event} event */
    async function handleSalarySubmit(event) {
        event.preventDefault();
        if (_toolSubmitting) return;
        _toolSubmitting = true;
        showLoading('Generating negotiation strategy...');
        const payload = {
            job_title:          getVal('salaryJobTitle'),
            company_name:       getVal('salaryCompany'),
            offered_salary:     getVal('offeredSalary'),
            additional_context: getVal('salaryDetails') || null
        };
        try {
            const response = await fetch(`${API_BASE}/tools/salary-coach`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                displaySalaryResult(await response.json()); showAlert('Negotiation strategy generated!', 'success');
            } else if (response.status === 429) {
                showAlert('Rate limit exceeded. Maximum 5 coaching sessions per hour.', 'warning');
            } else {
                const errData = await response.json();
                showAlert(errData.message || errData.detail || 'Failed to generate strategy', response.status === 400 ? 'warning' : 'danger');
            }
        } catch (error) {
            console.error('Error:', error); showAlert('Failed to generate negotiation strategy. Please try again.', 'danger');
        } finally { hideLoading(); _toolSubmitting = false; }
    }

    /** @param {Record<string,unknown>} data */
    function displaySalaryResult(data) {
        // Market Analysis
        const ma = /** @type {Record<string,string>} */ (data['market_analysis'] ?? {});
        const maEl = document.getElementById('marketAnalysis');
        if (maEl) maEl.innerHTML = `
            <div class="salary-market-grid">
                <div class="salary-stat-card">
                    <div class="salary-stat-label"><i class="fas fa-chart-bar"></i>Assessment</div>
                    <div class="salary-stat-value">${escapeHtml(ma['salary_assessment'] ?? '')}</div>
                </div>
                <div class="salary-stat-card">
                    <div class="salary-stat-label"><i class="fas fa-map-marker-alt"></i>Market Position</div>
                    <div class="salary-stat-value">${escapeHtml(ma['market_position'] ?? '')}</div>
                </div>
                <div class="salary-stat-card salary-stat-card--highlight">
                    <div class="salary-stat-label"><i class="fas fa-bullseye"></i>Recommended Target</div>
                    <div class="salary-stat-value salary-stat-target">${escapeHtml(ma['recommended_target'] ?? '')}</div>
                </div>
                <div class="salary-stat-card">
                    <div class="salary-stat-label"><i class="fas fa-arrows-alt-h"></i>Negotiation Room</div>
                    <div class="salary-stat-value">${escapeHtml(ma['negotiation_room'] ?? '')}</div>
                </div>
            </div>`;

        // Strategy Overview
        const so = /** @type {Record<string,string>} */ (data['strategy_overview'] ?? {});
        const stratCard = document.getElementById('strategyCard');
        if (stratCard) {
            const confRaw = (so['confidence_level'] ?? '').toUpperCase();
            const confClass = confRaw.includes('HIGH') ? 'high' : confRaw.includes('LOW') ? 'low' : 'medium';
            stratCard.innerHTML = `
                <p class="salary-strategy-text">${escapeHtml(so['approach'] ?? '')}</p>
                <span class="salary-confidence-badge salary-confidence-badge--${escapeHtml(confClass)}">
                    <i class="fas fa-signal"></i>${escapeHtml(confRaw)}
                </span>`;
        }

        // Negotiation Script
        const script = /** @type {Record<string,string>} */ (data['main_script'] ?? {});
        const msEl = document.getElementById('mainScript');
        if (msEl) {
            const sections = /** @type {{label:string, key:string, icon:string}[]} */ ([
                { label: 'Opening',         key: 'opening',         icon: 'fas fa-door-open' },
                { label: 'Value Statement', key: 'value_statement', icon: 'fas fa-star' },
                { label: 'Counter Offer',   key: 'counter_offer',   icon: 'fas fa-comments-dollar' },
                { label: 'Closing',         key: 'closing',         icon: 'fas fa-handshake' }
            ]);
            msEl.innerHTML = sections.map(s => `
                <div class="salary-script-section">
                    <div class="salary-script-label"><i class="${escapeHtml(s.icon)}"></i>${escapeHtml(s.label)}</div>
                    <div class="salary-script-text">${escapeHtml(script[s.key] ?? '')}</div>
                </div>`).join('');
        }

        // Pushback Responses
        const pbEl = document.getElementById('pushbackResponses');
        if (pbEl) pbEl.innerHTML = (/** @type {Record<string,string>[]} */ (data['pushback_responses'] ?? [])).map(pb => `
            <div class="pushback-card">
                <div class="pushback-scenario">"${escapeHtml(pb['scenario'])}"</div>
                <div class="pushback-response">${escapeHtml(pb['response_script'])}</div>
            </div>`).join('');

        // Alternative Asks
        const altEl = document.getElementById('alternativeAsks');
        if (altEl) altEl.innerHTML = (/** @type {Record<string,string>[]} */ (data['alternative_asks'] ?? [])).map(a => {
            const lik = (a['likelihood'] ?? '').toLowerCase();
            const likClass = lik.includes('high') ? 'high' : lik.includes('low') ? 'low' : 'medium';
            return `<div class="alt-ask-card">
                <div class="alt-ask-left">
                    <div class="alt-ask-icon"><i class="fas fa-hand-holding-usd"></i></div>
                    <div class="alt-ask-info">
                        <div class="alt-ask-name">${escapeHtml(a['item'])}</div>
                        <div class="alt-ask-value">${escapeHtml(a['value'])}</div>
                    </div>
                </div>
                <span class="alt-ask-likelihood alt-ask-likelihood--${escapeHtml(likClass)}">${escapeHtml(a['likelihood'])} likelihood</span>
            </div>`;
        }).join('');

        // Dos and Don'ts
        const dnEl = /** @type {Record<string,string[]>} */ (data['dos_and_donts'] ?? {});
        const dosEl = document.getElementById('dosList');
        if (dosEl) dosEl.innerHTML = (dnEl['dos'] ?? []).map(d => `
            <div class="dos-item"><i class="fas fa-check"></i><span>${escapeHtml(String(d))}</span></div>`).join('');
        const dontEl = document.getElementById('dontsList');
        if (dontEl) dontEl.innerHTML = (dnEl['donts'] ?? []).map(d => `
            <div class="dont-item"><i class="fas fa-times"></i><span>${escapeHtml(String(d))}</span></div>`).join('');

        // Walk Away Point
        const waEl = document.getElementById('walkAwayPoint');
        if (waEl) waEl.innerHTML = `
            <div class="walk-away-card">
                <div class="walk-away-header"><i class="fas fa-door-open"></i>Walk Away Point</div>
                <div class="walk-away-text">${escapeHtml(String(data['walk_away_point'] ?? ''))}</div>
            </div>`;

        const out = document.getElementById('salaryOutput');
        if (out) { out.style.display = 'block'; out.scrollIntoView({ behavior: 'smooth' }); }
    }

    function copyAllScripts() {
        // @ts-ignore
        const app = window.app;
        // Extract each section's label + text cleanly, skipping icon nodes
        const container = document.getElementById('mainScript');
        const sections = container ? Array.from(container.querySelectorAll('.salary-script-section')) : [];
        const text = sections.map(section => {
            const label = /** @type {HTMLElement|null} */ (section.querySelector('.salary-script-label'));
            const body  = /** @type {HTMLElement|null} */ (section.querySelector('.salary-script-text'));
            // textContent of label includes the <i> icon (empty text) — trim it
            const labelText = (label?.textContent ?? '').trim();
            const bodyText  = (body?.textContent ?? '').trim();
            return `${labelText.toUpperCase()}\n${bodyText}`;
        }).join('\n\n');
        if (app && typeof app.copyToClipboard === 'function') { app.copyToClipboard(text); return; }
        navigator.clipboard.writeText(text)
            .then(() => notify('Script copied to clipboard!', 'success'))
            .catch(err => { console.error('Failed to copy:', err); notify('Failed to copy to clipboard', 'error'); });
    }

    function copyFollowupEmail() {
        const subjectText = (document.getElementById('followupSubject')?.textContent ?? '').trim();
        const bodyText    = (document.getElementById('followupEmailBody')?.textContent ?? '').trim();
        const parts = [];
        if (subjectText) parts.push(`Subject: ${subjectText}`);
        if (bodyText)    parts.push(bodyText);
        _clipboardWrite(parts.join('\n\n'), 'Email copied to clipboard!');
    }

    // Public API
    // @ts-ignore
    window.copyAllScripts    = copyAllScripts;
    // @ts-ignore
    window.copyFollowupEmail = copyFollowupEmail;
    // @ts-ignore
    window.copyThankYouNote      = copyThankYouNote;
    // @ts-ignore
    window.copyFollowUpTemplate  = copyFollowUpTemplate;
    // @ts-ignore
    window.copyReferenceEmail    = copyReferenceEmail;
    // @ts-ignore
    window.copyToClipboard   = copyToClipboard;
    // @ts-ignore
    window.showTool          = showTool;
    // @ts-ignore
    window.toggleJob3        = toggleJob3;

}());
