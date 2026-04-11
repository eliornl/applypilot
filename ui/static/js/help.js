(function () {
    'use strict';

    function logout() {
        // @ts-ignore
        if (window.app && typeof window.app.logout === 'function') { window.app.logout(); return; }
        ['authToken', 'access_token', 'token_type', 'user_data', 'profile_completed'].forEach(k => localStorage.removeItem(k));
        window.location.href = (window.APP_CONFIG && window.APP_CONFIG.loginUrl) || '/auth/login';
    }

    /** @param {HTMLElement} element */
    function toggleFAQ(element) {
        const item = element.parentElement;
        if (!item) return;
        const wasActive = item.classList.contains('active');

        document.querySelectorAll('.faq-item').forEach(i => {
            i.classList.remove('active');
        });

        if (!wasActive) {
            item.classList.add('active');
        }
    }

    function filterFAQ() {
        const searchInput = /** @type {HTMLInputElement|null} */ (document.getElementById('helpSearch'));
        const searchTerm = searchInput?.value.toLowerCase() ?? '';
        const items = document.querySelectorAll('.faq-item');

        items.forEach(i => {
            const item = /** @type {HTMLElement} */ (i);
            const question = (item.querySelector('.faq-question')?.textContent ?? '').toLowerCase();
            const answer   = (item.querySelector('.faq-answer')?.textContent ?? '').toLowerCase();

            if (question.includes(searchTerm) || answer.includes(searchTerm)) {
                item.style.display = 'block';
                if (searchTerm.length > 2) {
                    item.classList.add('active');
                }
            } else {
                item.style.display = searchTerm.length > 0 ? 'none' : 'block';
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        // Smooth scroll for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const href = anchor.getAttribute('href');
                const target = href ? document.querySelector(href) : null;
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });

        // FAQ accordion — replaces inline onclick="toggleFAQ(this)"
        document.querySelector('.faq-section')?.addEventListener('click', (e) => {
            const question = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('.faq-question'));
            if (question) toggleFAQ(question);
        });

        // Search — replaces inline onkeyup="filterFAQ()"
        document.getElementById('helpSearch')?.addEventListener('input', filterFAQ);

        // Logout button — replaces inline onclick="logout()"
        document.querySelector('[data-action="logout"]')?.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });

}());
