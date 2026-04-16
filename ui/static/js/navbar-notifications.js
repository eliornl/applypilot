/**
 * navbar-notifications.js
 *
 * Cross-page analysis completion notifications for dashboard subpages.
 * On the dashboard home, dashboard-home.js handles everything natively.
 *
 * Strategy:
 *   1. On page load — one quick status check per tracked session (catches completions
 *      that happened while the browser was closed).
 *   2. WebSocket — real-time; sets the badge the instant an analysis finishes while
 *      the user is browsing another page. No polling needed.
 *
 * localStorage keys:
 *   applypilot_tracked_sessions  — [{sessionId}] added on submit, removed on completion
 *   applypilot_badge             — '1' while a completed analysis hasn't been toasted yet
 *   applypilot_notified_analyses — managed by dashboard-home.js; read-only here
 */
(function () {
    'use strict';

    var TRACKED_KEY  = 'applypilot_tracked_sessions';
    var BADGE_KEY    = 'applypilot_badge';
    var NOTIFIED_KEY = 'applypilot_notified_analyses';

    var WS_MAX_RECONNECT = 5;
    var _ws = null;
    var _wsReconnectAttempts = 0;

    // -------------------------------------------------------------------------
    // Storage helpers
    // -------------------------------------------------------------------------

    /** @returns {Array<{sessionId:string}>} */
    function _getTracked() {
        try { return JSON.parse(localStorage.getItem(TRACKED_KEY) || '[]'); }
        catch (_e) { return []; }
    }

    /** @param {Array<{sessionId:string}>} list */
    function _saveTracked(list) {
        try { localStorage.setItem(TRACKED_KEY, JSON.stringify(list)); }
        catch (_e) {}
    }

    /** @param {string} sessionId */
    function _isAlreadyNotified(sessionId) {
        try {
            var list = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]');
            return list.includes(sessionId)
                || list.includes('c:' + sessionId)
                || list.includes('f:' + sessionId);
        } catch (_e) { return false; }
    }

    function _setBadge() {
        try { localStorage.setItem(BADGE_KEY, '1'); } catch (_e) {}
    }

    function _clearBadge() {
        try { localStorage.removeItem(BADGE_KEY); } catch (_e) {}
    }

    function _hasBadge() {
        return localStorage.getItem(BADGE_KEY) === '1';
    }

    // -------------------------------------------------------------------------
    // Badge dot UI
    // -------------------------------------------------------------------------

    function updateDot() {
        var show = _hasBadge();
        document.querySelectorAll('.nav-badge-dot').forEach(function (el) {
            if (show) el.classList.remove('is-hidden');
            else      el.classList.add('is-hidden');
        });
    }

    // -------------------------------------------------------------------------
    // Auth
    // -------------------------------------------------------------------------

    function _getAuthToken() {
        return localStorage.getItem('access_token') || localStorage.getItem('authToken') || '';
    }

    // -------------------------------------------------------------------------
    // One-shot load check (catches completions while browser was closed)
    // -------------------------------------------------------------------------

    async function _checkOnLoad() {
        var tracked = _getTracked();
        if (!tracked.length) return;

        var token = _getAuthToken();
        if (!token) return;

        var remaining = [];

        for (var i = 0; i < tracked.length; i++) {
            var sessionId = tracked[i].sessionId;
            if (_isAlreadyNotified(sessionId)) continue;

            try {
                var res = await fetch('/api/v1/workflow/status/' + encodeURIComponent(sessionId), {
                    headers: { Authorization: 'Bearer ' + token }
                });
                if (!res.ok) { remaining.push(tracked[i]); continue; }

                var data = await res.json();
                var status = String(data.status || '').toLowerCase();
                var done = ['completed', 'analysis_complete', 'awaiting_confirmation', 'failed'].includes(status);

                if (!done) remaining.push(tracked[i]);
                else { _setBadge(); updateDot(); }
            } catch (_e) {
                remaining.push(tracked[i]);
            }
        }

        _saveTracked(remaining);
    }

    // -------------------------------------------------------------------------
    // WebSocket — real-time completion events
    // -------------------------------------------------------------------------

    function connectWs() {
        var token = _getAuthToken();
        if (!token || typeof WebSocket === 'undefined') return;

        var proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        _ws = new WebSocket(proto + '://' + window.location.host + '/api/v1/ws/user?token=' + encodeURIComponent(token));

        _ws.onopen = function () { _wsReconnectAttempts = 0; };

        _ws.onmessage = function (event) {
            try {
                var msg = JSON.parse(event.data);

                // Broadcast every WS message as a CustomEvent so other page scripts
                // (e.g. application-detail.js) can react in real-time without polling.
                window.dispatchEvent(new CustomEvent('applypilot:ws', { detail: msg }));

                var type      = String(msg['type']       || '');
                var sessionId = String(msg['session_id'] || '');

                if (type !== 'workflow_complete' && type !== 'workflow_error') return;
                if (!sessionId || _isAlreadyNotified(sessionId)) return;

                _setBadge();
                updateDot();

                // Remove from tracked list — the WS beat any load-time check
                var remaining = _getTracked().filter(function (t) { return t.sessionId !== sessionId; });
                _saveTracked(remaining);
            } catch (_e) {}
        };

        _ws.onclose = function (event) {
            _ws = null;
            var noRetry = [1000, 1008, 4001];
            if (noRetry.includes(event.code) || _wsReconnectAttempts >= WS_MAX_RECONNECT) return;
            var delay = Math.min(1000 * Math.pow(2, _wsReconnectAttempts), 30000);
            _wsReconnectAttempts++;
            setTimeout(connectWs, delay);
        };

        _ws.onerror = function () {}; // onclose fires after onerror
    }

    // -------------------------------------------------------------------------
    // Init
    // -------------------------------------------------------------------------

    function init() {
        // Dashboard home handles everything natively — clear badge and exit
        if (window.location.pathname === '/dashboard') {
            _clearBadge();
            updateDot();
            return;
        }

        updateDot();
        _checkOnLoad();
        connectWs();

        // Sync badge if another tab (e.g. the dashboard) clears or sets it
        window.addEventListener('storage', function (e) {
            if (e.key === BADGE_KEY || e.key === NOTIFIED_KEY) updateDot();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exposed so dashboard-home.js can clear the badge after showing toasts
    window.clearNavBadge = function () {
        _clearBadge();
        updateDot();
    };
}());
