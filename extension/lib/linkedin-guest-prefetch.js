/**
 * MAIN world — runs before the isolated extractor (see popup / service worker).
 * Fetches jobs-guest JSON into sessionStorage; isolated script shares sessionStorage with the tab.
 */
(function applyPilotLinkedInGuestPrefetch() {
  'use strict';

  async function run() {
    var jid = '';
    try {
      jid = new URL(location.href).searchParams.get('currentJobId') || '';
    } catch (e0) {
      return;
    }
    if (!jid || !/^\d+$/.test(jid)) return;

    var url =
      'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/' +
      encodeURIComponent(jid);

    try {
      var res = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json,text/plain,*/*',
          Referer: location.href
        }
      });

      var txt = await res.text();
      try {
        sessionStorage.setItem(
          'jaa_li_guest_meta_' + jid,
          JSON.stringify({
            status: res.status,
            ok: res.ok,
            len: txt ? txt.length : 0,
            ts: Date.now()
          })
        );
        sessionStorage.setItem('jaa_li_guest_body_' + jid, txt || '');
      } catch (se) {
        /* quota */
      }
    } catch (e1) {
      try {
        sessionStorage.setItem('jaa_li_guest_err_' + jid, String(e1 && e1.message ? e1.message : e1));
      } catch (se2) {
        /* ignore */
      }
    }
  }

  run();
})();
